// TODO: break apart again into function-per-file

import {refresh_badge} from '/src/badge.js';
import {is_valid_feed_id} from '/src/feed-store/feed.js';
import {find_feed_by_url} from '/src/feed-store/find-feed-by-url.js';

export async function contains_feed(conn, query) {
  const key_only = true;
  const match = await find_feed_by_url(conn, query.url, key_only);
  return match ? true : false;
}

export function delete_feed(feed_id, reason_text) {
  if (!is_valid_feed_id(feed_id)) {
    throw new TypeError('Invalid feed id ' + feed_id);
  }

  return new Promise(delete_feed_executor.bind(this, feed_id, reason_text));
}

function delete_feed_executor(feed_id, reason_text, resolve, reject) {
  let entry_ids = [];
  const txn = this.conn.transaction(['feed', 'entry'], 'readwrite');
  txn.oncomplete = delete_feed_txn_oncomplete.bind(
      this, feed_id, reason_text, entry_ids, resolve);
  txn.onerror = _ => reject(txn.error);

  const feed_store = txn.objectStore('feed');

  // Delete the feed
  this.console.debug('Deleting feed with id', feed_id);
  feed_store.delete(feed_id);

  // Delete all entries belonging to the feed
  const entry_store = txn.objectStore('entry');
  const feed_index = entry_store.index('feed');

  // TODO: use openKeyCursor for scalability?
  const request = feed_index.getAllKeys(feed_id);
  request.onsuccess = event => {
    const keys = request.result;

    for (const id of keys) {
      entry_ids.push(id);
      this.console.debug('%s: deleting entry %d', delete_feed.name, id);
      entry_store.delete(id);
    }
  };
}

function delete_feed_txn_oncomplete(
    feed_id, reason_text, entry_ids, callback, event) {
  const msg = {type: 'feed-deleted', id: feed_id, reason: reason_text};
  this.console.debug('%s: %o', delete_feed.name, msg);
  this.channel.postMessage(msg);

  msg.type = 'entry-deleted';
  for (const id of entry_ids) {
    msg.id = id;
    this.channel.postMessage(msg);
  }

  refresh_badge(this.conn, this.console).catch(this.console.error);
  callback(entry_ids);
}
