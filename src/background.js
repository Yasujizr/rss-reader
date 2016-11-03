// See license.md

'use strict';

// TODO: is there a way to not re-register things on every page load?
// TODO: is there a way to not rebind onalarm per page load
// TODO: is there a non chrome specific way to do alarms? setInterval would
// not allow the page to unload. some way to wakeup page?
// TODO: create a graceful way to rename/remove alarms. Right now if I stop
// using an alarm it remains silently peristent somewhere in chrome.alarms
// internal state, indefinitely.
// TODO: use multiple listeners, so that each alarm
// can be self registered by the thing that needs it, so I don't have to do
// all the binding here? I'd rather divide up this file

function get_alarm(alarm_name) {
  return new Promise(function(resolve) {
    chrome.alarms.get(alarm_name, resolve);
  });
}

async function create_alarms() {
  if(!get_alarm('archive')) {
    console.debug('Creating archive alarm');
    chrome.alarms.create('archive', {'periodInMinutes': 60 * 12});
  }

  if(!get_alarm('poll')) {
    console.debug('Creating poll alarm');
    chrome.alarms.create('poll', {'periodInMinutes': 60});
  }

  if(!get_alarm('compact-favicons')) {
    console.debug('Creating compact-favicons alarm');
    chrome.alarms.create('compact-favicons', {'periodInMinutes': 60 * 24 * 7});
  }

  if(!get_alarm('refresh-feed-icons')) {
    console.debug('Creating refresh-feed-icons alarm');
    chrome.alarms.create('refresh-feed-icons',
      {'periodInMinutes': 60 * 24 * 7 * 2});
  }

  if(!get_alarm('healthcheck')) {
    console.debug('Creating healthcheck alarm');
    chrome.alarms.create('healthcheck', {'periodInMinutes': 60 * 24 * 7});
  }
}

create_alarms();

chrome.alarms.onAlarm.addListener(async function(alarm) {
  console.debug('Alarm wakeup', alarm.name);
  if(alarm.name === 'archive') {
    try {
      const conn = await db_connect();
      await archive_entries(conn);
      conn.close();
    } catch(error) {
      console.debug(error);
    }
  } else if(alarm.name === 'poll') {
    try {
      await poll_feeds({'log': console});
    } catch(error) {
      console.debug(error);
    }
  } else if(alarm.name === 'compact-favicons') {
    try {
      const conn = await favicon.connect();
      let num_deleted = await favicon.compact(conn);
      conn.close();
    } catch(error) {
      console.debug(error);
    }
  } else if(alarm.name === 'refresh-feed-icons') {
    try {
      let result = await refresh_feed_icons();
    } catch(error) {
      console.debug(error);
    }
  } else if(alarm.name === 'healthcheck') {
    HealthCheck.start(SilentConsole);
  } else {
    console.warn('Unknown alarm', alarm.name);
  }
});

chrome.runtime.onInstalled.addListener(async function oninstall(event) {
  console.log('Installing extension ...');

  // The initial connect will also trigger database creation/upgrade
  let conn;
  try {
    conn = await db_connect();
    badge_update_text(conn);
  } catch(error) {
    console.debug(error);
  }
  if(conn)
    conn.close();
});

// Must wait for dom to load because badge_onclick is in a separate js file
function on_bg_loaded() {
  chrome.browserAction.onClicked.addListener(badge_onclick);
}

document.addEventListener('DOMContentLoaded', on_bg_loaded, {'once': true});
