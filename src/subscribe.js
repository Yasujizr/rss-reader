// See license.md

'use strict';

{

function subscribe(conn, feed, suppressNotifications, verbose, callback) {
  if(!Feed.getURL(feed)) {
    throw new TypeError('feed missing url');
  }

  const log = new LoggingService();
  log.enabled = verbose;
  log.log('Subscribing to', Feed.getURL(feed));

  const ctx = {
    'feed': feed,
    'didSubscribe': false,
    'shouldCloseDB': false,
    'log': log,
    'suppressNotifications': suppressNotifications,
    'callback': callback,
    'conn': conn
  };

  if(conn) {
    findFeed.call(ctx);
  } else {
    ctx.shouldCloseDB = true;
    const feedDb = new FeedDb();
    feedDb.open(openDBOnSuccess.bind(ctx), openDBOnError.bind(ctx));
  }
}

function openDBOnSuccess(event) {
  this.log.log('Connected to database');
  this.conn = event.target.result;
  findFeed.call(this);
}

function openDBOnError(event) {
  this.log.error(event.target.error);
  onComplete.call(this, {'type': 'ConnectionError'});
}

// TODO: normalize feed url
function findFeed() {
  const feedURLString = Feed.getURL(this.feed);
  this.log.log('Checking if subscribed to', feedURLString);
  const tx = this.conn.transaction('feed');
  const store = tx.objectStore('feed');
  const index = store.index('urls');
  const request = index.get(feedURLString);
  request.onsuccess = findFeedOnSuccess.bind(this);
  request.onerror = findFeedOnError.bind(this);
}

function findFeedOnSuccess(event) {
  const feedURL = Feed.getURL(this.feed);

  // Cannot resubscribe to an existing feed
  if(event.target.result) {
    console.debug('Already subscribed to', feedURL);
    onComplete.call(this, {'type': 'ConstraintError'});
    return;
  }

  // Subscribe while offline
  if('onLine' in navigator && !navigator.onLine) {
    addFeed(this.conn, this.feed, false, onAddFeed.bind(this));
    return;
  }

  // Proceed with online subscription
  const requestURL = new URL(feedURL);
  const excludeEntries = true;
  const verbose = false;
  fetchFeed(requestURL, excludeEntries, verbose, onFetchFeed.bind(this));
}

function findFeedOnError(event) {
  this.log.error(event.target.error);
  onComplete.call(this, {'type': 'FindQueryError'});
}

function onFetchFeed(event) {
  if(event.type !== 'success') {
    this.log.log('fetch error');
    if(event.type === 'InvalidMimeType') {
      onComplete.call(this, {'type': 'FetchMimeTypeError'});
    } else {
      onComplete.call(this, {'type': 'FetchError'});
    }
    return;
  }

  this.feed = Feed.merge(this.feed, event.feed);

  const cache = new FaviconCache();
  const urlString = this.feed.link ? this.feed.link : Feed.getURL(this.feed);
  const urlObject = new URL(urlString);
  const doc = null;
  const verbose = false;
  lookupFavicon(cache, urlObject, doc, verbose, onLookupIcon.bind(this));
}

function onLookupIcon(iconURL) {
  if(iconURL) {
    this.feed.faviconURLString = iconURL.href;
  }

  addFeed(this.conn, this.feed, false, onAddFeed.bind(this));
}

function onAddFeed(event) {
  if(event.type === 'success') {
    this.log.log('stored new feed');
    this.didSubscribe = true;
    onComplete.call(this, {'type': 'success', 'feed': event.feed});
  } else {
    onComplete.call(this, {'type': event.type});
  }
}

function onComplete(event) {
  if(this.shouldCloseDB && this.conn) {
    this.log.log('requesting database to close');
    this.conn.close();
  }

  if(!this.suppressNotifications && this.didSubscribe) {
    // Grab data from the sanitized feed instead of the input
    const feed = event.feed;
    const displayString = feed.title ||  Feed.getURL(feed);
    const message = 'Subscribed to ' + displayString;
    rdr.notifications.show('Subscription complete', message,
      feed.faviconURLString);
  }

  if(this.callback) {
    this.callback(event);
  }
}

this.subscribe = subscribe;

}
