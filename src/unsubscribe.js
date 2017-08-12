// See license.md
'use strict';

{ // Begin file block scope

// Removes a feed and all of its associated entries from the database.
// @param conn {IDBDatabase} an open database connection
// @param feed_id {Number} id of feed to unscubscribe
// @param verbose {Boolean} optional, whether to print logging info
async function unsubscribe(conn, feed_id, verbose) {
  if(!Number.isInteger(feed_id))
    throw new TypeError('feed id is not an integer');
  if(feed_id < 1)
    throw new TypeError('feed id less than 1');
  if(verbose)
    console.log('Unsubscribing from feed with id', feed_id);
  const entry_ids = await db_load_entry_ids_for_feed(conn, feed_id);
  await db_remove_feed_and_entries(conn, feed_id, entry_ids);
  dispatch_remove_events(feed_id, entry_ids);
  if(verbose)
    console.debug('Unsubscribed from feed with id', feed_id,
      ', deleted %d entries', entry_ids.length);
  ext_update_badge(verbose);
  return entry_ids.length;
}

function dispatch_remove_events(feed_id, entry_ids) {
  const channel = new BroadcastChannel('db');
  channel.postMessage({'type': 'feedDeleted', 'id': feed_id});
  for(const entry_id of entry_ids)
    channel.postMessage({'type': 'entryDeleted', 'id': entry_id});
  channel.close();
}

function db_load_entry_ids_for_feed(conn, feed_id) {
  function resolver(resolve, reject) {
    const tx = conn.transaction('entry');
    const store = tx.objectStore('entry');
    const index = store.index('feed');
    const request = index.getAllKeys(feed_id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }
  return new Promise(resolver);
}

function db_remove_feed_and_entries(conn, feed_id, entry_ids) {
  function resolver(resolve, reject) {
    const tx = conn.transaction(['feed', 'entry'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const feed_store = tx.objectStore('feed');
    feed_store.delete(feed_id);
    const entry_store = tx.objectStore('entry');
    for(const entry_id of entry_ids)
      entry_store.delete(entry_id);
  }
  return new Promise(resolver);
}

this.unsubscribe = unsubscribe;

} // End file block scope
