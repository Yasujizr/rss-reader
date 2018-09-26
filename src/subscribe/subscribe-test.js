import assert from '/src/assert/assert.js';
import * as feed_utils from '/src/db/feed-utils.js';
import * as types from '/src/db/types.js';
import * as indexeddb from '/src/indexeddb/indexeddb.js';
import {openModelAccess} from '/src/db/model-access.js';
import {subscribe} from '/src/subscribe/subscribe.js';
import {register_test} from '/test/test-registry.js';

// TODO: it is wrong to ping google, implement something that tests a local
// file somehow (e.g. a feed that exists within the extension folder)

async function subscribe_test() {
  const test_url = 'https://news.google.com/news/rss/?ned=us&gl=US&hl=en';
  const url = new URL(test_url);

  const ma = await openModelAccess(/* channeled */ false, 'subscribe-test');
  const messages = [];
  ma.channel = {
    name: 'channel-stub',
    postMessage: message => messages.push(message),
    close: noop
  };

  // Rethrow subscribe exceptions just like assertion failures by omitting
  // try/catch here.
  const feed = await subscribe(ma, undefined, url, 7000, false);

  // Test the subscription produced the desired result
  assert(feed);
  assert(types.is_feed(feed));
  assert(feed_utils.is_valid_feed_id(feed.id));

  // Length may be 1 or 2 (may have redirected and captured new url)
  assert(feed.urls.length);
  assert(feed.urls.includes(url.href));
  assert(feed.active);

  // Assert that the subscription sent out correct messages
  assert(messages.length === 1);
  assert(messages[0].type === 'feed-created');
  assert(messages[0].id === feed.id);

  ma.close();
  await indexeddb.remove(ma.conn.name);
}

function noop() {}

register_test(subscribe_test);
