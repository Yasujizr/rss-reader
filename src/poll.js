// Copyright 2014 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

// TODO: use sessionStorage.POLL_ACTIVE instead of localStorage?
// That was I do not perma-lock-out polling in event of an error
// during poll.

'use strict';

var lucu = lucu || {};

lucu.poll = {};

lucu.poll.start = function() {

  if(localStorage.POLL_ACTIVE) {
    console.debug('Poll already in progress');
    return;
  }

  if(!navigator.onLine) {
    console.debug('Cannot poll while offline');
    return;
  }

  localStorage.POLL_ACTIVE = '1';

  // TODO: i think the trick to moving out the nested functions is
  // to make these bindable. But these are passed by value. By shoving
  // these into an object, I can pass it around like a token that represents
  // shared state. Call it something like 'context' or 'pollProgress'

  var totalEntriesAdded = 0, feedCounter = 0, totalEntriesProcessed = 0;
  var feedCounter = 0;

  var getAll = lucu.poll.getAllFeeds.bind(this, onGetAllFeeds);
  lucu.database.open(getAll);

  // TODO: move function out of here
  function onGetAllFeeds(feeds) {
    feedCounter = feeds.length;
    if(feedCounter === 0) {
      return pollCompleted();
    }

    // TODO: move function out of here
    // NOTE: if we put feed as final arg, we can just bind directly
    feeds.forEach(function(feed) {
      lucu.poll.fetchAndUpdateFeed(feed, onFeedProcessed, onFeedProcessed);
    });
  }

  // TODO: move function out of here
  function onFeedProcessed(processedFeed, entriesProcessed, entriesAdded) {
    totalEntriesProcessed += entriesProcessed || 0;
    totalEntriesAdded += entriesAdded || 0;
    feedCounter--;
    if(feedCounter < 1) {
      pollCompleted();
    }
  }

  // TODO: move function out of here
  function pollCompleted() {
    delete localStorage.POLL_ACTIVE;
    localStorage.LAST_POLL_DATE_MS = String(Date.now());

    chrome.runtime.sendMessage({
      type: 'pollCompleted',
      feedsProcessed: feedCounter,
      entriesAdded: totalEntriesAdded,
      entriesProcessed: totalEntriesProcessed
    });
  }
};

lucu.poll.getAllFeeds = function(onComplete, db) {
  getAllFeeds(db, onComplete);
};

// Fetches and updates the local feed.
lucu.poll.fetchAndUpdateFeed = function(localFeed, oncomplete, onerror) {

  var args = {};
  args.url = localFeed.url;
  args.oncomplete = lucu.poll.onFetchFeed.bind(this, localFeed, oncomplete);
  args.onerror = onerror;

  // TODO: timeout and entryTimeout should be derived
  // from feed properties, not hardcoded
  args.timeout = 20 * 1000;
  args.entryTimeout = 20 * 1000;

  args.augmentEntries = true;
  args.augmentImageData = true;
  args.rewriteLinks = true;

  lucu.feed.fetch(args);
};

lucu.poll.onFetchFeed = function(localFeed, onComplete, remoteFeed) {
  remoteFeed.fetched = Date.now();
  lucu.database.open(lucu.poll.updateFeed.bind(this, localFeed,
    remoteFeed, onComplete));
};

lucu.poll.updateFeed = function(localFeed, remoteFeed, onComplete, db) {
  updateFeed(db, localFeed, remoteFeed, onComplete);
};

lucu.poll.unlock = function() {
  delete localStorage.POLL_ACTIVE;
};
