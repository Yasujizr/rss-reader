import assert from '/src/base/assert.js';
import * as cache from '/src/base/favicon-service/cache.js';
import * as indexeddb from '/src/base/indexeddb.js';

export async function favicon_cache_open_test() {
  const db_name = favicon_cache_open_test.name;
  await indexeddb.remove(db_name);

  // Test that it opens without error, untimed
  const conn = await cache.open(db_name, undefined, 0);

  // Verify that the return value is correct (without using instanceof)
  assert(typeof conn === 'object');
  assert(typeof conn.close === 'function');

  conn.close();
  await indexeddb.remove(db_name);
}

// Test put and find
export async function favicon_cache_put_find_test() {
  // Test setup
  const db_name = favicon_cache_put_find_test.name;
  await indexeddb.remove(db_name);

  const conn = await cache.open(db_name);

  // NOTE: this test fleshed out a problematic technicality. find operates on
  // origin.href, so the input entry that is stored needs to also use
  // origin.href, because origin.href adds a slash which is different than a
  // simple url.origin getter result which does not add a slash.

  // Create an entry for insertion
  const url = new URL('http://www.example.com');
  const origin_url = new URL(url.origin);
  const entry = new cache.Entry();
  entry.origin = origin_url.href;
  entry.icon_url = 'http://www.example.com/favicon.ico';
  entry.failures = 0;

  const now = new Date();
  entry.expires = new Date(now.getTime() + 100000);

  // Cache entry should run without error
  const put_result = await cache.put_entry(conn, entry);

  // The entry should be findable
  const found_entry = await cache.find_entry(conn, origin_url);
  assert(found_entry);

  // Test teardown
  conn.close();
  await indexeddb.remove(db_name);
}

// This is not part of the built in api. It would exist only for test purposes.
// So I violate abstraction here to get it. I think that is ok in test context
// which is allowed to know of internals. Keep in mind this may fail
// unexpectedly whenever cache.js is modified.
function count_entries(conn) {
  return new Promise((resolve, reject) => {
    const txn = conn.transaction('entries');
    txn.onerror = event => reject(event.target.error);
    const store = txn.objectStore('entries');
    const request = store.count();
    request.onsuccess = _ => resolve(request.result);
  });
}

export async function favicon_cache_clear_test() {
  // Test setup
  const db_name = favicon_cache_clear_test.name;
  await indexeddb.remove(db_name);

  const conn = await cache.open(db_name);

  const num_inserted = 5;

  // Insert a few fake entries
  const create_promises = [];
  for (let i = 0; i < num_inserted; i++) {
    const entry = new cache.Entry();
    const url = new URL('http://www.example' + i + '.com');
    const origin_url = new URL(url.origin);
    entry.origin = origin_url.href;
    const promise = cache.put_entry(conn, entry);
    create_promises.push(promise);
  }
  await Promise.all(create_promises);

  const pre_count = await count_entries(conn);
  assert(pre_count === num_inserted);
  await cache.clear(conn);
  const post_count = await count_entries(conn);
  assert(post_count === 0);

  // Test teardown
  conn.close();
  await indexeddb.remove(db_name);
}

export async function favicon_cache_compact_test() {
  console.warn('favicon_cache_compact_test not implemented');
}
