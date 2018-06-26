import * as favicon from '/src/action/favicon/favicon.js';
import * as app from '/src/app.js';
import * as array from '/src/lib/array.js';
import assert from '/src/lib/assert.js';
import {fetch_feed} from '/src/lib/net/fetch-feed.js';
import {url_did_change} from '/src/lib/net/url-did-change.js';
import * as sanity from '/src/model-sanity.js';

// TODO: implement create-feed in the model access layer, and use that here
// instead of update-feed

// Subscribe to a feed
// @param dal {ModelAccess} an open ModelAccess instance
// @param iconn {IDBDatabase} an open icon database connection
// @param url {URL} the url to subscribe
// @param should_notify {Boolean} whether to send a notification
// @param fetch_timeout {Number} fetch timeout
// @error database errors, type errors, fetch errors, etc
// @return {Promise} resolves to the feed object stored in the database
export async function subscribe(dal, iconn, url, fetch_timeout, should_notify) {
  // Before storing a new feed, subscribing grabs the full data of the remote
  // feed by fetching it from the network. It is assumed that if the caller
  // wants to subscribe instead of just directly inserting a new feed in the
  // model that they want the benefit of the full data, which is not yet known.
  // The implicit fetch of the full data is the built-in convenience of calling
  // subscribe over just create-feed; it is the main value proposition, this
  // precomposed action sequence that involves less boilerplate and a bit of
  // abstraction. But before hitting up the network for data, check the local
  // model for whether we are already subscribed. This is done using a separate
  // transaction (the read transaction here is not shared with the readwrite
  // transaction of update-feed) because we want to fetch the feed prior
  // inserting the feed, but indexedDB does not allow for interleaved
  // asynchronous calls (such as to fetch). This is done, despite being
  // redundant with the constraint error caused by the unique flag on the url
  // index when later calling update-feed, because it is preferable to spam the
  // database with requests instead of spamming the network.
  // IMPLICIT: forward model errors to caller
  let existing_feed = await dal.getFeed('url', url, true);
  if (existing_feed) {
    // Match the error type thrown by indexedDB for constraint errors
    throw new DOMException('Already subscribed ' + url.href);
  }

  // Fetch, parse, and coerce the remote feed. Rethrow any errors.
  // Entries are excluded because it takes too long to process them on initial
  // subscribe.
  const response = await fetch_feed(url, fetch_timeout, true, false);
  const feed = response.feed;
  const res_url = new URL(array.peek(feed.urls));

  // If we redirected, check if the redirect url exists in the model. This is
  // again done using a separate transaction, even though there is no following
  // interleaved async call, simply because of convenience and consistency.
  if (url_did_change(url, res_url)) {
    existing_feed = await dal.getFeed('url', res_url, true);
    if (existing_feed) {
      throw new Error('Already subscribed ' + res_url.href);
    }
  }

  if (!sanity.is_valid_feed(feed)) {
    throw new Error('Invalid feed ' + JSON.stringify(feed));
  }

  if (iconn) {
    const url = favicon.create_lookup_url(feed);
    let doc = undefined;
    const fetch = false;
    feed.faviconURLString = await favicon.lookup(iconn, url, doc, fetch);
  }

  sanity.sanitize_feed(feed);

  // Update the model. Note that even though we checked for existing before,
  // this can still fail with a constraint error, because we are using separate
  // transactions which allows for concurrent database changes to sneak in
  await dal.updateFeed(feed);

  // TODO: I wonder if it makes more sense to only do this subsequent operation
  // in a message handler

  if (should_notify) {
    const title = 'Subscribed!';
    const feed_title = feed.title || array.peek(feed.urls);
    const message = 'Subscribed to ' + feed_title;
    app.show_notification(title, message, feed.faviconURLString);
  }

  return feed;
}

export function unsubscribe(dal, feed_id) {
  return dal.deleteFeed(feed_id, 'unsubscribe');
}