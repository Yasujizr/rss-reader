// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-`style` license
// that can be found in the LICENSE file

'use strict';

// TODO: remove the subscription preview feature

const OptionsPage = {};

// TODO: what are these? elements? ints? use clearer names
// TODO: maybe make an OptionsMenu class and have these be member variables
OptionsPage.currentMenuItem = null;
OptionsPage.currentSection = null;

OptionsPage.hideElement = function(element) {
  element.style.display = 'none';
};

OptionsPage.showElement = function(element) {
  element.style.display = 'block';
};

OptionsPage.addClass = function(element, classNameString) {
  element.classList.add(classNameString);
};

OptionsPage.removeClass = function(element, classNameString) {
  element.classList.remove(classNameString);
};

OptionsPage.isElementVisible = function(element) {
  return element.style.display === 'block';
};

// TODO: maybe make an OptionsPageErrorMessage class and have show and
// hide be member functions?
OptionsPage.showErrorMessage = function(messageString, shouldFadeIn) {
  OptionsPage.hideErrorMessage();

  const errorWidgetElement = document.createElement('div');
  errorWidgetElement.setAttribute('id','options_error_message');

  const messageElement = document.createElement('span');
  messageElement.textContent = messageString;
  errorWidgetElement.appendChild(messageElement);

  const dismissButton = document.createElement('button');
  dismissButton.setAttribute('id', 'options_dismiss_error_button');
  dismissButton.textContent = 'Dismiss';
  dismissButton.onclick = OptionsPage.hideErrorMessage;
  errorWidgetElement.appendChild(dismissButton);

  if(shouldFadeIn) {
    errorWidgetElement.style.opacity = '0';
    document.body.appendChild(errorWidgetElement);
    fade_element(container, 1, 0);
  } else {
    errorWidgetElement.style.opacity = '1';
    OptionsPage.showElement(errorWidgetElement);
    document.body.appendChild(errorWidgetElement);
  }
};

// TODO: maybe make an OptionsPageErrorMessage class and have this be
// a member function.
OptionsPage.hideErrorMessage = function() {
  const errorMessage = document.getElementById('options_error_message');
  if(errorMessage) {
    const dismissButton = document.getElementById(
      'options_dismiss_error_button');
    if(dismissButton) {
      dismissButton.removeEventListener('click', OptionsPage.hideErrorMessage);
    }

    errorMessage.remove();
  }
};

// TODO: instead of removing and re-adding, reset and reuse
// TODO: maybe make an OptionsSubscriptionMonitor class and have this just be
// a member function. Call it a widget.
OptionsPage.showSubscriptionMonitor = function() {
  OptionsPage.resetSubscriptionMonitor();

  const monitorElement = document.createElement('div');
  monitorElement.setAttribute('id', 'options_subscription_monitor');
  monitorElement.style.opacity = '1';
  document.body.appendChild(monitorElement);

  const progressElement = document.createElement('progress');
  progressElement.textContent = 'Working...';
  monitorElement.appendChild(progressElement);
};

OptionsPage.resetSubscriptionMonitor = function() {
  const monitorElement = document.getElementById(
    'options_subscription_monitor');
  if(monitorElement) {
    monitorElement.remove();
  }
};

OptionsPage.updateSubscriptionMonitorMessage = function(messageString) {
  const monitorElement = document.getElementById(
    'options_subscription_monitor');
  if(!monitorElement) {
    console.error('No element with id options_subscription_monitor found');
    return;
  }

  const messageElement = document.createElement('p');
  messageElement.textContent = messageString;
  monitorElement.appendChild(messageElement);
};

OptionsPage.hideSubscriptionMonitor = function(callback, fadeOut) {
  const monitorElement = document.getElementById(
    'options_subscription_monitor');

  if(!monitorElement) {
    if(callback) {
      callback();
      return;
    }
  }

  if(fadeOut) {
    fade_element(monitorElement, 2, 1, removeThenCallCallback);
  } else {
    removeThenCallCallback();
  }

  function removeThenCallCallback() {
    if(monitorElement) {
      monitorElement.remove();
    }

    if(callback) {
      callback();
    }
  }
};

OptionsPage.showSection = function(menuItem) {
  // TODO: maybe do not check for this? Should just fail if I forgot to set it
  // somewhere.
  if(!menuItem) {
    return;
  }

  // Do nothing if not switching.
  if(OptionsPage.currentMenuItem === menuItem) {
    return;
  }

  // Make the previous item appear de-selected
  if(OptionsPage.currentMenuItem) {
    OptionsPage.removeClass(OptionsPage.currentMenuItem,
      'navigation-item-selected');
  }

  // Hide the old section
  if(OptionsPage.currentSection) {
    OptionsPage.hideElement(OptionsPage.currentSection);
  }

  // Make the new item appear selected
  OptionsPage.addClass(menuItem, 'navigation-item-selected');

  // Show the new section
  const sectionId = menuItem.getAttribute('section');
  const sectionElement = document.getElementById(sectionId);
  if(sectionElement) {
    OptionsPage.showElement(sectionElement);
  }

  // Update the global tracking vars
  OptionsPage.currentMenuItem = menuItem;
  OptionsPage.currentSection = sectionElement;
};

// TODO: also return the count so that caller does not need to potentially
// do it again. Or, require count to be passed in and change this to just
// options_set_feed_count (and create options_get_feed_count)
// Then, also consider if options_get_feed_count should be using the UI as
// its source of truth or should instead be using the database.
OptionsPage.updateFeedCount = function() {
  const feedListElement = document.getElementById('feedlist');
  const countElement = document.getElementById('subscription-count');
  const count = feedListElement.childElementCount;
  if(count > 1000) {
    countElement.textContent = ' (999+)';
  } else {
    countElement.textContent = ' (' + count + ')';
  }
};

// TODO: this approach doesn't really work, I need to independently sort
// on load because it should be case-insensitive.

// TODO: rename, where is this appending, and to what? Maybe this should be a
// member function of some type of feed menu object
// TODO: this should always use inserted sort, that should be invariant, and
// so I shouldn't accept a parameter
OptionsPage.appendFeed = function(feed, insertedSort) {
  const item = document.createElement('li');
  item.setAttribute('sort-key', feed.title);

  // TODO: stop using custom feed attribute?
  // it is used on unsubscribe event to find the LI again,
  // is there an alternative?
  item.setAttribute('feed', feed.id);

  if(feed.description) {
    item.setAttribute('title', feed.description);
  }

  item.onclick = OptionsPage.feedListOnItemClick;

  if(feed.faviconURLString) {
    const faviconElement = document.createElement('img');
    faviconElement.src = feed.faviconURLString;
    if(feed.title) {
      faviconElement.title = feed.title;
    }

    faviconElement.setAttribute('width', '16');
    faviconElement.setAttribute('height', '16');
    item.appendChild(faviconElement);
  }

  const titleElement = document.createElement('span');
  let feedTitleString = feed.title || 'Untitled';
  feedTitleString = truncate_html(feedTitleString, 300);
  titleElement.textContent = feedTitleString;
  item.appendChild(titleElement);

  const feedListElement = document.getElementById('feedlist');

  const lcTitle = feedTitleString.toLowerCase();

  // Insert the feed item element into the proper position in the list
  if(insertedSort) {
    let added = false;
    for(let child of feedListElement.childNodes) {
      const key = (child.getAttribute('sort-key') || '').toLowerCase();
      if(indexedDB.cmp(lcTitle, key) < 0) {
        feedListElement.insertBefore(item, child);
        added = true;
        break;
      }
    }

    if(!added) {
      feedListElement.appendChild(item);
    }
  } else {
    feedListElement.appendChild(item);
  }
};

// TODO: deprecate the ability to preview
// TODO: check if already subscribed before preview?
// TODO: rename url to something like feedURL, it's not just any url
OptionsPage.showSubscriptionPreview = function(url) {

  console.assert(Object.prototype.toString.call(url) === '[object URL]',
    'not a URL object', url);

  OptionsPage.hideSubscriptionPreview();

  if(!localStorage.ENABLE_SUBSCRIBE_PREVIEW) {
    OptionsPage.startSubscription(url);
    return;
  }

  // TODO: this check no longer makes sense, must be online in order to
  // subscribe because I removed the ability to subscribe while offline
  if('onLine' in navigator && !navigator.onLine) {
    OptionsPage.startSubscription(url);
    return;
  }

  const previewElement = document.getElementById('subscription-preview');
  OptionsPage.showElement(previewElement);
  const progressElement = document.getElementById(
    'subscription-preview-load-progress');
  OptionsPage.showElement(progressElement);

  const excludeEntries = false;
  const timeoutMillis = 10 * 1000;
  fetchService.fetch(url, timeoutMillis, excludeEntries, onFetchFeed);

  function onFetchFeed(fetchEvent) {
    if(event.type !== 'load') {
      console.dir(event);
      OptionsPage.hideSubscriptionPreview();
      // NOTE: because of concatenate this implicitly converts url to string
      // which is fine
      OptionsPage.showErrorMessage('Unable to fetch' + url);
      return;
    }

    const progressElement = document.getElementById(
      'subscription-preview-load-progress');
    OptionsPage.hideElement(progressElement);

    const feed = fetchEvent.feed;
    const titleElement = document.getElementById('subscription-preview-title');
    titleElement.textContent = feed.title || 'Untitled';

    // Fetch feed generates an array of URL objects. Use the last one in the
    // list as the button's value.
    const continueButton = document.getElementById(
      'subscription-preview-continue');
    const finalFeedURL = feed.urls[feed.urls.length - 1];
    continueButton.value = finalFeedURL.href;

    const resultsListElement = document.getElementById(
      'subscription-preview-entries');

    if(!feed.entries.length) {
      var item = document.createElement('li');
      item.textContent = 'No previewable entries';
      resultsListElement.appendChild(item);
    }

    const resultLimit = Math.min(5,feed.entries.length);
    // TODO: use for .. of
    for(let i = 0, entry, item, content; i < resultLimit; i++) {
      entry = feed.entries[i];
      item = document.createElement('li');
      item.innerHTML = replace_html(entry.title || '', '');
      content = document.createElement('span');
      content.innerHTML = replace_html(entry.content || '', '');
      item.appendChild(content);
      resultsListElement.appendChild(item);
    }
  }
};

OptionsPage.hideSubscriptionPreview = function() {
  const previewElement = document.getElementById('subscription-preview');
  OptionsPage.hideElement(previewElement);
  const resultsListElement = document.getElementById(
    'subscription-preview-entries');
  while(resultsListElement.firstChild) {
    resultsListElement.firstChild.remove();
  }
};

OptionsPage.startSubscription = function(url) {

  console.assert(Object.prototype.toString.call(url) === '[object URL]',
    'not a URL object', url);

  OptionsPage.hideSubscriptionPreview();
  OptionsPage.showSubscriptionMonitor();
  OptionsPage.updateSubscriptionMonitorMessage('Subscribing to' + url.href);

  // TODO: if subscribing from a discover search result, I already know some
  // of the feed's other properties, such as its title and link. I should be
  // passing those along to startSubscription and setting them here. Or
  // startSubscription should expect a feed object as a parameter.

  const feed = new Feed();
  feed.addURL(url);
  subscribe(feed, {'callback': onSubscribe});

  function onSubscribe(event) {
    if(event.type !== 'success') {
      OptionsPage.hideSubscriptionMonitor(showErrorMessage.bind(event.type));
      return;
    }

    // TODO: if subscription.add yields a Feed object instead of a basic
    // feed, I should just use event.feed.getURL()

    OptionsPage.appendFeed(event.feed, true);
    OptionsPage.updateFeedCount();
    OptionsPage.updateSubscriptionMonitorMessage(
      'Subscribed to ' + Feed.prototype.getURL.call(event.feed).toString());

    // Hide the sub monitor then switch back to the main feed list
    OptionsPage.hideSubscriptionMonitor(function() {
      const subSection = document.getElementById('mi-subscriptions');
      OptionsPage.showSection(subSection);
    }, true);
  }

  function showErrorMessage(type) {
    if(type === 'ConstraintError') {
      OptionsPage.showErrorMessage('Already subscribed to ' + url.href);
    } else if(type === 'FetchError') {
      OptionsPage.showErrorMessage('Failed to fetch ' + url.href);
    } else if(type === 'ConnectionError') {
      OptionsPage.showErrorMessage('Unable to connect to database');
    } else {
      OptionsPage.showErrorMessage('Unknown error');
    }
  }
};

// TODO: show num entries, num unread/red, etc
// TODO: show dateLastModified, datePublished, dateCreated, dateUpdated
// TODO: react to errors
OptionsPage.populateFeedDetails = function(feedId) {
  console.assert(!isNaN(feedId) && feedId > 0, 'invalid feed id', feedId);

  const context = {
    'connection': null
  };

  open_db(onOpenDatabase);
  function onOpenDatabase(connection) {
    if(connection) {
      context.connection = connection;
      const transaction = connection.transaction('feed');
      const store = transaction.objectStore('feed');
      const request = store.get(feedId);
      request.onsuccess = onFindFeedById;
      request.onerror = onFindFeedById;
    } else {
      // TODO: show an error message?
      console.error('Database connection error');
    }
  }

  function onFindFeedById(event) {

    if(event.type !== 'success') {
      console.error(event);
      if(context.connection) {
        context.connection.close();
      }

      return;
    }

    if(!event.target.result) {
      console.error('No feed found with id', feedId);
      if(context.connection) {
        context.connection.close();
      }
      return;
    }

    // Deserialize the feed
    const feed = new Feed(event.target.result);

    const titleElement = document.getElementById('details-title');
    titleElement.textContent = feed.title || 'Untitled';

    const faviconElement = document.getElementById('details-favicon');
    if(feed.faviconURLString) {
      faviconElement.setAttribute('src', feed.faviconURLString);
    } else {
      faviconElement.removeAttribute('src');
    }

    const descriptionElement = document.getElementById(
      'details-feed-description');
    if(feed.description) {
      descriptionElement.textContent = feed.description;
    } else {
      descriptionElement.textContent = '';
    }

    const feedURLElement = document.getElementById('details-feed-url');
    feedURLElement.textContent = feed.getURL().toString();

    const feedLinkElement = document.getElementById('details-feed-link');
    if(feed.link) {
      feedLinkElement.textContent = feed.link.toString();
    } else {
      feedLinkElement.textContent = '';
    }

    const unsubscribeButton = document.getElementById('details-unsubscribe');
    unsubscribeButton.value = '' + feed.id;

    if(context.connection) {
      context.connection.close();
    }
  }
};

OptionsPage.feedListOnItemClick = function(event) {
  const element = event.currentTarget;
  const feedIdString = element.getAttribute('feed');
  const feedId = parseInt(feedIdString, 10);

  if(isNaN(feedId)) {
    console.debug('Invalid feed id:', feedIdString);
    // TODO: react to this error
    return;
  }

  OptionsPage.populateFeedDetails(feedId);
  // TODO: These calls should really be in an async callback
  // passed to OptionsPage.populateFeedDetails
  const feedDetailsSection = document.getElementById('mi-feed-details');
  OptionsPage.showSection(feedDetailsSection);

  // Ensure the details are visible. If scrolled down when viewing large
  // list of feeds, it would otherwise not be immediately visible.
  window.scrollTo(0,0);
};

OptionsPage.onSubscriptionFormSubmit = function(event) {
  // Prevent normal form submission behavior
  event.preventDefault();

  const queryElement = document.getElementById('subscribe-discover-query');
  let queryString = queryElement.value;
  queryString = queryString || '';
  queryString = queryString.trim();

  if(!queryString) {
    return false;
  }

  // TODO: Suppress resubmits if last query was a search and the
  // query did not change

  // Do nothing if searching in progress
  const progressElement = document.getElementById('discover-in-progress');
  if(OptionsPage.isElementVisible(progressElement)) {
    return false;
  }

  // Do nothing if subscription in progress
  const subMonitor = document.getElementById('options_subscription_monitor');
  if(subMonitor && OptionsPage.isElementVisible(subMonitor)) {
    return false;
  }

  // Clear the previous results list
  const resultsListElement = document.getElementById('discover-results-list');
  while(resultsListElement.firstChild) {
    resultsListElement.firstChild.remove();
  }

  // Ensure the no-results-found message, if present from a prior search,
  // is hidden. This should never happen because we exit early if it is still
  // visible above.
  OptionsPage.hideElement(progressElement);

  let url = null;
  try {
    url = new URL(queryString);
  } catch(exception) {}

  // If it is a URL, subscribe, otherwise, search
  if(url) {
    OptionsPage.hideElement(progressElement);
    queryElement.value = '';
    OptionsPage.showSubscriptionPreview(url);
  } else {
    // Show search results
    OptionsPage.showElement(progressElement);
    const timeoutInMillis = 5000;
    search_google_feeds(queryString, timeoutInMillis,
      OptionsPage.onSearchGoogleFeeds);
  }

  // Indicate that the normal form submit behavior should be prevented
  return false;
};

OptionsPage.onDiscoverSubscriptionButtonClick = function(event) {

  const buttonSubscribe = event.target;
  const feedURLString = buttonSubscribe.value;

  // TODO: this will always be defined, so this check isn't necessary, but I
  // tentatively leaving it in here
  if(!feedURLString) {
    return;
  }

  // TODO: Ignore future clicks if an error was displayed?

  // Ignore future clicks while subscription in progress
  // TODO: use a better element name here.
  const subMonitor = document.getElementById('options_subscription_monitor');
  if(subMonitor && OptionsPage.isElementVisible(subMonitor)) {
    return;
  }

  // Show subscription preview expects a URL object, so convert. This can
  // throw but never should so I do not use try/catch.
  const feedURL = new URL(feedURLString);
  // TODO: I plan to deprecate the preview step, so this should probably be
  // making a call directly to the step that starts the subscription process.
  OptionsPage.showSubscriptionPreview(feedURL);
};

OptionsPage.onSearchGoogleFeeds = function(event) {
  const query = event.query;
  const results = event.entries;
  const progressElement = document.getElementById('discover-in-progress');
  const noResultsElement = document.getElementById('discover-no-results');
  const resultsList = document.getElementById('discover-results-list');

  // If an error occurred, hide the progress element and show an error message
  // and exit early.
  if(event.type !== 'success') {
    console.debug(event);
    OptionsPage.hideElement(progressElement);
    OptionsPage.showErrorMessage('An error occurred when searching for feeds');
    return;
  }

  // Searching completed, hide the progress
  OptionsPage.hideElement(progressElement);
  if(!results.length) {
    OptionsPage.hideElement(resultsList);
    OptionsPage.showElement(noResultsElement);
    return;
  }

  if(OptionsPage.isElementVisible(resultsList)) {
    resultsList.innerHTML = '';
  } else {
    OptionsPage.hideElement(noResultsElement);
    OptionsPage.showElement(resultsList);
  }

  // Add an initial count of the number of feeds as one of the feed list items
  const listItem = document.createElement('li');
  listItem.textContent = 'Found ' + results.length + ' results.';
  resultsList.appendChild(listItem);

  // Lookup the favicons for the results

  let faviconResultsProcessed = 0;
  for(let result of results) {
    if(result.link) {
      let linkURL = null;
      try {
        linkURL = new URL(result.link);
      } catch(exception) {
      }
      if(linkURL) {
        lookup_favicon(linkURL, null, onLookupFavicon.bind(null, result));
      } else {
        faviconResultsProcessed++;
        if(faviconResultsProcessed === results.length) {
          onAllResultFaviconsProcessed();
        }
      }
    } else {
      faviconResultsProcessed++;
      if(faviconResultsProcessed === results.length) {
        onAllResultFaviconsProcessed();
      }
    }
  }

  if(!results.length) {
    console.debug('No results so favicon processing finished');
    onAllResultFaviconsProcessed();
  }

  function onLookupFavicon(result, iconURL) {
    faviconResultsProcessed++;
    if(iconURL) {
      result.faviconURLString = iconURL.href;
    }

    if(faviconResultsProcessed === results.length) {
      onAllResultFaviconsProcessed();
    }
  }

  function onAllResultFaviconsProcessed() {
    console.debug('Finished processing favicons for search results');
    // Generate an array of result elements to append
    const resultElements = results.map(OptionsPage.createSearchResult);

    // Append the result elements
    for(let i = 0, len = resultElements.length; i < len; i++) {
      resultsList.appendChild(resultElements[i]);
    }
  }
};

// Creates and returns a search result item to show in the list of search
// results when searching for feeds.
OptionsPage.createSearchResult = function(feedResult) {
  const item = document.createElement('li');
  const buttonSubscribe = document.createElement('button');
  buttonSubscribe.value = feedResult.url.href;
  buttonSubscribe.title = feedResult.url.href;
  buttonSubscribe.textContent = 'Subscribe';
  buttonSubscribe.onclick = OptionsPage.onDiscoverSubscriptionButtonClick;
  item.appendChild(buttonSubscribe);

  if(feedResult.faviconURLString) {
    const faviconElement = document.createElement('img');
    faviconElement.setAttribute('src', feedResult.faviconURLString);
    if(feedResult.link) {
      faviconElement.setAttribute('title', feedResult.link);
    }
    faviconElement.setAttribute('width', '16');
    faviconElement.setAttribute('height', '16');
    item.appendChild(faviconElement);
  }

  // TODO: don't allow for empty href value
  const anchorTitle = document.createElement('a');
  if(feedResult.link) {
    anchorTitle.setAttribute('href', feedResult.link);
  }
  anchorTitle.setAttribute('target', '_blank');
  anchorTitle.title = feedResult.title;
  anchorTitle.innerHTML = feedResult.title;
  item.appendChild(anchorTitle);

  const spanSnippet = document.createElement('span');
  spanSnippet.innerHTML = feedResult.contentSnippet;
  item.appendChild(spanSnippet);

  const spanURL = document.createElement('span');
  spanURL.setAttribute('class', 'discover-search-result-url');
  spanURL.textContent = feedResult.url.href;
  item.appendChild(spanURL);

  return item;
};

OptionsPage.buttonUnsubscribeOnClick = function(event) {
  console.debug('Clicked Unsubscribe');
  const feedId = parseInt(event.target.value, 10);
  unsubscribe(feedId, onUnsubscribe);

  function onUnsubscribe(event) {
    // If there was some failure to unsubscribe from the feed, react here
    // and then exit early and do not update the UI
    // TODO: show an error message about how there was a problem unsubscribing
    if(event.type !== 'success') {
      console.debug(event);
      return;
    }

    // Remove the feed from the subscription list
    // TODO: getting the feed element from the menu should be more idiomatic,
    // I should probably be using a function here. That, or the function I
    // create that removes the feed accepts a feedId parameter and knows how
    // to get it there.
    // TODO: removing the feed element from the menu should probably be
    // more idiomatic and use a function
    const selector = 'feedlist li[feed="' + feedId + '"]';
    const feedElement = document.querySelector(selector);
    if(feedElement) {
      feedElement.removeEventListener('click', OptionsPage.feedListOnItemClick);
      feedElement.remove();
    }

    // Upon removing the feed, update the displayed number of feeds.
    // TODO: this should probably be baked into the function that removes the
    // feed or some function that handles changes to the feed list, so that
    // I do not need to call it explicitly and do not risk forgetting not to
    // call it.
    OptionsPage.updateFeedCount();

    // Upon removing the feed, update the state of the feed list.
    // If the feed list has no items, hide it and show a message instead
    // TODO: this should probably also be baked into the function that removes
    // the feed from the feed list and not the responsibility of the
    // unsubscribe function.
    const feedListElement = document.getElementById('feedlist');
    const noFeedsElement = document.getElementById('nosubscriptions');
    if(feedListElement.childElementCount === 0) {
      OptionsPage.hideElement(feedListElement);
      OptionsPage.showElement(noFeedsElement);
    }

    // Switch back to the main view
    const sectionMenu = document.getElementById('mi-subscriptions');
    OptionsPage.showSection(sectionMenu);
  }
};

// TODO: needs to notify the user of a successful
// import. In the UI and maybe in a notification. Maybe also combine
// with the immediate visual feedback (like a simple progress monitor
// popup but no progress bar). The monitor should be hideable. No
// need to be cancelable.
// TODO: notify the user if there was an error
// TODO: give immediate visual feedback the import started
// TODO: switch to a different section of the options ui on complete?
OptionsPage.importOPMLButtonOnClick = function(event) {
  import_opml_files();
};

OptionsPage.exportOPMLButtonOnClick = function(event) {
  export_opml_file('Subscriptions', 'subscriptions.xml');
};

OptionsPage.initSubscriptionsSection = function() {
  let feedCount = 0;
  open_db(onOpenDatabase);

  function onOpenDatabase(connection) {
    if(connection) {
      // TODO: load feeds into sorted array?
      const transaction = connection.transaction('feed');
      const store = transaction.objectStore('feed');
      const index = store.index('title');
      const request = index.openCursor();
      request.onsuccess = handleCursor;
    } else {
      // TODO: react to error
      console.debug(event);
    }
  }

  function handleCursor(event) {
    const cursor = event.target.result;
    if(cursor) {
      const feed = cursor.value;
      feedCount++;
      // NOTE: this is calling append feed with a feed object loaded directly
      // from the database, which is diferent than the results of fetch
      OptionsPage.appendFeed(feed);
      OptionsPage.updateFeedCount();
      cursor.continue();
    } else {
      onFeedsIterated();
    }
  }

  function onFeedsIterated() {
    const noFeedsElement = document.getElementById('nosubscriptions');
    const feedListElement = document.getElementById('feedlist');
    if(feedCount === 0) {
      OptionsPage.showElement(noFeedsElement);
      OptionsPage.hideElement(feedListElement);
    } else {
      OptionsPage.hideElement(noFeedsElement);
      OptionsPage.showElement(feedListElement);
    }
  }
};

OptionsPage.onDOMContentLoaded = function(event) {
  // Avoid attempts to re-init
  document.removeEventListener('DOMContentLoaded',
    OptionsPage.onDOMContentLoaded);

  // Init CSS styles that affect the display preview area
  DisplaySettings.loadStyles();

  // Attach click handlers to feeds in the feed list on the left.
  // TODO: it would probably be easier and more efficient to attach a single
  // click handler that figures out which item was clicked.
  // TODO: use for .. of
  const navFeedItems = document.querySelectorAll('#navigation-menu li');
  for(let i = 0, len = navFeedItems.length; i < len; i++) {
    navFeedItems[i].onclick = onNavigationMenuFeedItemClick;
  }

  // Upon clicking a feed in the feed list, switch to showing the details
  // of that feed
  // Use currentTarget instead of event.target as some of the menu items have a
  // nested element that is the desired target
  // TODO: rather than comment, use a local variable here to clarify why
  // currentTarget is more appropriate
  function onNavigationMenuFeedItemClick(event) {
    OptionsPage.showSection(event.currentTarget);
  }

  // Setup the Enable Notifications checkbox in the General Settings section
  const checkboxEnableNotifications = document.getElementById(
    'enable-notifications');
  checkboxEnableNotifications.checked = 'SHOW_NOTIFICATIONS' in localStorage;
  checkboxEnableNotifications.onclick = checkboxEnableNotificationsOnChange;
  function checkboxEnableNotificationsOnChange(event) {
    if(event.target.checked) {
      localStorage.SHOW_NOTIFICATIONS = '1';
    } else {
      delete localStorage.SHOW_NOTIFICATIONS;
    }
  }

  // TODO: this should be using a local storage variable and instead the
  // permission should be permanently defined.
  // TODO: should this be onchange or onclick? I had previously named the
  // function onchange but was listening to onclick
  // TODO: use the new, more global, navigator.permission check instead of
  // the extension API ?
  const checkboxEnableBackgroundProcessing = document.getElementById(
    'enable-background');
  checkboxEnableBackgroundProcessing.onclick =
    checkboxEnableBackgroundProcessingOnClick;
  function checkboxEnableBackgroundProcessingOnClick(event) {
    if(event.target.checked) {
      chrome.permissions.request({'permissions': ['background']},
        noopCallback);
    }
    else {
      chrome.permissions.remove({'permissions': ['background']}, noopCallback);
    }

    function noopCallback() {}
  }
  chrome.permissions.contains({'permissions': ['background']},
    onCheckHasRunInBackgroundPermission);
  function onCheckHasRunInBackgroundPermission(permitted) {
    checkboxEnableBackgroundProcessing.checked = permitted;
  }

  const checkboxEnableIdleCheck = document.getElementById('enable-idle-check');
  checkboxEnableIdleCheck.checked = 'ONLY_POLL_IF_IDLE' in localStorage;
  checkboxEnableIdleCheck.onclick = checkboxEnableIdleCheckOnChange;
  function checkboxEnableIdleCheckOnChange(event) {
    if(event.target.checked) {
      localStorage.ONLY_POLL_IF_IDLE = '1';
    } else {
      delete localStorage.ONLY_POLL_IF_IDLE;
    }
  }

  // TODO: deprecate this because I plan to deprecate the preview ability.
  const checkboxEnableSubscriptionPreview =
    document.getElementById('enable-subscription-preview');
  checkboxEnableSubscriptionPreview.checked =
    'ENABLE_SUBSCRIBE_PREVIEW' in localStorage;
  checkboxEnableSubscriptionPreview.onchange =
    checkboxEnableSubscriptionPreviewOnChange;
  function checkboxEnableSubscriptionPreviewOnChange(event) {
    if(this.checked) {
      localStorage.ENABLE_SUBSCRIBE_PREVIEW = '1';
    } else {
      delete localStorage.ENABLE_SUBSCRIBE_PREVIEW;
    }
  }

  // TODO: deprecate this, url rewriting is always enabled
  const checkboxEnableURLRewriting = document.getElementById(
    'rewriting-enable');
  checkboxEnableURLRewriting.checked = 'URL_REWRITING_ENABLED' in localStorage;
  checkboxEnableURLRewriting.onchange = enableURLRewritingCheckboxOnChange;
  function enableURLRewritingCheckboxOnChange(event) {
    if(checkboxEnableURLRewriting.checked) {
      localStorage.URL_REWRITING_ENABLED = '1';
    } else {
      delete localStorage.URL_REWRITING_ENABLED;
    }
  }

  // Init the opml import/export buttons
  const buttonExportOPML = document.getElementById('button-export-opml');
  buttonExportOPML.onclick = OptionsPage.exportOPMLButtonOnClick;
  const buttonImportOPML = document.getElementById('button-import-opml');
  buttonImportOPML.onclick = OptionsPage.importOPMLButtonOnClick;

  OptionsPage.initSubscriptionsSection();

  // Init feed details section unsubscribe button click handler
  const unsubscribeButton = document.getElementById('details-unsubscribe');
  unsubscribeButton.onclick = OptionsPage.buttonUnsubscribeOnClick;

  // Init the subscription form section
  const formSubscribe = document.getElementById('subscription-form');
  formSubscribe.onsubmit = OptionsPage.onSubscriptionFormSubmit;
  const buttonSubscriptionPreviewContinue = document.getElementById(
    'subscription-preview-continue');
  buttonSubscriptionPreviewContinue.onclick =
    buttonSubscriptionPreviewContinueOnClick;

  function buttonSubscriptionPreviewContinueOnClick(event) {
    const urlString = event.currentTarget.value;
    OptionsPage.hideSubscriptionPreview();

    if(!urlString) {
      console.debug('no url');
      return;
    }

    const feedURL = new URL(urlString);
    OptionsPage.startSubscription(feedURL);
  }

  // Init display settings

  // Setup the entry background image menu
  const menuEntryBackgroundImage = document.getElementById(
    'entry-background-image');
  menuEntryBackgroundImage.onchange = menuEntryBackgroundImageOnChange;

  function menuEntryBackgroundImageOnChange(event) {
    if(event.target.value) {
      localStorage.BACKGROUND_IMAGE = event.target.value;
    } else {
      delete localStorage.BACKGROUND_IMAGE;
    }

    chrome.runtime.sendMessage({'type': 'displaySettingsChanged'});
  }

  // TODO: stop trying to reuse the option variable, just create separate
  // variables
  let option = document.createElement('option');
  option.value = '';
  option.textContent = 'Use background color';
  menuEntryBackgroundImage.appendChild(option);

  // Load and append the various background images into the menu. Set the
  // selected option.
  // TODO: this shouldn't read from the local storage variable per call
  DisplaySettings.BACKGROUND_IMAGE_PATHS.forEach(appendBackgroundImageOption);
  function appendBackgroundImageOption(path) {
    // TODO: option should be a local variable
    option = document.createElement('option');
    option.value = path;
    option.textContent = path.substring('/images/'.length);
    option.selected = localStorage.BACKGROUND_IMAGE === path;
    menuEntryBackgroundImage.appendChild(option);
  }

  // Setup the header font menu
  const menuHeaderFont = document.getElementById('select_header_font');
  option = document.createElement('option');
  option.textContent = 'Use Chrome font settings';
  document.getElementById('select_header_font').appendChild(option);

  // TODO: use a basic for loop
  DisplaySettings.FONT_FAMILIES.forEach(appendHeaderFontOption);
  function appendHeaderFontOption(fontFamily) {
    // TODO: option should be a local variable
    option = document.createElement('option');
    option.value = fontFamily;
    option.selected = fontFamily === localStorage.HEADER_FONT_FAMILY;
    option.textContent = fontFamily;
    document.getElementById('select_header_font').appendChild(option);
  }
  menuHeaderFont.onchange = headerFontMenuOnChange;
  function headerFontMenuOnChange(event){
    if(event.target.value) {
      localStorage.HEADER_FONT_FAMILY = event.target.value;
    } else {
      delete localStorage.HEADER_FONT_FAMILY;
    }
    chrome.runtime.sendMessage({'type': 'displaySettingsChanged'});
  }

  // Setup the body font menu
  const menuBodyFont = document.getElementById('select_body_font');
  option = document.createElement('option');
  option.textContent = 'Use Chrome font settings';
  menuBodyFont.appendChild(option);
  // TODO: use a basic for loop
  DisplaySettings.FONT_FAMILIES.forEach(appendBodyFontOption);

  function appendBodyFontOption(fontFamily) {
    // TODO: use a local variable for option
    option = document.createElement('option');
    option.value = fontFamily;
    option.selected = fontFamily === localStorage.BODY_FONT_FAMILY;
    option.textContent = fontFamily;
    menuBodyFont.appendChild(option);
  }
  menuBodyFont.onchange = bodyFontMenuOnChange;
  function bodyFontMenuOnChange(event) {
    if(event.target.value) {
      localStorage.BODY_FONT_FAMILY = event.target.value;
    } else {
      delete localStorage.BODY_FONT_FAMILY;
    }
    chrome.runtime.sendMessage({'type': 'displaySettingsChanged'});
  }

  const columnCountElement = document.getElementById('column-count');

  // TODO: use a basic for loop here (or for .. of)
  ['1','2','3'].forEach(appendColumnCountOption);

  function appendColumnCountOption(columnCount) {
    // TODO: use a local variable here
    option = document.createElement('option');
    option.value = columnCount;
    option.selected = columnCount === localStorage.COLUMN_COUNT;
    option.textContent = columnCount;
    columnCountElement.appendChild(option);
  }

  columnCountElement.onchange = columnCountMenuOnChange;

  function columnCountMenuOnChange(event) {
    if(event.target.value) {
      localStorage.COLUMN_COUNT = event.target.value;
    } else {
      delete localStorage.COLUMN_COUNT;
    }

    chrome.runtime.sendMessage({'type': 'displaySettingsChanged'});
  }

  const entryBackgroundColorElement = document.getElementById(
    'entry-background-color');
  entryBackgroundColorElement.value = localStorage.ENTRY_BACKGROUND_COLOR ||
    '';
  entryBackgroundColorElement.oninput = backgroundColorOnInput;

  function backgroundColorOnInput() {
    const element = event.target;
    const value = element.value;
    if(value) {
      localStorage.ENTRY_BACKGROUND_COLOR = value;
    } else {
      delete localStorage.ENTRY_BACKGROUND_COLOR;
    }
    chrome.runtime.sendMessage({'type': 'displaySettingsChanged'});
  }

  // Setup the entry margin slider element
  // todo: is it correct to set value to a string or an int?
  const entryMarginElement = document.getElementById('entry-margin');
  entryMarginElement.value = localStorage.ENTRY_MARGIN || '10';
  entryMarginElement.onchange = entryMarginElementOnChange;
  function entryMarginElementOnChange(event) {
    // TODO: why am i defaulting to 10 here?
    localStorage.ENTRY_MARGIN = event.target.value || '10';
    chrome.runtime.sendMessage({'type': 'displaySettingsChanged'});
  }

  const headerFontSizeElement = document.getElementById('header-font-size');
  headerFontSizeElement.value = localStorage.HEADER_FONT_SIZE || '1';
  headerFontSizeElement.onchange = headerFontSizeOnChange;
  function headerFontSizeOnChange(event) {
    localStorage.HEADER_FONT_SIZE = event.target.value || '1';
    chrome.runtime.sendMessage({'type': 'displaySettingsChanged'});
  }

  const inputBodyFontSize = document.getElementById('body-font-size');
  inputBodyFontSize.value = localStorage.BODY_FONT_SIZE || '1';
  inputBodyFontSize.onchange = bodyFontSizeOnChange;
  function bodyFontSizeOnChange(event) {
    localStorage.BODY_FONT_SIZE = event.target.value || '1';
    chrome.runtime.sendMessage({'type': 'displaySettingsChanged'});
  }

  const checkboxJustifyText = document.getElementById('justify-text');
  checkboxJustifyText.checked = 'JUSTIFY_TEXT' in localStorage;
  checkboxJustifyText.onchange = justifyTextCheckboxOnChange;
  function justifyTextCheckboxOnChange(event) {
    if(event.target.checked) {
      localStorage.JUSTIFY_TEXT = '1';
    } else {
      delete localStorage.JUSTIFY_TEXT;
    }
    chrome.runtime.sendMessage({'type': 'displaySettingsChanged'});
  }

  const bodyLineHeightElement = document.getElementById('body-line-height');
  const bodyLineHeight = parseInt(localStorage.BODY_LINE_HEIGHT) || 10;
  bodyLineHeightElement.value = (bodyLineHeight / 10).toFixed(2);
  bodyLineHeightElement.oninput = bodyLineHeightSliderOnChange;
  function bodyLineHeightSliderOnChange(event) {
    localStorage.BODY_LINE_HEIGHT = event.target.value || '10';
    chrome.runtime.sendMessage({'type': 'displaySettingsChanged'});
  }

  // Init the about section
  const manifest = chrome.runtime.getManifest();
  const extensionNameElement = document.getElementById('extension-name');
  extensionNameElement.textContent = manifest.name;
  const extensionVersionElement = document.getElementById('extension-version');
  extensionVersionElement.textValue = manifest.version;
  const extensionAuthorElement = document.getElementById('extension-author');
  extensionAuthorElement.textContent = manifest.author;
  const extensionDescriptionElement = document.getElementById(
    'extension-description');
  extensionDescriptionElement.textContent = manifest.description || '';
  const extensionHomepageElement = document.getElementById(
    'extension-homepage');
  extensionHomepageElement.textContent = manifest.homepage_url;

  // Initially show the subscriptions list
  const subscriptionListElement = document.getElementById('mi-subscriptions');
  OptionsPage.showSection(subscriptionListElement);
};

document.addEventListener('DOMContentLoaded', OptionsPage.onDOMContentLoaded);
