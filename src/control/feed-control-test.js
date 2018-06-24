import {assert} from '/src/assert.js';
import * as feed_control from '/src/control/feed-control.js';
import {ReaderDAL} from '/src/dal.js';
import {indexeddb_remove} from '/src/indexeddb/indexeddb-remove.js';
import * as Feed from '/src/model/feed.js';
import {register_test} from '/src/test/test-registry.js';

async function subscribe_test() {
  // TODO: it is wrong to ping google, implement something that tests a local
  // file somehow (e.g. a feed that exists within the extension folder)
  const test_url = 'https://news.google.com/news/rss/?ned=us&gl=US&hl=en';
  const url = new URL(test_url);

  const dal = new ReaderDAL();
  await dal.connect('subscribe-test');

  let message_post_count = 0;
  dal.channel = {
    name: 'channel-stub',
    postMessage: function(message) {
      message_post_count++
    },
    close: noop
  };

  const fetch_timeout = 7000;
  const notify = false;
  const skip_icon_lookup = true;

  // Rethrow subscribe exceptions just like assertion failures by omitting
  // try/catch here.
  const feed = await feed_control.subscribe(
      dal, undefined, dal, url, fetch_timeout, notify, skip_icon_lookup);

  // Test the subscription produced the desired result
  assert(typeof feed === 'object');
  assert(Feed.is_feed(feed));
  assert(Feed.is_valid_id(feed.id));
  assert(feed.urls.length);
  assert(feed.urls.includes(url.href));
  assert(feed.active);

  // Assert that the subscription sent out messages
  assert(message_post_count > 0);

  // Assert that the new feed is findable by url
  assert(await dal.getFeed('url', url, true));

  // Assert that the new feed is findable by id
  const match = await dal.getFeed('id', feed.id);
  assert(Feed.is_feed(match));
  assert(Feed.is_valid_id(match.id));
  assert(match.id === feed.id);

  // Cleanup
  dal.close();
  dal.channel.close();
  await indexeddb_remove(dal.conn.name);
}

function noop() {}

register_test(subscribe_test);
