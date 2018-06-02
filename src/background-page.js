import '/src/cli.js';

import {refresh_badge} from '/src/badge.js';
import {db_archive_entries} from '/src/db/db-archive-entries.js';
import {db_open} from '/src/db/db-open.js';
import {db_remove_lost_entries} from '/src/db/db-remove-lost-entries.js';
import {db_remove_orphaned_entries} from '/src/db/db-remove-orphaned-entries.js';
import {favicon_compact, favicon_create_conn, favicon_refresh_feeds} from '/src/favicon.js';
import {register_install_listener} from '/src/install.js';
import {log} from '/src/log.js';
import {open_view} from '/src/open-view.js';
import {poll_feeds} from '/src/poll/poll-feeds.js';

// Loaded exclusively by the background page. This page is loaded via the
// background page instead of directly via the scripts property in the manifest.
// This is because it is a es6 module and es6 modules cannot be specified in the
// scripts array (at least in Chrome 66).
//
// The background.html page is configured as a dynamic page in manifest.json,
// meaning that it will periodically be loaded and then unloaded as needed. In
// other words it is not persistently live for the lifetime of the browser.
//
// Concerned with the following:
// * Handling app installation and updates
// * Exposing cli functionality to the console for the background page
// * Cron jobs (via chrome.alarms)
//
// TODO: Consider sharing functionality between alarms and cli, both libs do
// roughly the same thing. Currently there is some redundancy and real
// similarity between the bodies of the functions in each lib. Maybe have a
// layer called headless-tasks that provides functions that carry out a task.
// Then have both the cli and alarm wakeup handlers just call out to this helper
// module.
// TODO: Spend some time thinking more about testing
// TODO: Configurable cron settings
// TODO: move alarms back its own module, maybe call it cron.js

async function handle_compact_favicons_alarm(alarm) {
  await favicon_compact();
}

async function handle_archive_alarm_wakeup(alarm) {
  const conn = await db_open();
  const channel = new BroadcastChannel(localStorage.channel_name);
  await db_archive_entries(conn, channel);
  channel.close();
  conn.close();
}

async function handle_lost_entries_alarm(alarm) {
  const op = {};
  op.conn = await db_open();
  op.channel = new BroadcastChannel(localStorage.channel_name);
  op.db_remove_lost_entries = db_remove_lost_entries;
  await op.db_remove_lost_entries();
  op.conn.close();
  op.channel.close();
}

async function handle_orphan_entries_alarm(alarm) {
  const op = {};
  op.conn = await db_open();
  op.channel = new BroadcastChannel(localStorage.channel_name);
  op.db_remove_orphaned_entries = db_remove_orphaned_entries;
  await op.db_remove_orphaned_entries();
  op.conn.close();
  op.channel.close();
}

async function handle_refresh_icons_alarm(alarm) {
  const proms = [db_open(), favicon_create_conn()];
  const [rconn, iconn] = await Promise.all(proms);
  const channel = new BroadcastChannel(localStorage.channel_name);

  const op = {};
  op.rconn = rconn;
  op.iconn = iconn;
  op.channel = channel;
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

  const rconn = await db_open();
  const iconn = await favicon_create_conn();
  const channel = new BroadcastChannel(localStorage.channel_name);

  await poll_feeds(rconn, iconn, channel, options);

  channel.close();
  iconn.close();
  rconn.close();
}

function query_idle_state(idle_period_secs) {
  return new Promise(function executor(resolve, reject) {
    chrome.idle.queryState(idle_period_secs, resolve);
  });
}

// On module load, register the install listener
// TODO: somehow do not do this on every page load, no idea how though
register_install_listener();

chrome.browserAction.onClicked.addListener(open_view);

// TODO: move this function definition to badge.js?
async function badge_init() {
  const conn = await db_open();
  refresh_badge(conn).catch(log);
  conn.close();
}

badge_init();

chrome.alarms.onAlarm.addListener(function(alarm) {
  log('onalarm: alarm name', alarm.name);
  localStorage.LAST_ALARM = alarm.name;

  switch (alarm.name) {
    case 'archive':
      handle_archive_alarm_wakeup(alarm).catch(log);
      break;
    case 'poll':
      handle_poll_feeds_alarm(alarm).catch(log);
      break;
    case 'remove-entries-missing-urls':
      handle_lost_entries_alarm(alarm).catch(log);
      break;
    case 'remove-orphaned-entries':
      handle_orphan_entries_alarm(alarm).catch(log);
      break;
    case 'refresh-feed-icons':
      handle_refresh_icons_alarm(alarm).catch(log);
      break;
    case 'compact-favicon-db':
      handle_compact_favicons_alarm(alarm).catch(log);
      break;
    default:
      log('unhandled alarm', alarm.name);
      break;
  }
});

chrome.alarms.create('archive', {periodInMinutes: 60 * 12});
chrome.alarms.create('poll', {periodInMinutes: 60});
chrome.alarms.create(
    'remove-entries-missing-urls', {periodInMinutes: 60 * 24 * 7});
chrome.alarms.create(
    'db-remove-orphaned-entries', {periodInMinutes: 60 * 24 * 7});
chrome.alarms.create('refresh-feed-icons', {periodInMinutes: 60 * 24 * 7 * 2});
chrome.alarms.create('compact-favicon-db', {periodInMinutes: 60 * 24 * 7});
