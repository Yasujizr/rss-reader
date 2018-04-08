import * as color from '/src/lib/color/color.js';
import * as html_parser from '/src/lib/html-parser/html-parser.js';
import {rewrite_url} from '/src/lib/rewrite-url/rewrite-url.js';
import * as sniff from '/src/lib/sniff/sniff.js';
import * as url_loader from '/src/lib/url-loader/url-loader.js';
import {entry_append_url, entry_has_url, entry_is_valid_id, entry_peek_url} from '/src/objects/entry.js';
import {create_entry} from '/src/ops/create-entry.js';
import {find_entry_id_by_url} from '/src/ops/find-entry-id-by-url.js';
import {rdr_fetch_html} from '/src/ops/rdr-fetch-html.js';
import {rdr_lookup_icon} from '/src/ops/rdr-lookup-icon.js';
import {rdr_transform_document} from '/src/ops/rdr-transform-document.js';

const rewrite_rules = build_rewrite_rules();

const INACCESSIBLE_CONTENT_DESCRIPTORS = [
  {pattern: /forbes\.com$/i, reason: 'interstitial-advert'},
  {pattern: /productforums\.google\.com/i, reason: 'script-generated'},
  {pattern: /groups\.google\.com/i, reason: 'script-generated'},
  {pattern: /nytimes\.com$/i, reason: 'paywall'},
  {pattern: /heraldsun\.com\.au$/i, reason: 'requires-cookies'},
  {pattern: /ripe\.net$/i, reason: 'requires-cookies'}
];

export async function rdr_poll_entry(entry) {
  if (!entry_has_url(entry)) {
    return;
  }

  entry_rewrite_tail_url(entry, rewrite_rules);
  if (await entry_exists(this.rconn, entry)) {
    return;
  }

  const response = await fetch_entry(entry, this.fetch_html_timeout);
  if (await handle_entry_redirect(this.rconn, entry, response, rewrite_rules)) {
    return;
  }

  const document = await parse_response(response);
  update_entry_title(entry, document);
  await update_entry_icon(this.iconn, this.console, entry, document);
  await update_entry_content(
      entry, document, this.console, this.fetch_image_timeout);

  const stored_entry =
      await create_entry(this.rconn, this.channel, this.console, entry);
  return stored_entry.id;
}

async function handle_entry_redirect(rconn, entry, response, rewrite_rules) {
  if (!response) {
    return false;
  }

  const request_url = new URL(entry_peek_url(entry));
  const response_url = new URL(response.url);
  if (!url_loader.url_did_change(request_url, response_url)) {
    return false;
  }

  entry_append_url(entry, response_url);
  entry_rewrite_tail_url(entry, rewrite_rules);
  return await entry_exists(rconn, entry);
}

function entry_rewrite_tail_url(entry, rewrite_rules) {
  const tail_url = new URL(entry_peek_url(entry));
  const new_url = rewrite_url(tail_url, rewrite_rules);
  if (!new_url) {
    return false;
  }
  return entry_append_url(entry, new_url);
}

async function entry_exists(rconn, entry) {
  const url = new URL(entry_peek_url(entry));
  const id = await find_entry_id_by_url(rconn, url);
  return entry_is_valid_id(id);
}

// TODO: i think this should always return a response, so instead of returning
// undefined if not augmentable, return a stub error promise
// TODO: undecided, but maybe augmentability is not this function's concern?
async function fetch_entry(entry, fetch_html_timeout) {
  const url = new URL(entry_peek_url(entry));
  if (url_is_augmentable(url)) {
    const response = await rdr_fetch_html(url, fetch_html_timeout);
    if (response.ok) {
      return response;
    }
  }
}

function url_is_augmentable(url) {
  return url_is_http(url) && sniff.classify(url) !== sniff.BINARY_CLASS &&
      !url_is_inaccessible_content(url);
}

function url_is_inaccessible_content(url) {
  for (const desc of INACCESSIBLE_CONTENT_DESCRIPTORS) {
    if (desc.pattern && desc.pattern.test(url.hostname)) {
      return true;
    }
  }
  return false;
}

function url_is_http(url) {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

async function parse_response(response) {
  if (!response) {
    return;
  }

  const response_text = await response.text();

  try {
    return html_parser.parse(response_text);
  } catch (error) {
  }
}

function update_entry_title(entry, document) {
  if (document && !entry.title) {
    const title_element = document.querySelector('html > head > title');
    if (title_element) {
      entry.title = title_element.textContent;
    }
  }
}

async function update_entry_icon(iconn, console, entry, document) {
  const lookup_url = new URL(entry_peek_url(entry));
  const skip_fetch = true;
  const icon_url_string =
      await rdr_lookup_icon(iconn, console, skip_fetch, lookup_url);
  if (icon_url_string) {
    entry.faviconURLString = icon_url_string;
  }
}

async function update_entry_content(
    entry, document, console, fetch_image_timeout) {
  if (!document) {
    try {
      document = html_parser.parse(entry.content);
    } catch (error) {
      entry.content = 'Bad formatting (unsafe HTML redacted)';
      return;
    }
  }

  const document_url = new URL(entry_peek_url(entry));
  const opts = {
    fetch_image_timeout: fetch_image_timeout,
    matte: color.WHITE,
    min_contrast_ratio: localStorage.MIN_CONTRAST_RATIO,
    emphasis_length_max: 200
  };

  await rdr_transform_document(document, document_url, console, opts);
  entry.content = document.documentElement.outerHTML;
}

function build_rewrite_rules() {
  const rules = [];
  rules.push(google_news_rule);
  rules.push(techcrunch_rule);
  return rules;
}

function google_news_rule(url) {
  if (url.hostname === 'news.google.com' && url.pathname === '/news/url') {
    const param = url.searchParams.get('url');
    try {
      return new URL(param);
    } catch (error) {
    }
  }
}

function techcrunch_rule(url) {
  if (url.hostname === 'techcrunch.com' && url.searchParams.has('ncid')) {
    const output = new URL(url.href);
    output.searchParams.delete('ncid');
    return output;
  }
}