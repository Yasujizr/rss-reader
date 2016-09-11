// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

{ // Begin file block scope

const viewURL = chrome.extension.getURL('slideshow.html');

// The trailing slash is required
const newTabURL = 'chrome://newtab/';

// TODO: is there a way to not do this on every page load?
chrome.browserAction.onClicked.addListener(function(event) {
  chrome.tabs.query({'url': viewURL}, onQueryForViewTab);
});

function onQueryForViewTab(tabs) {
  if(tabs && tabs.length) {
    chrome.tabs.update(tabs[0].id, {'active': true});
  } else {
    chrome.tabs.query({'url': newTabURL}, onQueryForNewTab);
  }
}

function onQueryForNewTab(tabs) {
  if(tabs && tabs.length) {
    chrome.tabs.update(tabs[0].id, {'active': true, 'url': viewURL});
  } else {
    chrome.tabs.create({'url': viewURL});
  }
}

} // End file block scope
