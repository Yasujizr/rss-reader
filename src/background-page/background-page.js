import '/src/cli/cli.js';
import {compact as favicon_service_compact, open as favicon_service_open} from '/src/favicon-service/favicon-service.js';
import archive_entries from '/src/feed-ops/archive-entries.js';
import rdb_refresh_feed_icons from '/src/feed-ops/refresh-feed-icons.js';
import entry_store_remove_lost_entries from '/src/feed-ops/remove-lost-entries.js';
import entry_store_remove_orphans from '/src/feed-ops/remove-orphaned-entries.js';
import {poll_service_close_context, poll_service_create_context, poll_service_poll_feeds} from '/src/poll-service/poll-service.js';
import {rdb_open} from '/src/rdb/rdb.js';
import show_slideshow_tab from '/src/show-slideshow-tab.js';
import badge_update_text from '/src/update-badge-text.js';

function handle_compact_favicons_alarm(alarm) {
  return favicon_service_compact().catch(console.error);
}

function handle_archive_alarm_wakeup(alarm) {
  let conn, channel, max_age;
  return archive_entries(conn, channel, max_age).catch(console.error);
}

async function handle_lost_entries_alarm(alarm) {
  let conn;
  const channel = new BroadcastChannel('reader');
  try {
    await entry_store_remove_lost_entries(conn, channel, console);
  } finally {
    channel.close();
  }
}

async function handle_orphan_entries_alarm(alarm) {
  let conn;
  const channel = new BroadcastChannel('reader');
  try {
    await entry_store_remove_orphans(conn, channel);
  } finally {
    channel.close();
  }
}

async function handle_refresh_feed_icons_alarm(alarm) {
  const [reader_conn, favicon_conn] =
      await Promise.all([rdb_open(), favicon_service_open()]);
  await rdb_refresh_feed_icons(reader_conn, favicon_conn);
  reader_conn.close();
  favicon_conn.close();
}

async function handle_poll_feeds_alarm(alarm) {
  if ('ONLY_POLL_IF_IDLE' in localStorage) {
    const idle_period_secs = 30;
    const state = await query_idle_state(idle_period_secs);
    if (state !== 'locked' || state !== 'idle') {
      return;
    }
  }

  const context = await poll_service_create_context();
  context.console = console;
  await poll_service_poll_feeds(context);
  poll_service_close_context(context);
}

window.test_handle_poll_feeds_alarm = handle_poll_feeds_alarm;

function query_idle_state(idle_period_secs) {
  return new Promise(function executor(resolve, reject) {
    chrome.idle.queryState(idle_period_secs, resolve);
  });
}

console.debug('Initializing background page');

chrome.runtime.onInstalled.addListener(function(event) {
  console.log('Setting up feed store database');
  rdb_open().then(conn => conn.close()).catch(console.error);
  console.log('Setting up favicon database');
  favicon_service_open().then(conn => conn.close()).catch(console.error);
});

chrome.browserAction.onClicked.addListener(show_slideshow_tab);

async function badge_init() {
  let conn;
  try {
    conn = await rdb_open();
    await badge_update_text(conn);
  } catch (error) {
    console.error(error);
  } finally {
    if (conn) {
      conn.close();
    }
  }
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
      handle_refresh_feed_icons_alarm(alarm).catch(console.error);
      break;
    case 'compact-favicon-db':
      handle_compact_favicons_alarm(alarm);
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
