// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

{ // Begin file block scope

// @param feed a basic object representing a feed
// @param options {Object} optional object containing optional callback
// and optional open connection
function subscribe(feed, options) {
  const feedURLString = rdr.feed.getURL(feed);
  if(!feedURLString) {
    throw new TypeError('feed should always have at least one url');
  }
  console.log('Subscribing to', feedURLString);

  const context = {
    'feed': feed,
    'didSubscribe': false,
    'shouldCloseDB': false,
    'shouldNotify': true
  };

  if(options) {
    context.callback = options.callback;
    if(options.suppressNotifications) {
      context.shouldNotify = false;
    }
    context.db = options.connection;
  }

  if(context.db) {
    findFeed.call(context);
  } else {
    context.shouldCloseDB = true;
    rdr.openDB(onOpenDB.bind(context));
  }
}

function onOpenDB(db) {
  if(db) {
    this.db = db;
    findFeed.call(this);
  } else {
    onSubscribeComplete.call(this, {'type': 'ConnectionError'});
  }
}

// Before involving any network overhead, check if already subscribed. This
// check will implicitly happen again later when inserting the feed into the
// database, so it is partially redundant, but it can reduce the amount of
// processing in the common case.
// This uses a separate transaction from the eventual add request, because
// it is not recommended to have a long running transaction, and the amount of
// work that has to occur between this exists check and the add request takes
// a somewhat indefinite period of time, given network latency.
// This does involve a race condition if calling subscribe concurrently on
// the same url, but its impact is limited. The latter http request will use
// the cached page, and the latter call will fail with a ConstraintError when
// trying to add the feed.
function findFeed() {

  // TODO: i should be fully normalizing feed url

  const feedURLString = rdr.feed.getURL(this.feed);
  console.debug('Checking if subscribed to', feedURLString);
  const transaction = this.db.transaction('feed');
  const store = transaction.objectStore('feed');
  const index = store.index('urls');
  const request = index.get(feedURLString);
  request.onsuccess = findFeedOnSuccess.bind(this);
  request.onerror = findFeedOnError.bind(this);
}

function findFeedOnSuccess(event) {
  const feedURL = rdr.feed.getURL(this.feed);

  // Cannot resubscribe to an existing feed
  if(event.target.result) {
    console.debug('Already subscribed to', feedURL);
    onSubscribeComplete.call(this, {'type': 'ConstraintError'});
    return;
  }

  // Subscribe while offline
  if('onLine' in navigator && !navigator.onLine) {
    rdr.feed.add(this.db, this.feed, onAddFeed.bind(this));
    return;
  }

  // Proceed with online subscription
  const shouldExcludeEntries = true;
  const feedURLObject = new URL(feedURL);
  rdr.feed.fetch(feedURLObject, shouldExcludeEntries, onFetchFeed.bind(this));
}

function findFeedOnError(event) {
  onSubscribeComplete.call(this, {'type': 'FindQueryError'});
}

function onFetchFeed(event) {
  if(event.type !== 'success') {
    if(event.type === 'InvalidMimeType') {
      onSubscribeComplete.call(this, {'type': 'FetchMimeTypeError'});
    } else {
      onSubscribeComplete.call(this, {'type': 'FetchError'});
    }

    return;
  }

  this.feed = rdr.feed.merge(this.feed, event.feed);
  const urlString = this.feed.link ? this.feed.link :
    rdr.feed.getURL(this.feed);
  const urlObject = new URL(urlString);
  const doc = null;
  const verbose = false;
  rdr.favicon.lookup(urlObject, doc, verbose, onLookupFavicon.bind(this));
}

function onLookupFavicon(iconURLObject) {
  if(iconURLObject) {
    this.feed.faviconURLString = iconURLObject.href;
  }

  rdr.feed.add(this.db, this.feed, onAddFeed.bind(this));
}

function onAddFeed(event) {
  if(event.type === 'success') {
    this.didSubscribe = true;
    onSubscribeComplete.call(this, {'type': 'success', 'feed': event.feed});
  } else {
    onSubscribeComplete.call(this, {'type': event.type});
  }
}

function onSubscribeComplete(event) {
  if(this.shouldCloseDB && this.db) {
    this.db.close();
  }

  if(this.shouldNotify && this.didSubscribe) {
    // Use the sanitized feed object
    const feed = event.feed;
    const displayString = feed.title ||  rdr.feed.getURL(feed);
    const message = 'Subscribed to ' + displayString;
    rdr.showDesktopNotification('Subscription complete', message,
      feed.faviconURLString);
  }

  if(this.callback) {
    this.callback(event);
  }
}

var rdr = rdr || {};
rdr.subscribe = subscribe;

} // End file block scope
