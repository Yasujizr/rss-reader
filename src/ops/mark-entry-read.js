import {entry_is_valid_id, ENTRY_STATE_READ, ENTRY_STATE_UNREAD, is_entry} from '/src/objects/entry.js';
import {rdr_badge_refresh} from '/src/ops/rdr-badge-refresh.js';

export function mark_entry_read(conn, channel, entry_id) {
  // Rather than reject from within the promise, throw an immediate error. This
  // constitutes a serious and permanent programmer error.
  if (!entry_is_valid_id(entry_id)) {
    throw new TypeError('entry_id is not a valid entry id: ' + entry_id);
  }

  return new Promise(executor.bind(null, conn, channel, entry_id));
}

function executor(conn, channel, entry_id, resolve, reject) {
  const txn = conn.transaction('entry', 'readwrite');

  // The promise settles based on the txn, not the get request, because we do
  // some post-request operations, and because there is actually more than one
  // request involved

  txn.oncomplete = txn_oncomplete.bind(txn, conn, channel, entry_id, resolve);
  txn.onerror = _ => reject(txn.error);
  const store = txn.objectStore('entry');
  const request = store.get(entry_id);
  request.onsuccess = request_onsuccess.bind(request, entry_id);
}

function request_onsuccess(entry_id, event) {
  const entry = event.target.result;


  // For whatever reason the entry is not found. Become a no-op.
  if (!entry) {
    console.warn('No entry found for entry id', entry_id);
    return;
  }

  // Do not trust data coming from the database because it can be modified by
  // external means
  if (!is_entry(entry)) {
    console.warn(
        'Matched database object for entry id %d is not an entry', entry_id,
        entry);
    return;
  }

  if (entry.readState === ENTRY_STATE_READ) {
    console.warn('Entry %d already in read state, ignoring', entry.id);
    return;
  }

  if (entry.readState !== ENTRY_STATE_UNREAD) {
    console.warn('Entry %d not in unread state, ignoring', entry.id);
    return;
  }

  entry.readState = ENTRY_STATE_READ;
  const currentDate = new Date();
  entry.dateUpdated = currentDate;
  entry.dateRead = currentDate;

  const entry_store = event.target.source;
  entry_store.put(entry);
}

function txn_oncomplete(conn, channel, entry_id, callback, event) {
  // channel may be closed by the time this executes when mark_entry_read
  // is not awaited, so trap the invalid state error and just log it
  if (channel) {
    try {
      channel.postMessage({type: 'entry-marked-read', id: entry_id});
    } catch (error) {
      console.debug(error);
    }
  }

  console.debug('Marked entry %d as read', entry_id);

  rdr_badge_refresh(conn, void console).catch(console.error);

  callback();
}