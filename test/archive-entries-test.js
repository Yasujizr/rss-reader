'use strict';

async function test_archive_entries() {
  console.log('Starting test_archive_entries');

  // TODO: this needs to use idb_open instead of reader_db_open so that it
  // can connect to a different database. right now this is hardcoded to
  // connect to the real database.

  const test_db_name = 'test-archive-entries';
  const test_db_version = 20;
  let was_conn_close_requested = false;
  let conn, conn_timeout_ms, entry_max_age_ms;
  const open_promise = reader_db_open();

  try {
    conn = await open_promise;
    const num_entries_compacted = await archive_entries(entry_max_age_ms);
    conn.close();
    was_conn_close_requested = true;
    await test_delete_database(conn.name);
  } finally {
    if(conn && !was_conn_close_requested)
      conn.close();
  }
}

function test_delete_database(name) {
  return new Promise(function(resolve, reject) {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
