// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

// Called by Chrome when an alarm wakes up
function onAlarm(alarm) {
  if(alarm.name === 'archiveAlarm') {
    // TODO: test whether there is ever called, testing with a temporary
    // local storage variable
    // NOTE: I am not seeing it. This is never getting called.
    // Theory 1: something to do with creating the alarm per page load
    // Theory 2: erroneously not persisted, never have page open long enough
    localStorage.ARCHIVE_ALARM_WOKEUP = '' + Date.now();
    archiveEntries();
  } else if(alarm.name === 'pollAlarm') {
    FeedPoller.start();
  }
}

chrome.alarms.create('archiveAlarm', {'periodInMinutes': 24 * 60});
chrome.alarms.create('pollAlarm', {'periodInMinutes': 20});
chrome.alarms.onAlarm.addListener(onAlarm);
