import assert from '/src/assert/assert.js';
import * as object from '/src/db/object-utils.js';
import * as types from '/src/db/types.js';

// Create several feeds using a single transaction. This is preferable to
// calling create_feed in a loop as that involves many transactions.
export async function create_feeds(conn, channel, feeds) {
  for (const feed of feeds) {
    assert(types.is_feed(feed));
    assert(feed.urls && feed.urls.length);

    object.filter_empty_properties(feed);

    // Allow explicit false
    if (feed.active === undefined) {
      feed.active = true;
    }

    feed.dateCreated = new Date();
    delete feed.dateUpdated;
  }

  const ids = await create_feeds_internal(conn, feeds);

  if (channel) {
    for (const id of ids) {
      channel.postMessage({type: 'feed-created', id: id});
    }
  }

  return ids;
}

function create_feeds_internal(conn, feeds) {
  return new Promise(create_feeds_executor.bind(null, conn, feeds));
}

function create_feeds_executor(conn, feeds, resolve, reject) {
  const ids = [];
  const txn = conn.transaction('feed', 'readwrite');
  txn.onerror = event => reject(event.target.error);
  txn.oncomplete = _ => resolve(ids);

  function request_onsuccess(event) {
    ids.push(event.target.result);
  }

  const store = txn.objectStore('feed');
  for (const feed of feeds) {
    const request = store.put(feed);
    request.onsuccess = request_onsuccess;
  }
}