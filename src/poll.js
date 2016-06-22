// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

// TODO: rather than simply storing entries, I should be somehow inserting
// entries into an unread queue, so that it is easy for the view to load
// entries in an order such as by most recently published, or from oldest or
// newest. Right now I am stuck with logical storage order, which is
// limiting. I would rather do this here than at the time of querying for
// articles to display, because it is too difficult to get the sorting of
// the articles to work correctly. Although maybe I could just ensure that
// every entries date published defaults to today, and then use an index
// on date published, read state, and archive state.

const FeedPoller = Object.create(null);

FeedPoller.start = function() {
  console.log('Starting poll ...');

  const context = {
    'pendingFeedsCount': 0,
    'connection': null
  };

  if('onLine' in navigator && !navigator.onLine) {
    console.log('Polling canceled because offline');
    FeedPoller.onMaybePollCompleted(context);
    return;
  }

  // NOTE: untested because connection.navigator is undefined
  // NOTE: dead branch because currently no way to set NO_POLL_METERED
  if('NO_POLL_METERED' in localStorage && navigator.connection &&
    navigator.connection.metered) {
    console.log('Polling canceled on metered connection');
    FeedPoller.onMaybePollCompleted(context);
    return;
  }

  if('ONLY_POLL_IF_IDLE' in localStorage) {
    const IDLE_PERIOD_SECONDS = 60;
    chrome.idle.queryState(IDLE_PERIOD_SECONDS, onQueryIdleState);
  } else {
    db.open(onOpenDatabase);
  }

  function onQueryIdleState(state) {
    if('ONLY_POLL_IF_IDLE' in localStorage) {
      if(state === 'locked' || state === 'idle') {
        db.open(onOpenDatabase);
      } else {
        console.log('Polling canceled because not idle');
        FeedPoller.onMaybePollCompleted(context);
      }
    } else {
      db.open(onOpenDatabase);
    }
  }

  function onOpenDatabase(event) {
    if(event.type !== 'success') {
      console.debug(event);
      FeedPoller.onMaybePollCompleted(context);
      return;
    }

    const connection = event.target.result;
    context.connection = connection;

    // TODO: load all feeds into an array first, then iterate over the array,
    // instead of iterating the cursor
    db.openFeedsCursor(connection, onOpenFeedsCursor);
  }

  function onOpenFeedsCursor(event) {
    if(event.type !== 'success') {
      FeedPoller.onMaybePollCompleted(context);
      return;
    }

    const cursor = event.target.result;
    if(!cursor) {
      FeedPoller.onMaybePollCompleted(context);
      return;
    }

    context.pendingFeedsCount++;
    const feed = cursor.value;
    const urls = feed.urls;
    const requestURL = new URL(urls[urls.length - 1]);
    const fetchTimeout = 10 * 1000;
    const excludeEntries = false;
    const onFetchFeedBound = onFetchFeed.bind(null, feed);
    fetchFeed(requestURL, fetchTimeout, excludeEntries, onFetchFeedBound);
    cursor.continue();
  }

  function onFetchFeed(localFeed, fetchEvent) {
    if(fetchEvent.type !== 'load') {
      context.pendingFeedsCount--;
      FeedPoller.onMaybePollCompleted(context);
      return;
    }

    const remoteFeed = fetchEvent.feed;
    if(localFeed.dateLastModified && remoteFeed.dateLastModified &&
      localFeed.dateLastModified.getTime() ===
      remoteFeed.dateLastModified.getTime()) {
      context.pendingFeedsCount--;
      FeedPoller.onMaybePollCompleted(context);
      return;
    }

    const mergedFeed = FeedPoller.createMergedFeed(localFeed, remoteFeed);
    const entries = remoteFeed.entries;
    const onUpdateFeed = FeedPoller.onUpdateFeed.bind(null, context, entries,
      mergedFeed);
    db.updateFeed(context.connection, mergedFeed, onUpdateFeed);
  }
};

FeedPoller.createMergedFeed = function(localFeed, remoteFeed) {

  // Prep a string property of an object for storage
  // TODO: maybe this should be a db function or something
  // TODO: maybe do the sanitization externally, explicitly
  function sanitizeString(inputString) {
    let outputString = inputString;
    if(inputString) {
      outputString = filterControlCharacters(outputString);
      outputString = replaceHTML(outputString, '');
      // Condense whitespace
      // TODO: maybe this should be a utils function
      outputString = outputString.replace(/\s+/, ' ');
      outputString = outputString.trim();
    }
    return outputString;
  }

  const outputFeed = Object.create(null);
  outputFeed.id = localFeed.id;
  outputFeed.type = remoteFeed.type;

  outputFeed.urls = [].concat(localFeed.urls);
  const remoteURLs = remoteFeed.urls;

  for(let url of remoteURLs) {
    let urlString = url.href;
    if(!outputFeed.urls.includes(urlString)) {
      outputFeed.urls.push(urlString);
    }
  }

  // NOTE: title is semi-required. It must be defined, although it can be
  // an empty string. It must be defined because of how views query and
  // iterate over the feeds in the store using title as an index. If it were
  // ever undefined those feeds would not appear in the title index.
  // TODO: remove this requirement somehow? Maybe the options page that
  // retrieves feeds has to manually sort them?
  const title = sanitizeString(remoteFeed.title) || localFeed.title || '';
  outputFeed.title = title;

  const description = sanitizeString(remoteFeed.description);
  if(description) {
    outputFeed.description = description;
  } else {
    outputFeed.description = localFeed.description;
  }

  if(remoteFeed.link) {
    outputFeed.link = remoteFeed.link.href;
  } else {
    outputFeed.link = localFeed.link;
  }

  outputFeed.datePublished = remoteFeed.datePublished;
  outputFeed.dateFetched = remoteFeed.dateFetched;
  outputFeed.dateLastModified = remoteFeed.dateLastModified;
  outputFeed.dateCreated = localFeed.dateCreated || new Date();
  return outputFeed;
};

FeedPoller.onMaybePollCompleted = function(context) {
  // If there is still pending work we are not actually done
  if(context.pendingFeedsCount) {
    return;
  }

  console.log('Polling completed');
  localStorage.LAST_POLL_DATE_MS = '' + Date.now();

  if(localStorage.SHOW_NOTIFICATIONS) {
    const notification = {
      'type': 'basic',
      'title': chrome.runtime.getManifest().name,
      'iconUrl': '/images/rss_icon_trans.gif',
      'message': 'Updated articles'
    };
    chrome.notifications.create('Lucubrate', notification, function() {});
  }
};

// NOTE: feed is now the stored feed, which contains strings not urls
// However, entries is still the fetched entries array, which contains
// URL objects.
FeedPoller.onUpdateFeed = function(context, entries, feed, event) {
  if(event.type !== 'success') {
    console.error(event);
    context.pendingFeedsCount--;
    FeedPoller.onMaybePollCompleted(context);
    return;
  }

  const numEntries = entries.length;

  // If there are no entries then we are done processing the feed
  if(!numEntries) {
    context.pendingFeedsCount--;
    FeedPoller.onMaybePollCompleted(context);
    return;
  }

  // Process the fetched feed's entries.
  // TODO: test again using Set for distinctLinks
  // TODO: use for .. of
  const distinctLinks = Object.create(null);
  let entriesProcessed = 0;
  for(let i = 0, j = 0, entry, linkURL, seen = false; i < numEntries; i++) {

    entry = entries[i];

    if(!entry.urls.length) {
      onEntryProcessed();
      continue;
    }

    seen = false;
    for(j = 0; j < entry.urls.length; j++) {
      if(entry.urls[j].href in distinctLinks) {
        seen = true;
        break;
      }
    }

    if(seen) {
      onEntryProcessed();
      continue;
    }

    for(j = 0; j < entry.urls.length; j++) {
      distinctLinks[entry.urls[j].href] = 1;
    }

    FeedPoller.processEntry(context, feed, entry, onEntryProcessed);
  }

  function onEntryProcessed(optionalAddEntryEvent) {
    entriesProcessed++;

    if(entriesProcessed === numEntries) {
      context.pendingFeedsCount--;
      FeedPoller.onMaybePollCompleted(context);
      updateBadgeUnreadCount(context.connection);
    }
  }
};

FeedPoller.processEntry = function(context, feed, entry, callback) {

  // Associate the entry with its feed
  // TODO: rename this to something clearer, like feedId
  entry.feed = feed.id;

  // Denormalize link and title so that rendering can avoid these lookups
  // NOTE: feed.link is a URL string, because feed comes from the feed object
  // that was stored
  entry.feedLink = feed.link;
  entry.feedTitle = feed.title;

  // TODO: do I want to check if any of the entry's URLs exist, or just its
  // most recent one?

  // Check whether an entry with the url already exists. Grab the last url
  // in the entry's urls array. entry.urls provides URL objects, not strings,
  // because fetchFeed converts them into URL objects.
  const entryURL = entry.urls[entry.urls.length - 1];
  const connection = context.connection;
  db.findEntryWithURL(connection, entryURL, onFindEntryWithURL);

  function onFindEntryWithURL(event) {
    if(event.type !== 'success') {
      callback();
      return;
    }

    if(event.target.result) {
      callback();
      return;
    }

    if(FeedPoller.isNoFetchEntryURL(entryURL)) {
      FeedPoller.addEntry(context.connection, entry, callback);
      return;
    }

    const path = entryURL.pathname;
    if(path && path.length > 5 && /\.pdf$/i.test(path)) {
      FeedPoller.addEntry(context.connection, entry, callback);
      return;
    }

    // TODO: create a fetchHTML function, use that instead

    const fetchTimeoutMillis = 15 * 1000;
    const fetchRequest = new XMLHttpRequest();
    fetchRequest.timeout = fetchTimeoutMillis;
    fetchRequest.ontimeout = onFetchEntry;
    fetchRequest.onerror = onFetchEntry;
    fetchRequest.onabort = onFetchEntry;
    fetchRequest.onload = onFetchEntry;
    const doAsyncFetchRequest = true;
    fetchRequest.open('GET', entryURL.href, doAsyncFetchRequest);
    fetchRequest.responseType = 'document';
    fetchRequest.send();
  }

  function onFetchEntry(event) {
    if(event.type !== 'load') {
      console.debug(event);
      FeedPoller.addEntry(context.connection, entry, callback);
      return;
    }

    const fetchRequest = event.target;
    const document = fetchRequest.responseXML;
    if(!document) {
      FeedPoller.addEntry(context.connection, entry, callback);
      return;
    }

    const responseURL = new URL(fetchRequest.responseURL);
    if(responseURL.href !== entryURL.href) {
      entry.urls.push(responseURL);
    }

    transformLazilyLoadedImages(document);
    filterSourcelessImages(document);
    URLResolver.resolveURLsInDocument(document, responseURL.href);
    filterTrackingImages(document);
    setImageElementDimensions(document, onSetImageDimensions);
  }

  // Possibly replace the content property of the remoteEntry with the
  // fetched and cleaned full text, then store the entry.
  // TODO: maybe I should be checking the content of body. In fact if
  // there is no body element, maybe this shouldn't even be replacing
  // entry.content at all. Maybe documentElement is the wrong thing
  // to consider. Maybe I want to check body but use the full content
  // of documentElement.
  // Also, maybe I want to use an substitute message.
  function onSetImageDimensions(document, fetchStats) {
    const documentElement = document.documentElement;
    if(documentElement) {
      const fullDocumentHTMLString = documentElement.outerHTML;
      if(fullDocumentHTMLString) {
        const trimmedFullDocumentHTMLString = fullDocumentHTMLString.trim();
        if(trimmedFullDocumentHTMLString) {
          entry.content = trimmedFullDocumentHTMLString;
        }
      }
    }

    FeedPoller.addEntry(context.connection, entry, callback);
  }
};

// TODO: eventually this should delegate most of its functionality to
// Entry.toSerializable
FeedPoller.addEntry = function(connection, entry, callback) {
  const storable = Object.create(null);

  // entry.feedLink is a URL string, not an object, because it was copied
  // over from the feed object that was the input to db.updateFeed
  if(entry.feedLink) {
    storable.feedLink = entry.feedLink;
  }

  if(entry.feedTitle) {
    storable.feedTitle = entry.feedTitle;
  }

  // TODO: rename the property 'feed' to 'feedId'
  storable.feed = entry.feed;

  // entry.urls is an array of URL objects. Each must be serialized because
  // indexedDB cannot store URL objects and because serializing a URL
  // normalizes the url.
  // TODO: use Array.prototype.map ?
  storable.urls = [];
  for(let url of entry.urls) {
    storable.urls.push(url.href);
  }

  storable.readState = db.EntryFlags.UNREAD;
  storable.archiveState = db.EntryFlags.UNARCHIVED;

  if(entry.author) {
    storable.author = entry.author;
  }

  if(entry.title) {
    storable.title = entry.title;
  }

  if(entry.datePublished) {
    storable.datePublished = entry.datePublished;
  }

  if(entry.content) {
    storable.content = entry.content;
  }

  db.addEntry(connection, storable, callback);
};

FeedPoller.isNoFetchEntryURL = function(url) {
  const blacklist = [
    'productforums.google.com',
    'groups.google.com',
    // Forbes uses a Continue page preventing crawling
    // url normalization currently does not do anything with www. prefix so
    // i have to check both
    'www.forbes.com',
    'forbes.com'
  ];
  const hostNameString = url.hostname;
  for(let blacklistedHostNameString of blacklist) {
    if(blacklistedHostNameString === hostNameString) {
      return true;
    }
  }
  return false;
};
