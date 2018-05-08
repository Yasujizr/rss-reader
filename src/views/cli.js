import {create_channel} from '/src/channel.js';
import {create_conn} from '/src/db.js';
import {archive_entries, remove_lost_entries, remove_orphaned_entries} from '/src/entry-store/entry-store.js';
import {favicon_clear, favicon_compact, favicon_create_conn, favicon_lookup, favicon_refresh_feeds} from '/src/favicon.js';
import {poll_feed} from '/src/poll/poll-feed.js';
import {poll_feeds} from '/src/poll/poll-feeds.js';
import {subscribe} from '/src/subscribe.js';

async function cli_subscribe(url_string, poll = true) {
  const url = new URL(url_string);
  const op = {};
  const proms = [create_conn(), favicon_create_conn()];
  [op.rconn, op.iconn] = await Promise.all(proms);

  op.channel = create_channel();
  op.console = console;
  op.subscribe = subscribe;

  const options = {fetch_timeout: 3000, notify: true};
  const feed = await op.subscribe(url, options);

  // Do a sequential poll of the created feed
  if (poll) {
    const poll_options = {ignore_recency_check: true, notify: true};
    await poll_feed(
        op.rconn, op.iconn, op.channel, console, poll_options, feed);
  }

  op.rconn.close();
  op.iconn.close();
  op.channel.close();
}

async function cli_archive_entries() {
  const ac = {};
  ac.conn = await create_conn();
  ac.channel = create_channel();
  ac.console = console;

  let max_age;
  await archive_entries.call(ac, max_age);
  ac.channel.close();
  ac.conn.close();
}

async function cli_refresh_icons() {
  const proms = [create_conn(), favicon_create_conn()];
  const [rconn, iconn] = await Promise.all(proms);
  const channel = create_channel();

  const op = {};
  op.rconn = rconn;
  op.iconn = iconn;
  op.channel = channel;
  op.console = console;
  op.favicon_refresh_feeds = favicon_refresh_feeds;
  await op.favicon_refresh_feeds();
  rconn.close();
  iconn.close();
  channel.close();
}

async function cli_poll_feeds() {
  const rconn = await create_conn();
  const iconn = await favicon_create_conn();
  const channel = create_channel();

  const options = {};
  options.ignore_recency_check = true;

  await poll_feeds(rconn, iconn, channel, console, options);

  channel.close();
  rconn.close();
  iconn.close();
}

async function cli_remove_lost_entries() {
  const op = {};
  op.conn = await create_conn();
  console.debug(
      '%s: connected to db %s', cli_remove_lost_entries.name, op.conn.name);
  op.channel = create_channel();
  console.debug(
      '%s: created channel', cli_remove_lost_entries.name, op.channel.name);
  op.console = console;
  op.remove_lost_entries = remove_lost_entries;
  await op.remove_lost_entries();
  console.debug(
      '%s: closing db conn', cli_remove_lost_entries.name, op.conn.name);
  op.conn.close();
  console.debug(
      '%s: closing channel', cli_remove_lost_entries.name, op.channel.name);
  op.channel.close();
}

async function cli_remove_orphans() {
  const op = {};
  op.conn = await create_conn();
  op.channel = create_channel();
  op.console = console;
  op.remove_orphaned_entries = remove_orphaned_entries;
  await op.remove_orphaned_entries();
  op.conn.close();
  op.channel.close();
}

async function cli_lookup_favicon(url_string, cached) {
  let document, fetch = true;
  const url = new URL(url_string);

  const op = {};
  op.conn = cached ? await favicon_create_conn() : undefined;
  op.console = console;
  op.favicon_lookup = favicon_lookup;

  const icon_url_string = await op.favicon_lookup(url, document, fetch);

  if (cached) {
    op.conn.close();
  }

  return icon_url_string;
}

const cli = {
  archive: cli_archive_entries,
  clear_icons: favicon_clear,
  compact_icons: favicon_compact,
  remove_orphaned_entries: cli_remove_orphans,
  remove_lost_entries: cli_remove_lost_entries,
  lookup_favicon: cli_lookup_favicon,
  poll_feeds: cli_poll_feeds,
  refresh_icons: cli_refresh_icons,
  subscribe: cli_subscribe
};

window.cli = cli;  // expose to console
