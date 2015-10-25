// Copyright 2014 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

// TODO: implement history? mimic chrome. would need search ability
// TODO: reintroduce document.getElementById function for getElementById
// TODO: move out non UI functionality into libs

function hideErrorMessage() {
  'use strict';
  const container = document.getElementById('options_error_message');
  if(!container) return;
  const dismissButton = document.getElementById('options_dismiss_error_button');
  if(dismissButton)
    dismissButton.removeEventListener('click', hideErrorMessage);
  container.remove();
}

function showErrorMessage(message, fadeIn) {
  'use strict';
  hideErrorMessage();

  const elMessage = document.createElement('span');
  elMessage.textContent = message;
  const dismissButton = document.createElement('button');
  dismissButton.setAttribute('id','options_dismiss_error_button');
  dismissButton.textContent = 'Dismiss';
  dismissButton.onclick = hideErrorMessage;

  const container = document.createElement('div');
  container.setAttribute('id','options_error_message');
  container.appendChild(elMessage);
  container.appendChild(dismissButton);

  if(fadeIn) {
    container.style.opacity = '0';
    document.body.appendChild(container);

    fadeElement(container, 1, 0);

  } else {
    container.style.display = '';
    container.style.opacity = '1';
    document.body.appendChild(container);
  }
}

// TODO: instead of removing and re-adding, reset and reuse

function showSubscriptionMonitor() {
  'use strict';
  resetSubscriptionMonitor();
  const container = document.createElement('div');
  container.setAttribute('id', 'options_subscription_monitor');
  container.style.opacity = '1';
  document.body.appendChild(container);

  const progress = document.createElement('progress');
  progress.textContent = 'working...';
  container.appendChild(progress);
}

function isSubscriptionMonitorDisplayed() {
  'use strict';
  const subMonitor = document.getElementById('options_subscription_monitor');
  return subMonitor && subMonitor.style.display == 'block';
}

function resetSubscriptionMonitor() {
  'use strict';
  const element = document.getElementById('options_subscription_monitor');
  element && element.remove();
}

function updateSubscriptionMonitor(message) {
  'use strict';
  const container = document.getElementById('options_subscription_monitor');
  if(!container) return;
  const paragraph = document.createElement('p');
  paragraph.textContent = message;
  container.appendChild(paragraph);
}

function hideSubsciptionMonitor(onComplete, fadeOut) {
  'use strict';
  const container = document.getElementById('options_subscription_monitor');

  // NOTE: possible bug here, should be checking arguments.length
  const noop = function(){};
  onComplete = onComplete || noop;

  if(!container) {
    return onComplete();
  }

  if(fadeOut) {
    fadeElement(container, 2, 1, removeAndComplete);
  } else {
    removeAndComplete();
  }

  function removeAndComplete() {
    if(container) container.remove();
    onComplete();
  }
}

var currentMenuItem_;
var currentSection_;

function optionsShowSection(menuItem) {
  'use strict';
  if(!menuItem || currentMenuItem_ == menuItem) {
    return;
  }

  menuItem.classList.add('navigation-item-selected');
  if(currentMenuItem_)
    currentMenuItem_.classList.remove('navigation-item-selected');
  if(currentSection_)
    currentSection_.style.display = 'none';

  const section = document.getElementById(menuItem.getAttribute('section'));

  if(section) {
    section.style.display = 'block';
  } else {
    // If this happens then there is a bug in the UI
    // so this is an actual error
    console.error('Could not locate section for %s', menuItem);
  }
  currentMenuItem_ = menuItem;
  currentSection_ = section;
}

function optionsUpdateFeedCount() {
  'use strict';
  const count = document.getElementById('feedlist').childElementCount;
  const countElement = document.getElementById('subscription-count');

  if(count) {
    if(count > 1000) {
      countElement.textContent = ' (999+)';
    } else {
      countElement.textContent = ' ('+ count +')';
    }
  } else {
    countElement.textContent = '';
  }
}

function optionsAppendFeed(feed, insertedSort) {
  'use strict';
  if(!feed) {
    console.error('feed undefined in optionsAppendFeed');
    return;
  }


  const item = document.createElement('li');
  item.setAttribute('sort-key', feed.title);

  // TODO: stop using custom feed attribute?
  // it is used on unsubscribe event to find the LI again,
  // is there an alternative?
  item.setAttribute('feed',feed.id);
  item.setAttribute('title', stripTags(feed.description) || '');
  item.onclick = onFeedListItemClick;
  var favIconElement = document.createElement('img');
  favIconElement.src = getFavIconURL(feed.link);
  if(feed.title) favIconElement.title = feed.title;
  item.appendChild(favIconElement);

  const title = document.createElement('span');
  title.textContent = truncate(feed.title,300) || 'Untitled';
  item.appendChild(title);

  const feedListElement = document.getElementById('feedlist');

  if(insertedSort) {
    const currentItems = feedListElement.childNodes;
    var added = false;

    for(var i = 0, len = currentItems.length; i < len; i++) {
      var currentKey = currentItems[i].getAttribute('sort-key');
      if(indexedDB.cmp(feed.title || '', currentKey || '') == -1) {
        added = true;
        feedListElement.insertBefore(item, currentItems[i]);
        break;
      }
    }

    if(!added) {
      feedListElement.appendChild(item);
    }
  } else {
    feedListElement.appendChild(item);
  }
}

function onEnableSubscriptionPreviewChange() {
  'use strict';
  if(this.checked)
    localStorage.ENABLE_SUBSCRIBE_PREVIEW = '1';
  else
    delete localStorage.ENABLE_SUBSCRIBE_PREVIEW;
}

function showOrSkipSubscriptionPreview(url) {
  'use strict';
  // TODO: do not augment during preview, it takes too long

  console.debug('showOrSkipSubscriptionPreview %s',url);
  hideSubscriptionPreview();

  if(!localStorage.ENABLE_SUBSCRIBE_PREVIEW) {
    console.debug('subscription preview not enabled, skipping preview');
    startSubscription(url);
    return;
  }

  // TODO: use connectivity.js
  if(!navigator.onLine) {
    console.debug('cannot preview while offline, skipping preview');
    startSubscription(url);
    return;
  }

  // Show the preview area
  document.getElementById('subscription-preview').style.display = 'block';
  // Start an indeterminate progress bar.
  document.getElementById('subscription-preview-load-progress').style.display = 'block';

  const timeout = 10 * 1000;

  // TODO: check if already subscribed before preview?
  fetchFeed(url, timeout, onFetch);

  function onFetch(event, result) {
    if(event) {
      console.dir(event);
      hideSubscriptionPreview();
      showErrorMessage('Unable to fetch' + url);
      return;
    }

    // Stop the indeterminate progress bar.
    document.getElementById(
      'subscription-preview-load-progress').style.display = 'none';

    // Show the title
    //document.getElementById('subscription-preview-title').style.display = 'block';
    document.getElementById('subscription-preview-title').textContent =
      result.title || 'Untitled';

    // Update the value of the continue button so its click handler
    // can get the vvalue for subscription
    document.getElementById(
      'subscription-preview-continue').value = result.url;

    // result.title and  result.entries
    if(!result.entries || !result.entries.length) {
      var item = document.createElement('li');
      item.textContent = 'No previewable entries';
      document.getElementById(
        'subscription-preview-entries').appendChild(item);
    }

    // Show up to 5 entries.
    for(var i = 0, len = Math.min(5,result.entries.length); i < len;i++) {
      var entry = result.entries[i];
      var item = document.createElement('li');
      item.innerHTML = stripTags(entry.title);
      var content = document.createElement('span');
      content.innerHTML = stripTags(entry.content);
      item.appendChild(content);
      document.getElementById(
        'subscription-preview-entries').appendChild(item);
    }
  }
}

function hideSubscriptionPreview() {
  'use strict';
  document.getElementById('subscription-preview').style.display = 'none';
  document.getElementById('subscription-preview-entries').innerHTML = '';
}

function startSubscription(url) {
  'use strict';

  hideSubscriptionPreview();

  if(!isValidURL(url)) {
    showErrorMessage('Invalid url "' + url + '".');
    return;
  }

  showSubscriptionMonitor();
  updateSubscriptionMonitor('Subscribing...');

  openDatabaseConnection(function(error, connection) {
    if(error) {
      console.debug(error);
      hideSubsciptionMonitor(function() {
        showErrorMessage('An error occurred while trying to subscribe to ' + 
          url);
      });
      return;
    }

    findFeedByURL(connection, url, onFindByURL.bind(null, connection));
  });

  function onFindByURL(connection, existingFeed) {
    if(existingFeed) {
      hideSubsciptionMonitor(function() {
        showErrorMessage('Already subscribed to ' + url + '.');
      });
      return;
    }

    if(isOffline()) {
      putFeed(connection, null, {url: url}, onSubscribe);
    } else {
      fetchFeed(url, 10 * 1000, onFetch.bind(null, connection));        
    }
  }

  function onFetch(connection, event, remoteFeed) {
    if(event) {
      console.dir(event);
      hideSubsciptionMonitor(function() {
        showErrorMessage('An error occurred while trying to subscribe to ' + url);
      });
      return;
    }

    putFeed(connection, null, remoteFeed, function() {
      onSubscribe(remoteFeed, 0, 0);
    });
  }

  function onSubscribe(addedFeed, entriesProcessed, entriesAdded) {
    optionsAppendFeed(addedFeed, true);
    optionsUpdateFeedCount();
    updateSubscriptionMonitor('Subscribed to ' + url);
    hideSubsciptionMonitor(function() {
      optionsShowSection(document.getElementById('mi-subscriptions'));
    }, true);

    // Show a notification
    var title = addedFeed.title || addedFeed.url;
    showNotification('Subscribed to ' + title);
  }
}

// TODO: show num entries, num unread/red, etc
function populateFeedDetailsSection(feedId) {
  'use strict';

  openDatabaseConnection(function(error, database) {

    if(error) {
      // TODO: react
      console.debug(error);
      return;
    }

    findFeedById(connection, feedId, function(feed) {
      if(!feed) {
        // TODO: react 
        console.error('feed not found');
        return;
      }

      document.getElementById('details-title').textContent = feed.title || 'Untitled';
      const favIconURL = getFavIconURL(feed.url);
      document.getElementById('details-favicon').setAttribute('src', favIconURL);
      document.getElementById('details-feed-description').textContent =
        stripTags(feed.description) || 'No description';
      document.getElementById('details-feed-url').textContent = feed.url;
      document.getElementById('details-feed-link').textContent = feed.link;
      document.getElementById('details-unsubscribe').value = feed.id;
    });
  }); 
}

function onPostPreviewSubscribeClick(event) {
  'use strict';
  const url = event.currentTarget.value;
  hideSubscriptionPreview();
  startSubscription(url);
}

function onFeedListItemClick(event) {
  'use strict';
  const feedId = parseInt(event.currentTarget.getAttribute('feed'));
  populateFeedDetailsSection(feedId);
  // TODO: These calls should really be in an async callback
  // passed to populateFeedDetailsSection
  optionsShowSection(document.getElementById('mi-feed-details'));
  window.scrollTo(0,0);
}

function onSubscribeSubmit(event) {
  'use strict';
  
  event.preventDefault();// Prevent normal form submission event
  
  var query = document.getElementById('subscribe-discover-query').value;
  query = query || '';
  query = query.trim();
  if(!query) {
    return false;
  }

  // TODO: Suppress resubmits if last query was a search and the
  // query did not change

  if(document.getElementById('discover-in-progress').style.display == 'block') {
    return false;
  }

  if(isSubscriptionMonitorDisplayed()) {
    return false;
  }

  if(isValidURL(query)) {
    document.getElementById('discover-results-list').innerHTML = '';
    document.getElementById('discover-no-results').style.display='none';
     document.getElementById('discover-in-progress').style.display='none';
    document.getElementById('subscribe-discover-query').value = '';
    showOrSkipSubscriptionPreview(query);
  } else {
    document.getElementById('discover-results-list').innerHTML = '';
    document.getElementById('discover-no-results').style.display='none';
    document.getElementById('discover-in-progress').style.display='block';

    const request = new GoogleFeedsRequest();
    request.timeout = 5000;
    request.onload = onDiscoverFeedsComplete;
    request.onerror = onDiscoverFeedsError;
    request.send(query);
  }

  return false;
}

function discoverSubscribeClick(event) {
  'use strict';
  const button = event.target;
  const url = button.value;
  if(!url)
    return;

  // TODO: Ignore future clicks if error was displayed?

  // Ignore future clicks while subscription in progress
  const subMonitor = document.getElementById('options_subscription_monitor');
  if(subMonitor && subMonitor.style.display == 'block')
    return;

  showOrSkipSubscriptionPreview(url);
}

function onDiscoverFeedsComplete(query, results) {
  'use strict';

  const resultsList = document.getElementById('discover-results-list');
  document.getElementById('discover-in-progress').style.display='none';

  if(results.length < 1) {
    resultsList.style.display = 'none';
    document.getElementById('discover-no-results').style.display = 'block';
    return;
  }

  if(resultsList.style.display == 'block') {
    resultsList.innerHTML = '';
  } else {
    document.getElementById('discover-no-results').style.display='none';
    resultsList.style.display = 'block';
  }

  const listItem = document.createElement('li');
  listItem.textContent = 'Found ' + results.length + ' results.';
  resultsList.appendChild(listItem);

  results.forEach(function(result) {
    const item = document.createElement('li');
    resultsList.appendChild(item);

    const button = document.createElement('button');
    button.value = result.url;
    button.title = result.url;
    button.textContent = 'Subscribe';
    button.onclick = discoverSubscribeClick;
    item.appendChild(button);

    const image = document.createElement('img');
    image.setAttribute('src', getFavIconURL(result.url));
    image.title = result.link;
    item.appendChild(image);

    const a = document.createElement('a');
    a.setAttribute('href', result.link);
    a.setAttribute('target', '_blank');
    a.title = result.title;
    a.innerHTML = result.title;
    item.appendChild(a);

    const snippetSpan = document.createElement('span');
    snippetSpan.innerHTML = result.contentSnippet;
    item.appendChild(snippetSpan);

    const span = document.createElement('span');
    span.setAttribute('class','discover-search-result-url');
    span.textContent = result.url;
    item.appendChild(span);
  });
}

function onDiscoverFeedsError(errorMessage) {
  'use strict';
  document.getElementById('discover-in-progress').style.display='none';
  console.debug('discover feeds error %o',errorMessage);
  showErrorMessage('An error occurred when searching for feeds. Details: ' + errorMessage);
}

function onUnsubscribeButtonClicked(event) {
  'use strict';
  const feedId = parseInt(event.target.value);

  openDatabaseConnection(function(error, connection) {

    if(error) {
      console.debug(error);
      onComplete(error);
      return;
    }

    unsubscribe(connection, feedId, onComplete);
  });

  function onComplete(event) {

    const sectionMenu = document.getElementById('mi-subscriptions');

    // Update the badge in case any unread articles belonged to 
    // the unsubscribed feed
    updateBadge();

    // TODO: send out a message notifying other views
    // of the unsubscribe. That way the slides view can
    // remove any articles.

    const item = document.querySelector('feedlist li[feed="'+message.feed+'"]')
    if(item) {
      item.removeEventListener('click', onFeedListItemClick);
      item.remove();
    }

    optionsUpdateFeedCount();

    if(document.getElementById('feedlist').childElementCount == 0) {
      document.getElementById('feedlist').style.display = 'none';
      document.getElementById('nosubscriptions').style.display = 'block';
    }

    // Update the options view
    optionsShowSection(sectionMenu);
  }
}

function onEnableURLRewritingChange(event) {
  'use strict';
  if(event.target.checked)
    localStorage.URL_REWRITING_ENABLED = '1';
  else
    delete localStorage.URL_REWRITING_ENABLED;
}

// TODO: onFeedsImported needs to notify the user of a successful
// import. In the UI and maybe in a notification. Maybe also combine
// with the immediate visual feedback (like a simple progress monitor
// popup but no progress bar). The monitor should be hideable. No
// need to be cancelable.
// TODO: notify the user if there was an error parsing the OPML
// TODO: the user needs immediate visual feedback that we are importing
// the OPML file.
// TODO: notify the user
// TODO: switch to a section on complete?
function onImportOPMLClick(event) {
  'use strict';
  const uploader = document.createElement('input');
  uploader.setAttribute('type', 'file');
  uploader.style.display = 'none';

  function onImport(imported, attempted, exceptions) {
    uploader.remove();

    if(exceptions && exceptions.length) {
      console.debug('Encountered exceptions when importing: %o', exceptions);
    }

    console.info('Completed import');
  }

  uploader.onchange = function onChange(event) {
    uploader.removeEventListener('change', onChange);

    if(!uploader.files || !uploader.files.length) {
      return onImport(0,0,[]);
    }

    lucu.opml.import(uploader.files, onImport);
  };

  document.body.appendChild(uploader);
  uploader.click();
}

function onExportOPMLClick(event) {
  'use strict';
  lucu.opml.export(exportOPMLOnComplete);
}

function exportOPMLOnComplete(blob) {
  'use strict';
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.setAttribute('download', 'subscriptions.xml');
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  // Trigger the download
  anchor.click();

  // Cleanup
  URL.revokeObjectURL(blob);
  anchor.remove();
}

function onHeaderFontChange(event){
  'use strict';
  if(event.target.value)
    localStorage.HEADER_FONT_FAMILY = event.target.value;
  else
    delete localStorage.HEADER_FONT_FAMILY;
  chrome.runtime.sendMessage({type: 'displaySettingsChanged'});
}

function onHeaderFontSizeChange(event) {
  'use strict';
  localStorage.HEADER_FONT_SIZE = parseInt(event.target.value) || 1;
  chrome.runtime.sendMessage({type: 'displaySettingsChanged'});
}

function onBodyFontChange(event) {
  'use strict';
  if(event.target.value)
    localStorage.BODY_FONT_FAMILY = event.target.value;
  else
    delete localStorage.BODY_FONT_FAMILY;
  chrome.runtime.sendMessage({type: 'displaySettingsChanged'});
}

function onColumnCountChange(event) {
  'use strict';
  if(event.target.value)
    localStorage.COLUMN_COUNT = event.target.value;
  else
    delete localStorage.COLUMN_COUNT;
  chrome.runtime.sendMessage({type: 'displaySettingsChanged'});
}

function onBodyFontSizeChange(event) {
  'use strict';
  localStorage.BODY_FONT_SIZE = parseInt(event.target.value) || 1;
  chrome.runtime.sendMessage({type: 'displaySettingsChanged'});
}

function onBodyLineHeightChange(event) {
  'use strict';
  localStorage.BODY_LINE_HEIGHT = event.target.value || '10';
  chrome.runtime.sendMessage({type: 'displaySettingsChanged'});
}

function onEntryMarginChange(event) {
  'use strict';
  localStorage.ENTRY_MARGIN = parseInt(event.target.value) || 10;
  chrome.runtime.sendMessage({type: 'displaySettingsChanged'});
}

function onBackgroundImageChange(event) {
  'use strict';
  if(event.target.value)
    localStorage.BACKGROUND_IMAGE = event.target.value;
  else
    delete localStorage.BACKGROUND_IMAGE;
  chrome.runtime.sendMessage({type: 'displaySettingsChanged'});
}

function onJustifyChange(event) {
  'use strict';
  if(event.target.checked)
    localStorage.JUSTIFY_TEXT = '1';
  else
    delete localStorage.JUSTIFY_TEXT;
  chrome.runtime.sendMessage({type: 'displaySettingsChanged'});
}

function onEnableNotificationsChange(event) {
  'use strict';
  if(event.target.checked)
    chrome.permissions.request({permissions:['notifications']}, function(granted) {});
  else
    chrome.permissions.remove({permissions:['notifications']}, function(removed) {});
}

function onEnableBackgroundChange(event) {
  'use strict';
  if(event.target.checked)
    chrome.permissions.request({permissions:['background']}, function(granted) {});
  else
    chrome.permissions.remove({permissions:['background']}, function(removed) {});
}

function onEnableIdleCheckChange(event) {
  'use strict';
  if(event.target.checked)
    chrome.permissions.request({permissions:['idle']}, function(granted){});
  else
    chrome.permissions.remove({permissions:['idle']}, function(removed){});
}

function initNavigation() {
  'use strict';
  const menuItem = document.getElementById('mi-embeds');
  menuItem.style.display = localStorage.EMBED_POLICY == 'ask' ? 'block' : 'none';
  const menuItems = document.querySelectorAll('#navigation-menu li');
  Array.prototype.forEach.call(menuItems, setNavigationOnClick);
}

function setNavigationOnClick(menuItem) {
  'use strict';
  menuItem.onclick = onNavigationClick;
}

function onNavigationClick(event) {
  'use strict';
  // Use currentTarget instead of event.target as some of the menu items have a
  // nested element that is the event.target
  optionsShowSection(event.currentTarget);
}

function initGeneralSettingsSection() {
  'use strict';

  document.getElementById('enable-notifications').onclick = 
    onEnableNotificationsChange;

  chrome.permissions.contains({permissions: ['notifications']}, 
    function(permitted) {
    document.getElementById('enable-notifications').checked = permitted;
  });

  document.getElementById('enable-background').onclick = onEnableBackgroundChange;

  chrome.permissions.contains({permissions:['background']}, 
    function(permitted) {
    document.getElementById('enable-background').checked = permitted;
  });

  document.getElementById('enable-idle-check').onclick = onEnableIdleCheckChange;

  chrome.permissions.contains({permissions:['idle']}, function(permitted) {
    document.getElementById('enable-idle-check').checked = permitted;
  });

  document.getElementById('enable-subscription-preview').checked = !!localStorage.ENABLE_SUBSCRIBE_PREVIEW;
  document.getElementById('enable-subscription-preview').onchange = onEnableSubscriptionPreviewChange;
  document.getElementById('rewriting-enable').checked = !!localStorage.URL_REWRITING_ENABLED;
  document.getElementById('rewriting-enable').onchange = onEnableURLRewritingChange;
}

function initSubscriptionsSection() {
  'use strict';
  document.getElementById('button-export-opml').onclick = onExportOPMLClick;
  document.getElementById('button-import-opml').onclick = onImportOPMLClick;

  let feedCount = 0;

  openDatabaseConnection(function(error, connection) {
    if(error) {
      // TODO: react
      console.debug(error);
      return;
    }

    forEachFeed(connection, handleFeed, true, onComplete);
  });

  function handleFeed(feed) {
    feedCount++;
    optionsAppendFeed(feed);
    optionsUpdateFeedCount();
  }

  function onComplete() {
    if(feedCount == 0) {
      document.getElementById('nosubscriptions').style.display = 'block';
      document.getElementById('feedlist').style.display = 'none';
    } else {
      document.getElementById('nosubscriptions').style.display = 'none';
      document.getElementById('feedlist').style.display = 'block';
    }
  }
}

function initFeedDetailsSection() {
  'use strict';
  const unsubscribeButton = document.getElementById('details-unsubscribe');
  unsubscribeButton.onclick = onUnsubscribeButtonClicked;
}

function initSubscribeDiscoverSection() {
  'use strict';
  document.getElementById('subscription-form').onsubmit = onSubscribeSubmit;
  const previewContinueButton = 
    document.getElementById('subscription-preview-continue');
  previewContinueButton.onclick = onPostPreviewSubscribeClick;
}

function initDisplaySettingsSection() {
  'use strict';


  // Apply the dynamic CSS on load to set the article preview
  // area within the display settings section
  loadEntryStyles();


  var option = document.createElement('option');
  option.value = '';
  option.textContent = 'Use background color';
  document.getElementById('entry-background-image').appendChild(option);

  BACKGROUND_IMAGES.forEach(function(path) {
    option = document.createElement('option');
    option.value = path;

    option.textContent = path.substring('/media/'.length);
    //option.textContent = path;

    option.selected = localStorage.BACKGROUND_IMAGE == path;
    document.getElementById('entry-background-image').appendChild(option);
  });

  document.getElementById('entry-background-image').onchange = onBackgroundImageChange;

  option = document.createElement('option');
  option.textContent = 'Use Chrome font settings';
  document.getElementById('select_header_font').appendChild(option);

  option = document.createElement('option');
  option.textContent = 'Use Chrome font settings';
  document.getElementById('select_body_font').appendChild(option);

  FONT_FAMILIES.forEach(function(fontFamily) {
    option = document.createElement('option');
    option.value = fontFamily;
    option.selected = fontFamily == localStorage.HEADER_FONT_FAMILY;
    option.textContent = fontFamily;
    document.getElementById('select_header_font').appendChild(option);
  });

  FONT_FAMILIES.forEach(function (fontFamily) {
    option = document.createElement('option');
    option.value = fontFamily;
    option.selected = fontFamily == localStorage.BODY_FONT_FAMILY;
    option.textContent = fontFamily;
    document.getElementById('select_body_font').appendChild(option);
  });


  document.getElementById('select_header_font').onchange = onHeaderFontChange;
  document.getElementById('select_body_font').onchange = onBodyFontChange;


  [1,2,3].forEach(function (columnCount) {
    option = document.createElement('option');
    option.value = columnCount;
    option.selected = columnCount == localStorage.COLUMN_COUNT;
    option.textContent = columnCount;
    document.getElementById('column-count').appendChild(option);
  });

  document.getElementById('column-count').onchange = onColumnCountChange;

  var inputChangedTimer, inputChangedDelay = 400;

  document.getElementById('entry-background-color').value = localStorage.ENTRY_BACKGROUND_COLOR || '';
  document.getElementById('entry-background-color').oninput = function() {
    if(event.target.value)
      localStorage.ENTRY_BACKGROUND_COLOR = event.target.value;
    else
      delete localStorage.ENTRY_BACKGROUND_COLOR;
    chrome.runtime.sendMessage({type: 'displaySettingsChanged'});
  };

  document.getElementById('entry-margin').value = parseInt(localStorage.ENTRY_MARGIN) || '10';
  document.getElementById('entry-margin').onchange = onEntryMarginChange;

  document.getElementById('header-font-size').value = parseInt(localStorage.HEADER_FONT_SIZE) || '1';
  document.getElementById('header-font-size').onchange = onHeaderFontSizeChange;
  document.getElementById('body-font-size').value = parseInt(localStorage.BODY_FONT_SIZE) || '1';
  document.getElementById('body-font-size').onchange = onBodyFontSizeChange;
  document.getElementById('justify-text').checked = (localStorage.JUSTIFY_TEXT == '1') ? true : false;
  document.getElementById('justify-text').onchange = onJustifyChange;

  const bodyLineHeight = parseInt(localStorage.BODY_LINE_HEIGHT) || 10;
  document.getElementById('body-line-height').value = (bodyLineHeight / 10).toFixed(2);
  document.getElementById('body-line-height').oninput = onBodyLineHeightChange;
}

function initAboutSection() {
  'use strict';
  const manifest = chrome.runtime.getManifest();

  document.getElementById('extension-name').textContent = manifest.name || '';
  document.getElementById('extension-version').textContent = manifest.version || '';
  document.getElementById('extension-author').textContent = manifest.author || '';
  document.getElementById('extension-description').textContent = manifest.description || '';
  document.getElementById('extension-homepage').textContent = manifest.homepage_url || '';
}

function initOptionsPage(event) {
  'use strict';
  document.removeEventListener('DOMContentLoaded', initOptionsPage);

  initNavigation();

  // Show the default section immediately
  optionsShowSection(document.getElementById('mi-subscriptions'));

  initGeneralSettingsSection();
  initSubscriptionsSection();
  initFeedDetailsSection();
  initSubscribeDiscoverSection();
  initDisplaySettingsSection();
  initAboutSection();
}

document.addEventListener('DOMContentLoaded', initOptionsPage);
