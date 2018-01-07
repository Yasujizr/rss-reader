import assert from "/src/common/assert.js";
import {CheckedError} from "/src/common/errors.js";
import formatString from "/src/common/format-string.js";
import * as IndexedDbUtils from "/src/common/indexeddb-utils.js";
import * as PromiseUtils from "/src/common/promise-utils.js";
import {replaceTags, truncateHTML} from "/src/common/html-utils.js";
import * as Status from "/src/common/status.js";
import FaviconLookup from "/src/favicon/lookup.js";
import * as Entry from "/src/feed-store/entry.js";
import * as FeedStoreErrors from "/src/feed-store/errors.js";
import * as Feed from "/src/feed-store/feed.js";
import sizeof from "/src/feed-store/sizeof.js";
import updateBadgeText from "/src/update-badge-text.js";

const DEBUG = false;
const dprintf = DEBUG ? console.debug : function(){};

export default function FeedStore() {
  this.name = 'reader';
  this.version = 24;
  this.timeout = 500;

  // private IDBDatabase handle
  this.conn = null;
}

FeedStore.prototype.open = async function() {
  if(this.isOpen()) {
    return Status.EINVALIDSTATE;
  }

  const [status, conn] = await IndexedDbUtils.open(this.name, this.version, onUpgradeNeeded,
    this.timeout);
  this.conn = conn;
  return status;
};

// Helper for open. Does the database upgrade. This should never be
// called directly. To do an upgrade, call open with a higher version number.
function onUpgradeNeeded(event) {
  const conn = event.target.result;
  const tx = event.target.transaction;
  let feedStore, entryStore;
  const stores = conn.objectStoreNames;

  console.log('upgrading database %s to version %s from version', conn.name, conn.version,
    event.oldVersion);

  if(event.oldVersion < 20) {
    feedStore = conn.createObjectStore('feed', {keyPath: 'id', autoIncrement: true});
    entryStore = conn.createObjectStore('entry', {keyPath: 'id', autoIncrement: true});
    feedStore.createIndex('urls', 'urls', {multiEntry: true, unique: true});

    entryStore.createIndex('readState', 'readState');
    entryStore.createIndex('feed', 'feed');
    entryStore.createIndex('archiveState-readState', ['archiveState', 'readState']);
    entryStore.createIndex('urls', 'urls', {multiEntry: true, unique: true});
  } else {
    feedStore = tx.objectStore('feed');
    entryStore = tx.objectStore('entry');
  }

  if(event.oldVersion < 21) {
    // Add magic to all older entries
    addEntryMagic(tx);
  }

  if(event.oldVersion < 22) {
    addFeedMagic(tx);
  }

  if(event.oldVersion < 23) {
    // Delete the title index in feed store. It is no longer in use. Because it is no longer
    // created, and the db could be at any prior version, ensure that it exists before calling
    // deleteIndex to avoid the FeedStoreErrors.NotFoundError deleteIndex throws when deleting a non-existent index.

    // @type {DOMStringList}
    const indices = feedStore.indexNames;
    if(indices.contains('title')) {
      console.debug('deleting title index of feed store as part of upgrade');
      feedStore.deleteIndex('title');
    } else {
      console.debug('no title index found to delete during upgrade past version 22');
    }
  }

  if(event.oldVersion < 24) {
    // Version 24 adds an 'active' field to feeds. All existing feeds do not have an active
    // field. So all existing feeds must be modified to have an active property that is default
    // to true. It defaults to true because prior to this change, all feeds were presumed active.
    addActiveFieldToFeeds(feedStore);
  }
}

// Expects the transaction to be writable (either readwrite or versionchange)
function addEntryMagic(tx) {
  console.debug('Adding entry magic');
  const store = tx.objectStore('entry');
  const getAllEntriesRequest = store.getAll();
  getAllEntriesRequest.onerror = function(event) {
    console.warn('Error adding entry magic', getAllEntriesRequest.error);
  };
  getAllEntriesRequest.onsuccess = function(event) {
    const entries = event.target.result;
    writeEntriesWithMagic(store, entries);
  };
}

function writeEntriesWithMagic(entryStore, entries) {
  for(const entry of entries) {
    entry.magic = Entry.ENTRY_MAGIC;
    entry.dateUpdated = new Date();
    entryStore.put(entry);
  }
}

function addFeedMagic(tx) {
  console.debug('Adding feed magic');
  const store = tx.objectStore('feed');
  const getAllFeedsRequest = store.getAll();
  getAllFeedsRequest.onerror = function(event) {
    console.warn('Error adding feed magic', getAllFeedsRequest.error);
  };
  getAllFeedsRequest.onsuccess = function(event) {
    const feeds = event.target.result;
    for(const feed of feeds) {
      feed.magic = Feed.FEED_MAGIC;
      feed.dateUpdated = new Date();
      store.put(feed);
    }
  }
}

function addActiveFieldToFeeds(feedStore) {
  console.debug('Adding active property to feeds');
  const feedsRequest = feedStore.getAll();
  feedsRequest.onerror = function(event) {
    console.warn('Database error getting all feeds', feedsRequest.error);
  };

  feedsRequest.onsuccess = function(event) {
    const feeds = event.target.result;
    for(const feed of feeds) {
      console.debug('Marking feed %d as active as part of upgrade', feed.id);
      feed.active = true;
      feed.dateUpdated = new Date();
      feedStore.put(feed);
    }
  };
}

FeedStore.prototype.isOpen = function() {
  return IndexedDbUtils.isOpen(this.conn);
};

FeedStore.prototype.close = function() {
  IndexedDbUtils.close(this.conn);
  // The conn property must be unset to allow for calling open again without triggering an assert
  // Undefine rather than delete to maintain v8 hidden shape
  this.conn = void this.conn;
};

FeedStore.prototype.activateFeed = async function(feedId) {
  assert(this.isOpen());
  assert(Feed.isValidId(feedId));

  const feed = await this.findFeedById(feedId);
  assert(Feed.isFeed(feed));
  dprintf('Found feed to activate', feed.id);
  if(feed.active === true) {
    dprintf('Feed with id %d is already active', feed.id);
    return false;
  }

  feed.active = true;
  // Here we do not care about maintaining object shape, and furthermore, want to reduce object
  // size, so delete is preferred over setting to undefined.
  delete feed.deactivationReasonText;
  delete feed.deactivationDate;
  feed.dateUpdated = new Date();
  await this.putFeed(feed);
  return true;
};

// @param channel {BroadcastChannel} optional, notify observers of new entries
// @return {Number} the id of the added entry
FeedStore.prototype.addEntry = async function(entry, channel) {
  assert(Entry.isEntry(entry));
  assert(this.isOpen());
  const sanitized = sanitizeEntry(entry);
  const storable = filterEmptyProps(sanitized);
  storable.readState = Entry.STATE_UNREAD;
  storable.archiveState = Entry.STATE_UNARCHIVED;
  storable.dateCreated = new Date();
  const newEntryId = await this.putEntry(storable);
  if(channel) {
    // TODO: the message format should be defined externally
    const message = {type: 'entry-added', id: newEntryId};
    channel.postMessage(message);
  }

  return newEntryId;
};


// Returns a new entry object where fields have been sanitized. Impure
// TODO: now that filterUnprintableCharacters is a thing, I want to also filter such
// characters from input strings like author/title/etc. However it overlaps with the
// call to filterControls here. There is some redundant work going on. Also, in a sense,
// filterControls is now inaccurate. What I want is one function that strips binary
// characters except important ones, and then a second function that replaces or removes
// certain important binary characters (e.g. remove line breaks from author string).
// Something like 'replaceFormattingCharacters'.
function sanitizeEntry(inputEntry, authorMaxLength, titleMaxLength, contentMaxLength) {
  assert(Entry.isEntry(inputEntry));

  if(typeof authorMaxLength === 'undefined') {
    authorMaxLength = 200;
  }

  if(typeof titleMaxLength === 'undefined') {
    titleMaxLength = 1000;
  }

  if(typeof contentMaxLength === 'undefined') {
    contentMaxLength = 50000;
  }

  assert(Number.isInteger(authorMaxLength) && authorMaxLength >= 0);
  assert(Number.isInteger(titleMaxLength) && titleMaxLength >= 0);
  assert(Number.isInteger(contentMaxLength) && contentMaxLength >= 0);

  const blankEntry = Entry.createEntry();
  const outputEntry = Object.assign(blankEntry, inputEntry);

  if(outputEntry.author) {
    let author = outputEntry.author;
    author = filterControls(author);
    author = replaceTags(author, '');
    author = condenseWhitespace(author);
    author = truncateHTML(author, authorMaxLength);
    outputEntry.author = author;
  }

  if(outputEntry.content) {
    let content = outputEntry.content;
    content = filterUnprintableCharacters(content);
    content = truncateHTML(content, contentMaxLength);
    outputEntry.content = content;
  }

  if(outputEntry.title) {
    let title = outputEntry.title;
    title = filterControls(title);
    title = replaceTags(title, '');
    title = condenseWhitespace(title);
    title = truncateHTML(title, titleMaxLength);
    outputEntry.title = title;
  }

  return outputEntry;
}

function condenseWhitespace(string) {
  return string.replace(/\s{2,}/g, ' ');
}

// Returns a promise that resolves to a count of unread entries in the database
// Throws an unchecked error if the database is closed or invalid.
// Throws a checked error if a database error occurs.
FeedStore.prototype.countUnreadEntries = function() {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    const tx = this.conn.transaction('entry');
    const store = tx.objectStore('entry');
    const index = store.index('readState');
    const request = index.count(Entry.STATE_UNREAD);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

FeedStore.prototype.deactivateFeed = async function(feedId, reason) {
  assert(this.isOpen());
  assert(Feed.isValidId(feedId));
  const feed = await this.findFeedById(feedId);
  assert(Feed.isFeed(feed));

  if(feed.active === false) {
    dprintf('Tried to deactivate inactive feed', feed.id);
    return false;
  }

  feed.active = false;
  if(typeof reason === 'string') {
    feed.deactivationReasonText = reason;
  }
  const currentDate = new Date();
  feed.deactivationDate = currentDate;
  feed.dateUpdated = currentDate;
  await store.putFeed(feed);
  return true;
};

// TODO: if performance eventually becomes a material concern this should probably interact
// directly with the database
FeedStore.prototype.findActiveFeeds = async function() {
  assert(this.isOpen());
  const feeds = await this.getAllFeeds();
  return feeds.filter(isActiveFeed);
};

function isActiveFeed(feed) {
  // Explicitly test whether the active property is defined and of boolean type. This is just
  // an extra sanity check in case the property gets clobbered somewhere. But rather than a full
  // on assert I do not handle the error explicitly and consider the feed as inactive. What this
  // means is that if I ever see no feeds being loaded but I know they exist, this is probably
  // the reason.
  return feed.active === true;
}

FeedStore.prototype.findEntries = function(predicate, limit) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    assert(typeof predicate === 'function');
    const limited = typeof limit !== 'undefined';
    if(limited) {
      assert(Number.isInteger(limit) && limit >= 0);
      assert(limit > 0);
    }

    const entries = [];
    const tx = this.conn.transaction('entry');
    tx.onerror = function(event) {
      reject(tx.error);
    };
    tx.oncomplete = function(event) {
      resolve(entries);
    };

    const store = tx.objectStore('entry');
    const request = store.openCursor();
    request.onsuccess = function(event) {
      const cursor = event.target.result;
      if(cursor) {
        const entry = cursor.value;
        if(predicate(entry)) {
          entries.push(entry);
          if(limited && entries.length === limit) {
            return;
          }
        }
        cursor.continue();
      }
    };
  });
};

// Searches for and returns an entry object matching the id
// @param entryId {Number} id of entry to find
// @returns {Promise} a promise that resolves to an entry object, or undefined if no matching entry
// was found
FeedStore.prototype.findEntryById = function(entryId) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    assert(Entry.isValidId(entryId));
    const tx = this.conn.transaction('entry');
    const store = tx.objectStore('entry');
    const request = store.get(entryId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Returns an entry id matching url
// @param url {URL}
FeedStore.prototype.findEntryIdByURL = function(url) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    assert(url instanceof URL);
    const tx = this.conn.transaction('entry');
    const store = tx.objectStore('entry');
    const index = store.index('urls');
    const request = index.getKey(url.href);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Returns true if the feed store contains an entry with the given url
FeedStore.prototype.containsEntryWithURL = async function(url) {
  assert(url instanceof URL);
  const id = await this.findEntryIdByURL(url);
  return Entry.isValidId(id);
};

// Returns a promise that resolves to an array of entry ids that are associated with the given
// feed id. Throws an unchecked error if the connection is invalid or not open, or if the feed id
// is invalid. Throws a checked error if a database error occurs.
// @param feedId {Number} the id of a feed in the database
// @return {Promise}
FeedStore.prototype.findEntryIdsByFeedId = function(feedId) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    assert(Feed.isValidId(feedId));
    const tx = this.conn.transaction('entry');
    const store = tx.objectStore('entry');
    const index = store.index('feed');
    const request = index.getAllKeys(feedId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Searches the feed store in the database for a feed corresponding to the given id. Returns a
// promise that resolves to the matching feed. Returns a promise that resolves to undefined if
// no matching feed is found. Throws an unchecked error if the database is closed or the id is
// not a valid feed id. Throws a checked error if there is a problem running the query.
// @param id {Number} a feed id
// @return {Promise}
FeedStore.prototype.findFeedById = function(feedId) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    assert(Feed.isValidId(feedId));
    const tx = this.conn.transaction('feed');
    const store = tx.objectStore('feed');
    const request = store.get(feedId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Returns feed id if a feed with the given url exists in the database
// @param url {URL}
// @return {Promise}
FeedStore.prototype.findFeedIdByURL = function(url) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    assert(url instanceof URL);
    const tx = this.conn.transaction('feed');
    const store = tx.objectStore('feed');
    const index = store.index('urls');
    const request = index.getKey(url.href);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

FeedStore.prototype.containsFeedWithURL = async function(url) {
  assert(url instanceof URL);
  const id = this.findFeedIdByURL(url);
  return Feed.isValidId(id);
};

// Loads entries from the database that are for viewing
// Specifically these are entries that are unread, and not archived
// TODO: look into using getAll again
FeedStore.prototype.findViewableEntries = function(offset, limit) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    const entries = [];
    let counter = 0;
    let advanced = false;
    const limited = limit > 0;
    const tx = this.conn.transaction('entry');
    tx.oncomplete = function txOnComplete(event) {
      resolve(entries);
    };
    tx.onerror = function txOnError(event) {
      reject(tx.error);
    };

    const store = tx.objectStore('entry');
    const index = store.index('archiveState-readState');
    const keyPath = [Entry.STATE_UNARCHIVED, Entry.STATE_UNREAD];
    const request = index.openCursor(keyPath);
    request.onsuccess = function requestOnsuccess(event) {
      const cursor = event.target.result;
      if(cursor) {
        if(offset && !advanced) {
          advanced = true;
          cursor.advance(offset);
        } else {
          entries.push(cursor.value);
          if(limited && ++counter < limit) {
            cursor.continue();
          }
        }
      }
    };
  });
};

// Returns a promise that resolves to an array of feed ids, or rejects with a database error
FeedStore.prototype.getAllFeedIds = function() {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    const tx = this.conn.transaction('feed');
    const store = tx.objectStore('feed');
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Load all feeds from the database
// Returns a promise that resolves to an array of feed objects
FeedStore.prototype.getAllFeeds = function() {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    const tx = this.conn.transaction('feed');
    const store = tx.objectStore('feed');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

FeedStore.prototype.markEntryAsRead = async function(entryId) {
  assert(this.isOpen());
  assert(Entry.isValidId(entryId));

  const entry = await this.findEntryById(entryId);
  assert(Entry.isEntry(entry));

  if(entry.readState === Entry.STATE_READ) {
    const message = formatString('Entry %d already in read state', entryId);
    throw new FeedStoreErrors.InvalidStateError(message);
  }

  assert(Entry.hasURL(entry));
  const url = Entry.peekURL(entry);
  dprintf('Found entry to mark as read', entryId, url);
  entry.readState = Entry.STATE_READ;
  entry.dateRead = entry.dateUpdated;
  entry.dateUpdated = new Date();
  await this.putEntry(entry);
  dprintf('Marked entry as read', entryId, url);

  // TODO: This is bad, a circular dependency. This is a symptom of a more severe lack of
  // forward planning and organization. The basic gist is that I need to decide if markEntryAsRead
  // and similar storage functions should be able to interact with the extension. In this case
  // trigger a side effect that is extension wide. The problem is basically that I think this
  // belongs here. Marking an entry as read in storage should update the number of unread entries
  // displayed in the badge as an obvious side effect. Or should it? I never really decided.
  // It would be kind of easy to not do this here, and shift the burden to the caller. But then
  // this invites the mistake of not performing this expected subsequent action. The two changes
  // are intricately linked and decoupling here is a mistake. In some sense this should have no
  // knowledge of the extension. Maybe what should be happening is that this should be sending
  // out a message to the 'reader' channel that an entry was marked as read. Then, some external
  // listener is responsible. I dunno though, that feels like I am just dumping an extra layer
  // of complexity on what should otherwise be a straightforward operation. This just really is
  // not well thought out.

  // Previously this made sense. markEntryAsRead operated in a layer above storage as an app
  // action, like a controller that mediated between the view and the model. That higher level
  // operation depended on both storage and the extension. It was the
  // sole caller of the storage function that marks the entry as read. And by acting as the sole
  // caller, the sole channel through which to instruct, it coupled the effects and guaranteed
  // both. So maybe I should revert to that.

  // On the other hand, I dunno. I go back to the question of whether changes to the database
  // should have an obvious and immediate side effect on other parts of the extension. Because
  // they kind of should? But maybe what I should do instead is clarify an state confidently that
  // storage is not concerned with the rest of the extension at all. it is only concerned with
  // storing things. if i separate the concerns that way it kind of makes sense? but this is kind
  // of what I don't like. This concern of modifying the badge text is directly linked to the
  // state change. I am separating a concern by basically spreading the concern over two layers.
  // Ewww. Right?

  // http://www.micheltriana.com/blog/2012/04/09/library-oriented-architecture
  // Basically I think the database module should just care about storing data. Some higher level
  // api is concerned with mixing together database storage with everything else.
  // So this is an example of improper mixing of concerns. It pretty clearly explains the
  // cause of the circulary dependency too.
  // So while it was convenient to store this function (and similar ones that work with channels)
  // here, that should have been done somewhere else. The database should not have anything to
  // do with channels. So I need a new intermediate layer above the database that performs
  // several of theses actions PLUS the rest, instead of trying to do it all in this storage layer.

  updateBadgeText();
};

FeedStore.prototype.putEntry = function(entry) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    assert(Entry.isEntry(entry));
    const tx = this.conn.transaction('entry', 'readwrite');
    const store = tx.objectStore('entry');
    const request = store.put(entry);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Returns a feed object suitable for use with putFeed
FeedStore.prototype.prepareFeed = function(feed) {
  assert(Feed.isFeed(feed));
  let prepped = sanitizeFeed(feed);
  prepped = filterEmptyProps(prepped);
  return prepped;
};

// Resolves with request.result. If put is an add this resolves with the auto-incremented id.
// This stores the object as is. The caller is responsible for properties like feed magic,
// feed id, feed active status, date updated, etc.
FeedStore.prototype.putFeed = function(feed) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    assert(Feed.isFeed(feed));
    const tx = this.conn.transaction('feed', 'readwrite');
    const store = tx.objectStore('feed');
    const request = store.put(feed);
    request.onsuccess = () => {
      const feedId = request.result;
      resolve(feedId);
    };
    request.onerror = () => reject(request.error);
  });
};

const DEFAULT_TITLE_MAX_LEN = 1024;
const DEFAULT_DESC_MAX_LEN = 1024 * 10;

// Returns a shallow copy of the input feed with sanitized properties
function sanitizeFeed(feed, titleMaxLength, descMaxLength) {
  assert(Feed.isFeed(feed));

  if(typeof titleMaxLength === 'undefined') {
    titleMaxLength = DEFAULT_TITLE_MAX_LEN;
  } else {
    assert(Number.isInteger(titleMaxLength) && titleMaxLength >= 0);
  }

  if(typeof descMaxLength === 'undefined') {
    descMaxLength = DEFAULT_DESC_MAX_LEN;
  } else {
    assert(Number.isInteger(descMaxLength) && descMaxLength >= 0);
  }

  const outputFeed = Object.assign({}, feed);
  const tagReplacement = '';
  const suffix = '';

  if(outputFeed.title) {
    let title = outputFeed.title;
    title = filterControls(title);
    title = replaceTags(title, tagReplacement);
    title = condenseWhitespace(title);
    title = truncateHTML(title, titleMaxLength, suffix);
    outputFeed.title = title;
  }

  if(outputFeed.description) {
    let desc = outputFeed.description;
    desc = filterControls(desc);
    desc = replaceTags(desc, tagReplacement);
    desc = condenseWhitespace(desc);
    desc = truncateHTML(desc, descMaxLength, suffix);
    outputFeed.description = desc;
  }

  return outputFeed;
}

// @param entryIds {Array} an array of entry ids
FeedStore.prototype.removeEntries = function(entryIds) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    assert(Array.isArray(entryIds));

    for(const id of entryIds) {
      assert(Entry.isValidId(id));
    }

    const tx = this.conn.transaction('entry', 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore('entry');
    for(const id of entryIds) {
      store.delete(id);
    }
  });
};

// TODO: this should not accept entryIds as parameter, it should find the entries as part of the
// transaction implicitly. Once that it done there is no need to assert against entryIds as
// valid entry ids.
FeedStore.prototype.removeFeed = function(feedId, entryIds) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    assert(Feed.isValidId(feedId));
    assert(Array.isArray(entryIds));

    for(const id of entryIds) {
      assert(Entry.isValidId(id));
    }

    const tx = this.conn.transaction(['feed', 'entry'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);

    const feedStore = tx.objectStore('feed');
    feedStore.delete(feedId);

    const entryStore = tx.objectStore('entry');
    for(const id of entryIds) {
      entryStore.delete(id);
    }
  });
};

FeedStore.prototype.setup = async function() {
  try {
    await this.open();
  } finally {
    this.close();
  }
};


// Loads archivable entries from the database. An entry is archivable if it has not already been
// archived, and has been read, and matches the custom predicate function.
// This does two layers of filtering. It would preferably be one layer but a three property index
// involving a date gets complicated. Given the perf is not top priority this is acceptable for
// now. The first filter layer is at the indexedDB level, and the second is the in memory
// predicate. The first layer reduces the number of entries loaded by a large amount.
// TODO: rather than assert failure when limit is 0, resolve immediately with an empty array.
// Limit is optional
// TODO: I feel like there is not a need for the predicate function. This is pushing too much
// burden/responsibility to the caller. This should handle the expiration check that the caller
// is basically using the predicate for. Basically the caller should just pass in a date instead
// of a function
FeedStore.prototype.findArchivableEntries = function(predicate, limit) {
  return new Promise((resolve, reject) => {
    assert(this.isOpen());
    assert(typeof predicate === 'function');

    const limited = typeof limit !== 'undefined';
    if(limited) {
      assert(Number.isInteger(limit) && limit >= 0);
      assert(limit > 0);
    }

    const entries = [];
    const tx = this.conn.transaction('entry');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve(entries);

    const store = tx.objectStore('entry');
    const index = store.index('archiveState-readState');
    const keyPath = [Entry.STATE_UNARCHIVED, Entry.STATE_READ];
    const request = index.openCursor(keyPath);
    request.onsuccess = function(event) {
      const cursor = event.target.result;
      if(!cursor) {
        return;
      }

      const entry = cursor.value;
      if(predicate(entry)) {
        entries.push(entry);
        if(limited && (entries.length >= limit)) {
          return;
        }
      }

      cursor.continue();
    };
  });
};

// Archives certain entries in the database
// @param store {FeedStore} storage database
// @param maxAgeMs {Number} how long before an entry is considered archivable (using date entry
// created), in milliseconds
FeedStore.prototype.archiveEntries = async function(maxAgeMs, limit) {
  assert(this.isOpen());
  if(typeof maxAgeMs === 'undefined') {
    const TWO_DAYS_MS = 1000 * 60 * 60 * 24 * 2;
    maxAgeMs = TWO_DAYS_MS;
  }

  assert(Number.isInteger(maxAgeMs) && maxAgeMs >= 0);
  const currentDate = new Date();

  function isArchivable(entry) {
    const entryAgeMs = currentDate - entry.dateCreated;
    return entryAgeMs > maxAgeMs;
  }

  const entries = await this.findArchivableEntries(isArchivable, limit);
  if(!entries.length) {
    console.debug('no archivable entries found');
    return;
  }

  const CHANNEL_NAME = 'reader';
  const channel = new BroadcastChannel(CHANNEL_NAME);
  const promises = [];
  for(const entry of entries) {
    promises.push(this.archiveEntry(entry, channel));
  }

  try {
    await Promise.all(promises);
  } finally {
    channel.close();
  }

  console.log('Compacted %s entries', entries.length);
};

FeedStore.prototype.archiveEntry = async function(entry, channel) {
  const beforeSize = sizeof(entry);
  const compacted = compactEntry(entry);
  compacted.dateUpdated = new Date();
  const afterSize = sizeof(compacted);
  console.debug('Compact entry changed approx size from %d to %d', beforeSize, afterSize);
  await this.putEntry(compacted);
  const message = {type: 'entry-archived', id: compacted.id};
  channel.postMessage(message);
  return compacted;
};

function compactEntry(entry) {
  const compactedEntry = Entry.createEntry();
  compactedEntry.dateCreated = entry.dateCreated;
  compactedEntry.dateRead = entry.dateRead;
  compactedEntry.feed = entry.feed;
  compactedEntry.id = entry.id;
  compactedEntry.readState = entry.readState;
  compactedEntry.urls = entry.urls;
  compactedEntry.archiveState = Entry.STATE_ARCHIVED;
  compactedEntry.dateArchived = new Date();
  return compactedEntry;
}

FeedStore.prototype.refreshFeedIcons = async function(iconCache) {
  assert(this.isOpen());
  assert(iconCache.isOpen());
  const feeds = await this.findActiveFeeds();
  const query = new FaviconLookup();
  query.cache = iconCache;
  const promises = [];
  for(const feed of feeds) {
    promises.push(this.refreshFeedIcon(feed, query));
  }
  await PromiseUtils.promiseEvery(promises);
};

FeedStore.prototype.refreshFeedIcon = async function(feed, query) {
  assert(Feed.isFeed(feed));
  assert(Feed.hasURL(feed));

  const url = Feed.createIconLookupURL(feed);
  let iconURL;
  try {
    iconURL = await query.lookup(url);
  } catch(error) {
    if(error instanceof CheckedError) {
      // Ignore
    } else {
      throw error;
    }
  }

  const prevIconURL = feed.faviconURLString;
  feed.dateUpdated = new Date();
  if(prevIconURL && iconURL && prevIconURL !== iconURL) {
    feed.faviconURLString = iconURL;
    await this.putFeed(feed);
  } else if(prevIconURL && iconURL && prevIconURL === iconURL) {
    // noop
  } else if(prevIconURL && !iconURL) {
    feed.faviconURLString = void prevIconURL;
    await this.putFeed(feed);
  } else if(!prevIconURL && !iconURL) {
    // noop
  } else if(!prevIconURL && iconURL) {
    feed.faviconURLString = iconURL;
    await this.putFeed(feed);
  } else {
    console.warn('Unexpected state in refresh feed icons');
  }
};

// Removes lost entries from the database. An entry is lost if it is missing a url.
// @param limit {Number} optional, if specified should be positive integer > 0, maximum number
// of entries to lost entries to load from database
FeedStore.prototype.removeLostEntries = async function(limit) {
  const entries = await this.findEntries(isLostEntry, limit);
  console.debug('Found %s lost entries', entries.length);
  if(entries.length === 0) {
    return;
  }

  const ids = entries.map(entry => entry.id);
  await this.removeEntries(ids);

  const CHANNEL_NAME = 'reader';
  const channel = new BroadcastChannel(CHANNEL_NAME);
  const message = {type: 'entry-deleted', id: undefined, reason: 'lost'};
  for(const id of ids) {
    message.id = id;
    channel.postMessage(message);
  }
  channel.close();
};

function isLostEntry(entry) {
  return !Entry.hasURL(entry);
}

// Removes entries not linked to a feed from the database
// @param store {FeedStore} an open FeedStore instance
// @param limit {Number}
FeedStore.prototype.removeOrphanedEntries = async function(limit) {
  const feedIds = await this.getAllFeedIds();

  function isOrphan(entry) {
    const id = entry.feed;
    return !Feed.isValidId(id) || !feedIds.includes(id);
  }

  const entries = await this.findEntries(isOrphan, limit);
  console.debug('Found %s orphans', entries.length);
  if(entries.length === 0) {
    return;
  }

  const orphanIds = entries.map(entry => entry.id);
  if(orphanIds.length < 1) {
    return;
  }

  await this.removeEntries(orphanIds);

  const CHANNEL_NAME = 'reader';
  const channel = new BroadcastChannel(CHANNEL_NAME);
  const message = {type: 'entry-deleted', id: undefined, reason: 'orphan'};
  for(const id of orphanIds) {
    message.id = id;
    channel.postMessage(message);
  }
  channel.close();
};


// Returns a new object that is a copy of the input less empty properties. A property is empty if it
// is null, undefined, or an empty string. Ignores prototype, deep objects, getters, etc. Shallow
// copy by reference.
// TODO: maybe rename to something like copyNonEmptyProps? Less suggestive of mutation.
function filterEmptyProps(object) {
  const hasOwnProp = Object.prototype.hasOwnProperty;
  const output = {};
  let undef;
  if(typeof object === 'object' && object !== null) {
    for(const key in object) {
      if(hasOwnProp.call(object, key)) {
        const value = object[key];
        if(value !== undef && value !== null && value !== '') {
          output[key] = value;
        }
      }
    }
  }

  return output;
}


// If the input is a string then the function returns a new string that is approximately a copy of
// the input less certain 'unprintable' characters. In the case of bad input the input itself is
// returned. To test if characters were replaced, check if the output string length is less than the
// input string length.
// Basically this removes those characters in the range of [0..31] except for the following four
// characters:
// \t is \u0009 which is base10 9
// \n is \u000a which is base10 10
// \f is \u000c which is base10 12
// \r is \u000d which is base10 13
// TODO: look into how much this overlaps with filterControls

const unPrintablePattern = /[\u0000-\u0008\u000b\u000e-\u001F]+/g;
export function filterUnprintableCharacters(value) {
  // The length check is done because given that replace will be a no-op when the length is 0 it is
  // faster to perform the length check than it is to call replace. I do not know the distribution
  // of inputs but I expect that empty strings are not rare.
  return typeof value === 'string' && value.length ? value.replace(unPrintablePattern, '') : value;
}

// Returns a new string where Unicode Cc-class characters have been removed. Throws an error if
// string is not a defined string. Adapted from these stack overflow questions:
// http://stackoverflow.com/questions/4324790
// http://stackoverflow.com/questions/21284228
// http://stackoverflow.com/questions/24229262
export function filterControls(string) {
  return string.replace(/[\x00-\x1F\x7F-\x9F]+/g, '');
}
