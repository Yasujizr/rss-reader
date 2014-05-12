// Storage-related functions
(function(g) {
'use strict';
  
var model = {};

var DATABASE_NAME = 'reader';
var DATABASE_VERSION = 4;

// Flag for the unread property of entries representing that
// the entry is unread
// Recall that indexedDB does not support indices on boolean properties
model.UNREAD = 1;

// Connect to indexedDB
model.connect = function(callback) {
  var request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onerror = request.onblocked = console.error;
  request.onupgradeneeded = this.onUpgradeNeeded;
  request.onsuccess = function(event) {
    callback(event.target.result);
  };
};

model.onUpgradeNeeded = function(event) {
  console.log('Upgrading database from %s to %s', event.oldVersion, DATABASE_VERSION);
  var db = event.target.result;

  if(event.oldVersion == 1) {
    if(db.objectStoreNames.contains('entry')) {
      console.log('deleting object store "entry"');
      db.deleteObjectStore('entry');
    }
  } else if(event.oldVersion == 2) {
    if(db.objectStoreNames.contains('entry')) {
      console.log('deleting object store "entry"');
      db.deleteObjectStore('entry');
    }
  } else if(event.oldVersion == 3) {
    if(db.objectStoreNames.contains('entry')) {
      console.log('deleting object store "entry"');
      db.deleteObjectStore('entry');
    }
  }

  if(!db.objectStoreNames.contains('feed')) {
    console.log('Creating object store "feed"');
    var feedStore = db.createObjectStore('feed', {keyPath:'id',autoIncrement:true});
    // For checking if already subscribed
    feedStore.createIndex('url','url',{unique:true});    
  }

  console.log('Creating object store "entry"');
  var entryStore = db.createObjectStore('entry', {keyPath:'id',autoIncrement:true});

  // For quickly counting unread 
  // and for iterating over unread in id order
  entryStore.createIndex('unread','unread');

  // For quickly deleting entries when unsubscribing
  entryStore.createIndex('feed','feed');

  // For quickly checking whether a similar entry exists
  entryStore.createIndex('hash','hash');
};

model.countUnread = function(db, callback) {
  var tx = db.transaction('entry');
  var index = tx.objectStore('entry').index('unread');
  var request = index.count(IDBKeyRange.only(model.UNREAD));
  request.onsuccess = function(event) {
    callback(event.target.result);
  };
};

model.countFeeds = function(db, cb) {
  db.transaction('feed').objectStore('feed').count().onsuccess = function(event) {
    cb(event.target.result);
  };
};

model.forEachFeed = function(db, callback, oncomplete) {
  var tx = db.transaction('feed');
  
  // WARNING: this could complete before the callback on 
  // the last feed completes, leading to unexpected behavior.
  tx.oncomplete = oncomplete;

  var store = tx.objectStore('feed');
  var request = store.openCursor();
  request.onsuccess = function(event) {
    var cursor = event.target.result;
    if(cursor) {
      callback(cursor.value);
      cursor.continue();
    }
  };
};

model.isSubscribed = function(db, url, callback) {
  var index = db.transaction('feed').objectStore('feed').index('url');
  index.get(url).onsuccess = function(event) {
    callback(event.target.result);
  };
};

model.generateEntryHash = function(entry) {
  var seed = entry.link || entry.title || entry.content;
  if(seed) {
    return hashCode(seed.split(''));
  }
};

model.insertOrUpdateFeed = function(db, feed, callback) {
  var store = db.transaction('feed','readwrite').objectStore('feed');
  
  if(feed.id) {
    store.put(feed).onsuccess = function(event) {
      callback(feed);
    };
  } else {
    store.add(feed).onsuccess = function(event) {
      feed.id = event.target.result;
      callback(feed);
    };
  }
};

// Remove a feed and its entries
model.unsubscribe = function(db, feedId, callback) {
  var tx = db.transaction(['entry','feed'],'readwrite');
  var entries = tx.objectStore('entry');
  var feeds = tx.objectStore('feed');

  var entryCursor = entries.index('feed').openKeyCursor(IDBKeyRange.only(feedId));
  entryCursor.onsuccess = function(event) {
    var cursor = event.target.result;
    if(cursor) {
      entries.delete(cursor.primaryKey);
      cursor.continue();
    }
  };

  feeds.delete(feedId);
  tx.oncomplete = callback;
};

model.addEntry = function(store, entry, onSuccess, onError) {
  // Intentionally fails if an entry with the same id exists
  var request = store.add(entry);
  request.onsuccess = onSuccess;
  request.onerror = onError;
};

model.containsEntryHash = function(store, hash, callback) {
  store.index('hash').get(IDBKeyRange.only(hash)).onsuccess = function(event) {
    callback(event.target.result);
  }
}

// Marks entries as read and deletes unused properties
// TODO: could use index('unread').get instead of store.get
model.markRead = function(db, ids, callback) {

  var tx = db.transaction('entry','readwrite');  
  tx.oncomplete =  callback;  
  var store = tx.objectStore('entry');
  var onGetEntry = function(event) {
    var entry = event.target.result;
    if(entry) {
      var request = store.put({
        'id': entry.id,
        'feed': entry.feed,
        'hash' : entry.hash
      });
    }
  };

  each(ids, function(id) {
    store.get(parseInt(id)).onsuccess = onGetEntry;
  });
};

// TODO: could use index('unread').get instead of store.get
model.markEntryRead = function(db, entryId, callback) {
  var tx = db.transaction('entry','readwrite');
  tx.oncomplete = callback;
  var store = tx.objectStore('entry');
  
  store.get(entryId).onsuccess = function(event) {
    var entry = event.target.result;
    if(entry) {
      store.put({
        'id': entry.id,
        'feed': entry.feed,
        'hash': entry.hash
      });
    }
  };
};

// Iterate over all unread entries with an id greater than the minimumId
// TODO: rename this more appropriately
model.forEachEntry = function(db, params, callback, onComplete) {
  var counter = 0, offset = params.offset || 0, 
    limit = parseInt(params.limit) || 0, 
    unlimited = limit <= 0, 
    advanced = false;

  if(!callback) return;

  var tx = db.transaction('entry');
  tx.oncomplete = onComplete;
  tx.objectStore('entry').index('unread').openCursor().onsuccess = function(event) {
    var cursor = event.target.result;
    if(!cursor) return;
    if(offset > 0 && !advanced) {
      //console.log('Advancing %s entries', offset);
      advanced = true;
      cursor.advance(offset);
      return;
    }

    //console.log('Iterating over entry %s', cursor.value.id);
    callback(cursor.value);
    if(unlimited || (++counter < limit)) {
      cursor.continue();
    }
  };
};

g.model = model;

}(this));