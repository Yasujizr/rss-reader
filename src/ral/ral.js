import {Exim} from '/src/exim/exim.js';
import * as favicon_service from '/src/favicon-service/favicon-service.js';
import {SubscribeOperation} from '/src/feed-ops/subscribe.js';
import unsubscribe from '/src/feed-ops/unsubscribe.js';
import {PollService} from '/src/poll-service/poll-service.js';
import * as rdb from '/src/rdb/rdb.js';

export async function get_feeds(title_sort_flag) {
  const conn = await rdb.open();
  const feeds = await rdb.get_feeds(conn);
  conn.close();

  if (title_sort_flag) {
    feeds.sort(feed_compare);
  }

  return feeds;
}

function feed_compare(a, b) {
  const atitle = a.title ? a.title.toLowerCase() : '';
  const btitle = b.title ? b.title.toLowerCase() : '';
  return indexedDB.cmp(atitle, btitle);
}

export async function find_feed_by_id(feed_id) {
  const conn = await rdb.open();
  const feed = await rdb.find_feed_by_id(conn, feed_id);
  conn.close();
  return feed;
}

export async function import_opml(channel, files) {
  const exim = new Exim();
  exim.fetch_timeout = 10 * 1000;
  exim.channel = channel;
  exim.console = console;
  const open_promises = [rdb.open(), favicon_service.open()];
  [exim.rconn, exim.iconn] = await Promise.all(open_promises);
  await exim.import_opml(files);
  exim.rconn.close();
  exim.iconn.close();
}

export async function export_opml(title) {
  const exim = new Exim();
  exim.rconn = await rdb.open();
  await exim.export_opml(title);
  exim.rconn.close();
}

export async function load_initial_data(
    entry_cursor_offset, entry_cursor_limit, entry_handler, feed_handler) {
  const conn = await rdb.open();
  const p1 = rdb.viewable_entries_for_each(
      conn, entry_cursor_offset, entry_cursor_limit, entry_handler);
  const p2 = rdb.for_each_active_feed(conn, feed_handler);
  await Promise.all([p1, p2]);
  conn.close();
}

export async function poll_feeds(channel, console) {
  const service = new PollService();
  service.console = console;
  service.ignore_recency_check = true;
  service.ignore_modified_check = true;
  await service.init(channel);
  await service.poll_feeds();
  service.close(/* close_channel */ false);
}

export async function ral_subscribe(channel, url) {
  const op = new SubscribeOperation();
  op.channel = channel;
  op.notify_flag = true;
  const conn_promises = Promise.all([rdb.open(), favicon_service.open()]);
  [op.rconn, op.iconn] = await conn_promises;
  const result = await op.subscribe(url);
  op.rconn.close();
  op.iconn.close();
  return result;
}

export async function ral_unsubscribe(channel, feed_id) {
  const conn = await rdb.open();
  const result = await unsubscribe(conn, channel, feed_id);
  conn.close();
  return result;
}

export async function activate_feed(channel, feed_id) {
  const conn = await rdb.open();
  await rdb.feed_activate(conn, channel, feed_id);
  conn.close();
}

export async function deactivate_feed(channel, feed_id, reason) {
  const conn = await rdb.open();
  await rdb.rdb_feed_deactivate(conn, channel, feed_id, reason);
  conn.close();
}
