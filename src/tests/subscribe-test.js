import {console_stub} from '/src/lib/console-stub.js';
import {idb_remove} from '/src/lib/idb.js';
import {feed_id_is_valid, is_feed} from '/src/objects/feed.js';
import {contains_feed} from '/src/ops/contains-feed.js';
import {create_conn} from '/src/ops/create-conn.js';
import {find_feed_by_id} from '/src/ops/find-feed-by-id.js';
import {subscribe} from '/src/ops/subscribe.js';
import {assert} from '/src/tests/assert.js';

// TODO: it is wrong to ping google, implement something that tests a local
// file somehow (e.g. a feed that exists within the extension)

export async function subscribe_test() {
  const test_url = 'https://news.google.com/news/rss/?ned=us&gl=US&hl=en';

  const rdb_name = 'subscribe-test';
  let version, timeout;
  const rconn = await create_conn(rdb_name, version, timeout, console_stub);

  // If subscribe will poll, then we need to pipe through custom database info.
  // This is not currently done because skip_poll is true in subscribe options,
  // but I prefer to be explicit to document how it would be done in case this
  // changes
  const poll_feed_conn_args = {
    name: rdb_name,
    version: undefined,
    timeout: undefined,
    console: console_stub
  };

  const url = new URL(test_url);
  const subscribe_options = {
    fetch_timeout: 7000,
    notify: false,
    await_poll: true,
    skip_poll: true,
    skip_icon_lookup: true,
    poll_feed_conn_args: poll_feed_conn_args
  };

  let message_post_count = 0;
  const channel_stub = {};
  channel_stub.name = 'channel-stub';
  channel_stub.postMessage = _ => message_post_count++;

  const subscribe_op = {
    rconn: rconn,
    channel: channel_stub,
    console: console,
    subscribe: subscribe
  };

  // Test the subscription produced the desired result
  const feed = await subscribe_op.subscribe(url, subscribe_options);
  assert(typeof feed === 'object', 'subscribe did not emit an object ' + feed);
  assert(is_feed(feed), 'subscribe did not emit object of correct type');
  assert(feed_id_is_valid(feed.id));
  assert(feed.urls.length, 'subscribe produced feed without urls');
  assert(feed.urls.includes(url.href), 'subscribed feed missing input url');
  assert(feed.active, 'subscribed feed not initially active');

  // Test the subscription sent out messages
  assert(message_post_count, 'no message posted');

  // Test the new feed is findable by url
  const query = {url: url};
  assert(await contains_feed(rconn, query), 'cannot find feed by url');

  // Test the new feed is findable by id
  const match = await find_feed_by_id(rconn, feed.id);
  assert(is_feed(match), 'subscribed feed read did not emit feed type');
  assert(feed_id_is_valid(match.id), 'subscribed feed has invalid id');
  assert(match.id === feed.id, 'subscribed feed vs stored feed id mismatch');

  // Cleanup
  rconn.close();
  await idb_remove(rconn.name);
}
