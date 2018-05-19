import {refresh_badge} from '/src/badge.js';
import {db_write_feed} from '/src/db/db-write-feed.js';
import {append_entry_url, create_entry} from '/src/entry.js';
import {append_feed_url, coerce_feed, create_feed, is_feed} from '/src/feed.js';
import {fetch_feed} from '/src/fetch.js';
import * as feed_parser from '/src/lib/feed-parser.js';
import {list_is_empty, list_peek} from '/src/lib/list.js';
import * as url_loader from '/src/lib/url-loader.js';
import {notify} from '/src/notify.js';
import {poll_entry} from '/src/poll/poll-entry.js';

export async function poll_feed(
    rconn, iconn, channel, console, options = {}, feed) {
  const ignore_recency_check = options.ignore_recency_check;
  const recency_period = options.recency_period;
  const badge_update = options.badge_update;
  const notify_flag = options.notify;
  const deactivation_threshold = options.deactivation_threshold;
  const fetch_feed_timeout = options.fetch_feed_timeout;

  if (!is_feed(feed)) {
    throw new TypeError('feed is not a feed type ' + feed);
  }

  // Although this is borderline a programmer error, tolerate location-less
  // feed objects and simply ignore them
  if (list_is_empty(feed.urls)) {
    console.warn('Attempted to poll feed missing url', feed);
    return 0;
  }

  const tail_url = new URL(list_peek(feed.urls));

  if (!feed.active) {
    console.debug('Ignoring inactive feed', tail_url.href);
    return 0;
  }

  console.log('Polling feed "%s"', feed.title, tail_url.href);

  // Exit if the feed was checked too recently
  if (!ignore_recency_check && feed.dateFetched) {
    const current_date = new Date();
    const elapsed_ms = current_date - feed.dateFetched;

    if (elapsed_ms < 0) {
      console.warn('Feed somehow polled in future?', tail_url.href);
      return 0;
    }

    if (elapsed_ms < recency_period) {
      console.debug('Feed polled too recently', tail_url.href);
      return 0;
    }
  }

  const response = await fetch_feed(tail_url, fetch_feed_timeout);
  if (!response.ok) {
    console.debug(
        'Error fetching feed', tail_url.href, response.status,
        response.statusText);
    const error_type = 'fetch';
    await handle_error(
        rconn, channel, response.status, feed, error_type,
        deactivation_threshold);
    return 0;
  }

  // TODO: move this block into its own function, something like
  // try-parse-feed-helper, return undefined if should exit due to error
  // TODO: there should be a way to parse without an error occurring, because
  // parse errors are not programming errors just bad data, this requires
  // overhauling parse-feed though

  const response_text = await response.text();
  const skip_entries = false, resolve_urls = true;
  let parsed_feed;
  try {
    parsed_feed = feed_parser.parse(response_text, skip_entries, resolve_urls);
  } catch (error) {
    console.debug('Error parsing feed', tail_url.href, error);
    let status;
    const error_type = 'parse';
    await handle_error(
        rconn, channel, status, feed, error_type, deactivation_threshold);
    return 0;
  }

  const response_url = new URL(response.url);
  const resp_lmd = new Date(response.headers.get('Last-Modified'));
  const fetch_info = {
    request_url: tail_url,
    response_url: response_url,
    response_last_modified_date: resp_lmd
  };

  const coerced_feed = coerce_feed(parsed_feed, fetch_info);
  const merged_feed = merge_feed(feed, coerced_feed);
  handle_fetch_success(merged_feed);

  const update_context = {};
  update_context.conn = rconn;
  update_context.channel = channel;
  update_context.console = console;

  const update_options = {};
  update_options.validate = true;
  update_options.sanitize = true;
  update_options.set_date_updated = true;

  const stored_feed =
      await db_write_feed.call(update_context, merged_feed, update_options);

  const count = await poll_entries(
      rconn, iconn, channel, console, options, parsed_feed.entries,
      stored_feed);

  if (badge_update && count) {
    refresh_badge(rconn, console).catch(console.error);
  }

  if (notify_flag && count) {
    const title = 'Added articles';
    const message =
        'Added ' + count + ' articles for feed ' + stored_feed.title;
    notify(title, message);
  }

  return count;
}

async function poll_entries(
    rconn, iconn, channel, console, options, entries, feed) {
  const feed_url_string = list_peek(feed.urls);

  console.debug(
      'Processing %d entries for feed', entries.length, feed_url_string);

  const coerced_entries = entries.map(coerce_entry);
  entries = dedup_entries(coerced_entries);

  // Propagate feed properties to entries
  for (const entry of entries) {
    entry.feed = feed.id;
    entry.feedTitle = feed.title;
    entry.faviconURLString = feed.faviconURLString;

    if (feed.datePublished && !entry.datePublished) {
      entry.datePublished = feed.datePublished;
    }
  }

  const pec = {};
  pec.rconn = rconn;
  pec.iconn = iconn;
  pec.channel = channel;
  pec.console = console;
  pec.fetch_html_timeout = options.fetch_html_timeout;
  pec.fetch_image_timeout = options.fetch_image_timeout;

  const proms = entries.map(poll_entry, pec);
  const entry_ids = await Promise.all(proms);
  const count = entry_ids.reduce((sum, v) => v ? sum + 1 : sum, 0);
  return count;
}

function merge_feed(old_feed, new_feed) {
  const merged_feed = Object.assign(create_feed(), old_feed, new_feed);
  merged_feed.urls = [...old_feed.urls];
  if (new_feed.urls) {
    for (const url_string of new_feed.urls) {
      append_feed_url(merged_feed, new URL(url_string));
    }
  }

  return merged_feed;
}

function handle_fetch_success(feed) {
  if ('errorCount' in feed) {
    if (typeof feed.errorCount === 'number') {
      if (feed.errorCount > 0) {
        feed.errorCount--;
        return true;
      }
    } else {
      delete feed.errorCount;
      return true;
    }
  }
  return false;
}

// TODO: should accept console param
async function handle_error(
    rconn, channel, status, feed, type, deactivation_threshold) {
  // Ignore ephemeral errors
  if (status === url_loader.STATUS_TIMEOUT ||
      status === url_loader.STATUS_OFFLINE) {
    return;
  }

  // TEMPORARY DEBUGGING
  console.debug(
      'Incremented error count for feed', feed.title, feed.errorCount);

  // Init or increment
  feed.errorCount = Number.isInteger(feed.errorCount) ? feed.errorCount + 1 : 1;

  // Auto-deactivate on threshold breach
  if (feed.errorCount > deactivation_threshold) {
    feed.active = false;
    feed.deactivationReasonText = type;
    feed.deactivationDate = new Date();
  }

  const update_context = {};
  update_context.conn = rconn;
  update_context.channel = channel;
  update_context.console = console;

  const update_options = {};
  // TODO: why validate? have we not had control the entire time, and have no
  // new user data?
  update_options.validate = true;
  // In this situation the feed's properties were not polluted by new external
  // data, and we maintained control over of the object for its lifetime from
  // read to write, so there is no need to sanitize on storage
  // TODO: verify the claim of no-pollution, have some anxiety this is called
  // with new data, in some sense I have to make it an
  // expectation/characteristic of the handle_error function itself then
  update_options.sanitize = false;
  update_options.set_date_updated = true;

  await db_write_feed.call(update_context, feed, update_options);
}

function dedup_entries(entries) {
  const distinct_entries = [];
  const seen_url_strings = [];

  for (const entry of entries) {
    if (list_is_empty(entry.urls)) {
      distinct_entries.push(entry);
      continue;
    }

    let url_is_seen = false;
    for (const url_string of entry.urls) {
      if (seen_url_strings.includes(url_string)) {
        url_is_seen = true;
        break;
      }
    }

    if (!url_is_seen) {
      distinct_entries.push(entry);
      seen_url_strings.push(...entry.urls);
    }
  }

  return distinct_entries;
}

// Reformat a parsed entry as a storable entry. The input object is cloned so as
// to avoid modification of input (purity).
// NOTE: I moved this out of entry.js because this has knowledge of both
// parse-format and storage-format. entry.js should be naive regarding parse
// format. This is a cross-cutting concern so it belongs in the place where the
// concerns meet.
function coerce_entry(parsed_entry) {
  const blank_entry = create_entry();

  // Copy over everything
  const clone = Object.assign(blank_entry, parsed_entry);

  // Then convert the link property to a url in the urls property
  delete clone.link;
  if (parsed_entry.link) {
    try {
      append_entry_url(clone, new URL(parsed_entry.link));
    } catch (error) {
    }
  }

  return clone;
}