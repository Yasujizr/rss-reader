// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

// Entry related functionality

const Entry = {};

Entry.Flags = {
  UNREAD: 0,
  READ: 1,
  UNARCHIVED: 0,
  ARCHIVED: 1
};

// TODO: this is only ever called by poll.js, maybe just move it there
// TODO: i can't think of when I ever update instead of just insert entries,
// so maybe this should just be deprecated and I should just have an insert
// function instead, and that function should be tailored to ignore the
// update case (e.g. less worry about whether fields are defined in certain
// ways).
// TODO: maybe make a separate private helper function that prepares the
// entry for storage, as opposed to doing it all in a single function?
// TODO: maybe the prepareEntryForStorage function should be its own global
// function and the caller has the responsibility of preparation and then the
// only concern of this function is to do an update?
// TODO: make sure pubdate has a consistent value. I am using
// date.getTime here, but I am not sure I am using the same
// or similar every where else. Like in poll denormalize
// TODO: rename pubdate to something clearer, like datePublished or something
// to that effect.
// TODO: I should be using Date objects for date values. Not timestamps.
Entry.put = function(connection, entry, callback) {
  const storable = {};

  if(entry.id) {
    storable.id = entry.id;
  }

  // TODO: this should be a URL object, somewhere I am forgetting to do this
  // I think

  if(entry.feedLink) {
    const feedLinkValueType = Object.prototype.toString.call(entry.feedLink);
    if(feedLinkValueType === '[object URL]') {
      // Convert to string because indexedDB cannot store URL objects
      console.debug('Serializing feed link', entry.feedLink.href);
      storable.feedLink = entry.feedLink.href;
    } else {
      console.debug('Using string feed link', entry.feedLink);
      storable.feedLink = entry.feedLink;
    }
  }

  if(entry.feedTitle) {
    storable.feedTitle = entry.feedTitle;
  }

  if(entry.feed) {
    storable.feed = entry.feed;
  }

  // Store link url as a string
  if(entry.link) {
    storable.link = entry.link.href;
  }

  if(entry.urls && entry.urls.length) {
    storable.urls = entry.urls;
  }

  // Cannot use entry.readState as part of condition here, 0 may be one
  // of its valid values and still mean something is set
  if('readState' in entry) {
    storable.readState = entry.readState;
  } else {
    storable.readState = Entry.Flags.UNREAD;
  }

  if('dateRead' in entry && entry.dateRead) {
    storable.dateRead = entry.dateRead;
  }

  if('author' in entry && entry.author) {
    storable.author = entry.author;
  }

  if('title' in entry && entry.title) {
    storable.title = entry.title;
  }

  // TODO: the pubdate field should be named datePublished so as to be
  // consistent with other field names
  // TODO: store a Date object instead of a timestamp
  if('pubdate' in entry && entry.pubdate) {
    const date = new Date(entry.pubdate);
    if(utils.date.isValid(date)) {
      storable.pubdate = date.getTime();
    }
  }

  // TODO: rename to dateCreated
  // TODO: store a Date object instead of a timestamp
  if('created' in entry && entry.created) {
    storable.created = entry.created;
  } else {
    storable.created = Date.now();
  }

  if('content' in entry && entry.content) {
    storable.content = entry.content;
  }

  if('archiveState' in entry) {
    storable.archiveState = entry.archiveState;
  } else {
    storable.archiveState = Entry.Flags.UNARCHIVED;
  }

  // Use an isolated transaction for storing an entry. The problem with using a
  // shared transaction in the case of a batch insert is that the uniqueness
  // check from index constraints is db-delegated and unknown apriori without a
  // separate lookup request, and that any constraint failure causes the entire
  // transaction to fail.
  const transaction = connection.transaction('entry', 'readwrite');
  transaction.oncomplete = callback;
  const store = transaction.objectStore('entry');
  store.put(storable);
};

// Marks the entry with the corresponding entryId as read in storage.
Entry.markAsRead = function(connection, entryId) {
  const transaction = connection.transaction('entry', 'readwrite');
  const store = transaction.objectStore('entry');
  const request = store.openCursor(entryId);
  request.onsuccess = onOpenCursor;

  function onOpenCursor(event) {
    const request = event.target;
    const cursor = request.result;

    // No matching entry found
    if(!cursor) {
      return;
    }

    const entry = cursor.value;

    if(entry.readState === Entry.Flags.READ) {
      console.debug('Attempted to remark a read entry as read:', entry.id);
      return;
    }

    entry.readState = Entry.Flags.READ;
    entry.dateRead = new Date();

    // Trigger an update request. Do not wait for it to complete.
    const updateRequest = cursor.update(entry);

    // NOTE: while this occurs concurrently with the update request,
    // it involves a separate read transaction that is implicitly blocked by
    // the current readwrite request, so it still occurs afterward.
    const connection = request.transaction.db;
    utils.updateBadgeUnreadCount(connection);

    // Notify listeners that an entry was read.
    // NOTE: this happens async. The entry may not yet be updated.
    const entryReadMessage = {'type': 'entryRead', 'entryId': entry.id};
    chrome.runtime.sendMessage(entryReadMessage);
  }
};
