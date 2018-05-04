import '/src/views/cli.js';

import {archive_entries, remove_lost_entries, remove_orphaned_entries} from '/src/entry-store.js';
import {favicon_compact, favicon_create_conn, favicon_refresh_feeds} from '/src/favicon.js';
import {console_stub} from '/src/lib/console-stub.js';
import {create_channel} from '/src/ops/create-channel.js';
import {create_conn} from '/src/ops/create-conn.js';
import {open_view} from '/src/ops/open-view.js';
import {poll_feeds} from '/src/ops/poll-feeds.js';
import {refresh_badge} from '/src/ops/refresh-badge.js';

async function handle_compact_favicons_alarm(alarm) {
  await favicon_compact();
}

async function handle_archive_alarm_wakeup(alarm) {
  const ac = {};
  ac.conn = await create_conn();
  ac.channel = create_channel();
  ac.console = console_stub;

  let max_age;

  await archive_entries.call(ac, max_age);
  ac.channel.close();
  ac.conn.close();
}

async function handle_lost_entries_alarm(alarm) {
  const op = {};
  op.conn = await create_conn();
  op.channel = create_channel();
  op.console = console_stub;
  op.remove_lost_entries = remove_lost_entries;
  await op.remove_lost_entries();
  op.conn.close();
  op.channel.close();
}

async function handle_orphan_entries_alarm(alarm) {
  const op = {};
  op.conn = await create_conn();
  op.channel = create_channel();
  op.console = console_stub;
  op.remove_orphaned_entries = remove_orphaned_entries;
  await op.remove_orphaned_entries();
  op.conn.close();
  op.channel.close();
}

async function handle_refresh_icons_alarm(alarm) {
  const proms = [create_conn(), favicon_create_conn()];
  const [rconn, iconn] = await Promise.all(proms);
  const channel = create_channel();

  const op = {};
  op.rconn = rconn;
  op.iconn = iconn;
  op.channel = channel;
  op.console = console_stub;
  op.favicon_refresh_feeds = favicon_refresh_feeds;
  await op.favicon_refresh_feeds();

  rconn.close();
  iconn.close();
  channel.close();
}

async function handle_poll_feeds_alarm(alarm) {
  if ('ONLY_POLL_IF_IDLE' in localStorage) {
    const idle_period_secs = 30;
    const state = await query_idle_state(idle_period_secs);
    if (state !== 'locked' || state !== 'idle') {
      return;
    }
  }

  const options = {};
  options.ignore_recency_check = false;
  options.notify = true;

  const rconn = await create_conn();
  const iconn = await favicon_create_conn();
  const channel = create_channel();

  await poll_feeds(rconn, iconn, channel, console, options);

  channel.close();
  iconn.close();
  rconn.close();
}

function query_idle_state(idle_period_secs) {
  return new Promise(function executor(resolve, reject) {
    chrome.idle.queryState(idle_period_secs, resolve);
  });
}

console.debug('Initializing background page');

chrome.runtime.onInstalled.addListener(async function(event) {
  let conn = await create_conn();
  conn.close();

  conn = await favicon_create_conn();
  conn.close();
});

chrome.browserAction.onClicked.addListener(open_view);

async function badge_init() {
  const conn = await create_conn();
  refresh_badge(conn, void console);
  conn.close();
}

badge_init();

chrome.alarms.onAlarm.addListener(function(alarm) {
  console.debug('Alarm awoke:', alarm.name);
  localStorage.LAST_ALARM = alarm.name;

  switch (alarm.name) {
    case 'archive':
      handle_archive_alarm_wakeup(alarm).catch(console.error);
      break;
    case 'poll':
      handle_poll_feeds_alarm(alarm).catch(console.error);
      break;
    case 'remove-entries-missing-urls':
      handle_lost_entries_alarm(alarm).catch(console.error);
      break;
    case 'remove-orphaned-entries':
      handle_orphan_entries_alarm(alarm).catch(console.error);
      break;
    case 'refresh-feed-icons':
      handle_refresh_icons_alarm(alarm).catch(console.error);
      break;
    case 'compact-favicon-db':
      handle_compact_favicons_alarm(alarm).catch(console.error);
      break;
    default:
      console.warn('unhandled alarm', alarm.name);
      break;
  }
});

chrome.alarms.create('archive', {periodInMinutes: 60 * 12});
chrome.alarms.create('poll', {periodInMinutes: 60});
chrome.alarms.create(
    'remove-entries-missing-urls', {periodInMinutes: 60 * 24 * 7});
chrome.alarms.create('remove-orphaned-entries', {periodInMinutes: 60 * 24 * 7});
chrome.alarms.create('refresh-feed-icons', {periodInMinutes: 60 * 24 * 7 * 2});
chrome.alarms.create('compact-favicon-db', {periodInMinutes: 60 * 24 * 7});
