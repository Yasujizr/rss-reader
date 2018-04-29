export async function remove_lost_entries() {
  return new Promise(executor.bind(this));
}

function executor(resolve, reject) {
  const ids = [];
  const txn = this.conn.transaction('entry', 'readwrite');
  txn.oncomplete = txn_oncomplete.bind(this, ids, resolve);
  txn.onerror = _ => reject(txn.error);

  const store = txn.objectStore('entry');
  const request = store.openCursor();
  request.onsuccess = request_onsuccess.bind(this, ids);
}

function request_onsuccess(ids, event) {
  const cursor = event.target.result;
  if (cursor) {
    const entry = cursor.value;
    if (!entry.urls || !entry.urls.length) {
      this.console.debug(
          '%s: deleting entry %d', remove_lost_entries.name, entry.id);
      cursor.delete();
      ids.push(entry.id);
    }

    cursor.continue();
  }
}

function txn_oncomplete(ids, callback, event) {
  this.console.debug(
      '%s: deleted %d entries', remove_lost_entries.name, ids.length);

  const message = {type: 'entry-deleted', id: 0, reason: 'lost'};
  for (const id of ids) {
    message.id = id;
    this.channel.postMessage(message);
  }

  callback();
}
