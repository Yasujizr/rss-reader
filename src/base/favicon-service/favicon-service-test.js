import assert from '/src/base/assert.js';
import * as indexeddb from '/src/base/indexeddb.js';

import {FaviconService} from './favicon-service.js';

// TODO: this needs to be implemented using local files
// TODO: this needs to be implemented without parameters, it must run on a
// preset url
// TODO: there should be a cached test, and an uncached test

export async function favicon_service_test() {
  // TODO: implement me
}



/*
async function test_lookup(url_string, cached) {
  const fs = new FaviconService();
  fs.name = 'test-favicon-cache';

  let conn;
  if (cached) {
    console.debug('Lookup is cache enabled');
    conn = await fs.open();
    fs.conn = conn;
  }

  const url = new URL(url_string);
  const icon_url_string = await fs.lookup(url);

  if (cached) {
    // Loosely check if cache hit occurred
    if (icon_url_string) {
      const lookup2 = await fs.lookup(url);
      console.debug('Second lookup result', lookup2);
    }

    console.debug('Requesting closure of database', conn.name);
    conn.close();
    console.debug('Deleting database', conn.name);
    await indexeddb.remove(conn.name);
    console.debug('Deleted database', conn.name);
  }

  return icon_url_string;
}
*/
