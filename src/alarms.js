'use strict';

// import base/status.js
// import poll/poll.js
// import favicon.js
// import reader-db.js
// import reader-storage.js

async function alarms_on_archive_alarm() {
  let conn, max_age_ms, status;
  try {
    conn = await reader_db_open();
    status = await reader_storage_archive_entries(conn, max_age_ms);
  } catch(error) {
    console.error(error);
  } finally {
    if(conn) {
      conn.close();
    }
  }

  if(status !== STATUS_OK) {
    console.log('archive entries failed status', status);
  }
}

async function alarms_on_compact_favicons_alarm() {
  let max_age_ms, conn;
  try {
    conn = await favicon_db_open();
    await favicon_compact_db(conn, max_age_ms);
  } catch(error) {
    console.warn(error);
  } finally {
    if(conn) {
      conn.close();
    }
  }
}

async function alarms_on_poll_feeds_alarm() {
  const pfc = new poll_feeds_context();
  try {
    [pfc.reader_conn, pfc.icon_conn] = await Promise.all([reader_db_open(),
      favicon_db_open()]);
    await poll_feeds(pfc);
  } catch(error) {
    console.warn(error);
  } finally {
    if(pfc.reader_conn) {
      pfc.reader_conn.close();
    }
    if(pfc.icon_conn) {
      pfc.icon_conn.close();
    }
  }
}

async function alarms_on_remove_lost_entries_alarm() {
  const limit = 100;
  let conn;

  try {
    conn = await reader_db_open();
    await reader_storage_remove_lost_entries(conn, limit);
  } catch(error) {
    console.warn(error);
  } finally {
    if(conn) {
      conn.close();
    }
  }
}

async function alarms_on_remove_orphans_alarm() {
  const limit = 100;
  let conn;

  try {
    conn = await reader_db_open();
    await reader_storage_remove_orphans(conn, limit);
  } catch(error) {
    console.warn(error);
  } finally {
    if(conn) {
      conn.close();
    }
  }
}

async function alarms_on_refresh_feed_icons_alarm() {

  let reader_conn, icon_conn, status;

  try {
    [reader_conn, icon_conn] = await Promise.all([reader_db_open(),
      favicon_db_open()]);
    status = await reader_storage_refresh_feed_icons(reader_conn, icon_conn);
  } catch(error) {
    console.warn(error);
  } finally {
    if(reader_conn) {
      reader_conn.close();
    }
    if(icon_conn) {
      icon_conn.close();
    }
  }

  if(status !== STATUS_OK) {
    console.warn('alarms_on_refresh_feed_icons_alarm invalid status', status);
  }
}

function alarms_on_alarm_wakeup(alarm) {
  console.debug('alarms_on_alarm_wakeup', alarm.name);

  switch(alarm.name) {
  case 'archive':
    alarms_on_archive_alarm();
    break;
  case 'poll':
    alarms_on_poll_feeds_alarm();
    break;
  case 'remove-entries-missing-urls':
    alarms_on_remove_lost_entries_alarm();
    break;
  case 'remove-orphaned-entries':
    alarms_on_remove_orphans_alarm();
    break;
  case 'refresh-feed-icons':
    alarms_on_refresh_feed_icons_alarm();
    break;
  case 'compact-favicon-db':
    alarms_on_compact_favicons_alarm();
    break;
  default:
    console.warn('unhandled alarm', alarm.name);
    break;
  }
}

function alarms_register_all() {
  console.log('alarms_register_all start');

  chrome.alarms.create('archive', {'periodInMinutes': 60 * 12});
  chrome.alarms.create('poll', {'periodInMinutes': 60});
  chrome.alarms.create('remove-entries-missing-urls',
    {'periodInMinutes': 60 * 24 * 7});
  chrome.alarms.create('remove-orphaned-entries',
    {'periodInMinutes': 60 * 24 * 7});
  chrome.alarms.create('refresh-feed-icons',
    {'periodInMinutes': 60 * 24 * 7 * 2});
  chrome.alarms.create('compact-favicon-db',
    {'periodInMinutes': 60 * 24 * 7});
}

chrome.alarms.onAlarm.addListener(alarms_on_alarm_wakeup);


function alarms_dom_content_loaded(event) {
  console.debug('alarms_dom_content_loaded');
  alarms_register_all();
}

// Defer registration until dom content loaded to allow alarms_register_all
// to use external dependencies that may not yet be loaded in script loading
// order.
document.addEventListener('DOMContentLoaded', alarms_dom_content_loaded,
  {'once': true});
