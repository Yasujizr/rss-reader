// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

// @param connection {IDBDatabase} an open database connection
// @param feed {Feed} the feed to add
// @param callback {Function} optional callback passed the stored object and
// its post stored auto-incremented id
function addFeed(connection, feed, callback) {

  // Ensure that the id property is not present, or this will cause an error
  // when calling store.add
  // TODO: maybe this should be an asserted pre-condition?
  if(feed.id) {
    if(callback) {
      callback({'type': 'IdentifiedFeedError'});
    }
    return;
  }

  // TODO: this would be easier if I sanitized first, and sanitize returned
  // a new Feed object, and then I serialized the sanitized object
  let storableFeed = feed.serialize();
  storableFeed = Feed.prototype.sanitize.call(storableFeed);
  storableFeed.dateCreated = new Date();

  console.debug('Adding feed', storableFeed);

  const transaction = connection.transaction('feed', 'readwrite');
  const store = transaction.objectStore('feed');
  const request = store.add(storableFeed);

  // Only bind listeners if the optional callback is present
  if(callback) {
    request.onsuccess = onAddSuccess;
    request.onerror = onAddError;
  }

  function onAddSuccess(event) {
    // Now introduce the id generated by indexedDB's auto-increment feature
    storableFeed.id = event.target.result;

    callback({'type': 'success', 'feed': storableFeed});
  }

  function onAddError(event) {
    console.error(event);
    callback({'type': event.target.error.name});
  }
}
