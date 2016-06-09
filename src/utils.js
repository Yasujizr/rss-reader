// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

const utils = {};

// Returns a url string pointing to the favicon associated with the input
// url string.
// NOTE: I originally rolled my own thing that did url parsing and
// looked for a url. I gave up on that and just use Google's own
// favicon service. I am still considering my own local service.
// TODO: this doesn't cache, which means every image request is going out,
// and the browser might cache, but otherwise it is providing tracking
// information. So maybe this should be async and store a local cache.
// TODO: I should probably store the post-redirect url as a feed property and
// query against that property on display, instead of calling this function
// per article.
utils.getFavIconURLString = function(urlString) {
  if(urlString) {
    return 'http://www.google.com/s2/favicons?domain_url=' +
      encodeURIComponent(urlString);
  } else {
    return '/images/rss_icon_trans.gif';
  }
};

utils.array = {};

// Faster than Array.prototype.filter because assumes that the input array
// is dense, and because it does not support custom binding.
utils.array.filter = function(inputArray, predicateFunction) {
  const length = inputArray.length;
  const outputArray = [];
  for(let i = 0, item; i < length; i++) {
    item = inputArray[i];
    if(predicateFunction(item)) {
      outputArray.push(item);
    }
  }
  return outputArray;
};

// Faster than Array.prototype.find because assumes the subject array
// is dense.
// The predicate function should be pure, and especially, it should not modify
// the subject array.
utils.array.find = function(subjectArray, predicateFunction) {
  const length = subjectArray.length;
  for(let i = 0, item; i < length; i++) {
    item = subjectArray[i];
    if(predicateFunction(item)) {
      return item;
    }
  }
};

// Faster than Array.prototype.forEach because assumes dense
utils.array.forEach = function(subjectArray, callback) {
  const length = subjectArray.length;
  for(let i = 0; i < length; i++) {
    callback(subjectArray[i]);
  }
};

// Returns true if the predicate returns true for at least one item of the
// subject array.
// This is faster than Array.prototype.some because it assumes the subject
// array is dense.
utils.array.some = function(subjectArray, predicateFunction) {
  const length = subjectArray.length;
  for(let i = 0; i < length; i++) {
    if(predicateFunction(subjectArray[i])) {
      return true;
    }
  }
  return false;
};

// Updates the unread count of the extension's badge. Connection is optional.
utils.updateBadgeText = function(connection) {
  if(connection) {
    countUnread(connection);
  } else {
    db.open(onConnect);
  }

  function countUnread(connection) {
    const transaction = connection.transaction('entry');
    const store = transaction.objectStore('entry');
    const index = store.index('readState');
    const request = index.count(Entry.Flags.UNREAD);
    request.onsuccess = setText;
  }

  function onConnect(event) {
    if(event.type === 'success') {
      const connection = event.target.result;
      countUnread(connection);
    } else {
      console.debug(event);
      const text = {'text': '?'};
      chrome.browserAction.setBadgeText(text);
    }
  }

  function setText(event) {
    const request = event.target;
    const count = request.result || 0;
    const text = {'text': '' + count};
    chrome.browserAction.setBadgeText(text);
  }
};

utils.fadeElement = function(element, duration, delay, callback) {

  const style = element.style;

  if(style.display === 'none') {
    style.display = '';
    style.opacity = '0';
  }

  if(!style.opacity) {
    style.opacity = style.display === 'none' ? '0' : '1';
  }

  // TODO: why bind here? I moved fadeEnd into this function so I
  // no longer need to do this

  if(callback) {
    const fadeEndCallback = fadeEnd.bind(element, callback, element);
    element.addEventListener('webkitTransitionEnd', fadeEndCallback);
  }

  // property duration function delay
  style.transition = 'opacity ' + duration + 's ease ' + delay + 's';
  style.opacity = style.opacity === '1' ? '0' : '1';

  function fadeEnd(callback, element, event) {
    event.target.removeEventListener('webkitTransitionEnd', fadeEnd);
    callback(element);
  }
};

// TODO: i do not love the innards of this function, make this easier to read
utils.scrollToY = function(element, deltaY, targetY) {
  let scrollYStartTimer; // debounce
  let scrollYIntervalTimer; // incrementally move
  let amountToScroll = 0;
  let amountScrolled = 0;

  return function debounceScrollTo() {
    clearTimeout(scrollYStartTimer);
    clearInterval(scrollYIntervalTimer);
    scrollYStartTimer = setTimeout(startScroll, 5);
  }();

  function startScroll() {
    amountToScroll = Math.abs(targetY - element.scrollTop);
    amountScrolled = 0;

    if(amountToScroll === 0) {
      return;
    }

    scrollYIntervalTimer = setInterval(scrollToY, 20);
  }

  function scrollToY() {
    const currentY = element.scrollTop;
    element.scrollTop += deltaY;
    amountScrolled += Math.abs(deltaY);
    if(currentY === element.scrollTop || amountScrolled >= amountToScroll) {
      clearInterval(scrollYIntervalTimer);
    }
  }
};

utils.date = {};

// A quick and dirty way to get a formatted date string, probably needs some
// improvement eventually.
utils.date.format = function(date, optionalDelimiterString) {
  const datePartsArray = [];
  if(date) {
    datePartsArray.push(date.getMonth() + 1);
    datePartsArray.push(date.getDate());
    datePartsArray.push(date.getFullYear());
  }
  return datePartsArray.join(optionalDelimiterString || '');
};

// TODO: check whether there is a better way to do this in ES6
// TODO: compare to other lib implementations, e.g. underscore/lo-dash
// See http://stackoverflow.com/questions/1353684
utils.date.isValid = function(date) {
  const OBJECT_TO_STRING = Object.prototype.toString;
  return date && OBJECT_TO_STRING.call(date) === '[object Date]' &&
    isFinite(date);
};

utils.string = {};

// Returns whether string1 is equal to string2, case-insensitive
// Assumes both arguments have the toUpperCase method
utils.string.equalsIgnoreCase = function(string1, string2) {
  if(string1 && string2) {
    return string1.toUpperCase() === string2.toUpperCase();
  }

  // e.g. is '' === '', is null === undefined etc
  return string1 === string2;
};

// Removes non-printable characters from a string
// NOTE: untested
// http://stackoverflow.com/questions/21284228
// http://stackoverflow.com/questions/24229262
utils.string.filterControlCharacters = function(string) {
  if(string) {
    return string.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  }
};

// Truncates a string at the given position, and then appends the extension
// string. An ellipsis is appended if an extension was not specified.
// TODO: how does one simply truncate without appending? The test below
// returns false for empty string so i could not use that. maybe something like
// typeof extension === 'string'?
// TODO: i just realized the callers of utils.string.truncate may be passing
// in strings with html entities. Those callers should not be using this
// function, or should resolve entities before using this function.
utils.string.truncate = function(string, position, extension) {
  const ELLIPSIS = '\u2026';
  if(string && string.length > position) {
    extension = extension || ELLIPSIS;
    return string.substr(0, position) + extension;
  }
  return string;
};

// Split the string into an array of word-like token strings. This is very
// rudimentary.
utils.string.tokenize = function(string) {
  if(!string) {
    return [];
  }

  const tokens = string.split(/s+/);

  // Filter zero-length strings
  const definedTokens = tokens.filter(returnFirst);

  function returnFirst(first) {
    return first;
  }

  return definedTokens;
};

utils.string.normalizeSpaces = function(inputString) {
  // The old code
  //inputString = inputString.replace(/&nbsp;/ig, ' ');
  // TODO: match all \s but not \t\r\n, then we do not need
  // to even use a replacement function?
  return inputString.replace(/\s/g, function getReplacement(match) {
    switch(match) {
      case ' ':
      case '\r':
      case '\n':
      case '\t':
        return match;
        break;
      default:
        // console.debug('Replacing:', match.charCodeAt(0));
        return ' ';
    }
  });
};

utils.url = {};

// Returns a substring of the input url string, excluding the protocol and
// also excluding '://'
// TODO: Maybe I do not need to exclude the '//'. On the one hand, I know that
// this means 2 less characters stored per field of each entry object, and 2
// less characters involved in url comparisons. On the other hand, the more
// formal specs and such seem to include the '//' as a part of the rest of the
// url
// NOTE: i have to be careful about throwing exceptions, i am not sure
// that all the calling contexts account for that possibility, this could
// totally mess up some of the async code? So, what should be the behavior in
// the event the urlString is invalid or is relative which would lead to an
// exception? Should this just return the original string, along the lines of
// always consistently returning something and never throwing?
utils.url.filterProtocol = function(urlString) {
  const urlObject = new URL(urlString);
  // Add 2 in order to skip past '//'
  const offset = urlObject.protocol.length + 2;
  return urlObject.href.substr(offset);
};

// Returns whether the given string looks like a URL
utils.url.isURLString = function(inputString) {
  try {
    new URL(inputString);
    return true;
  } catch(exception) {}
  return false;
};

// TODO: I am confident Chrome permits the leading space. I am not so
// confident about the trailing space.
utils.url.isObjectURLString = function(urlString) {
  return /^\s*data\s*:/i.test(urlString);
};

// Applies a set of rules to a url string and returns a modified url string
// Currently this only modifies Google News urls, but I plan to include more
// TODO: research how to bypass feedproxy given the feedburner changes. Google
// reader was deprecated. Several sites only support feed access via feed burner
// Feed burner rewrites all urls to filter through feed burner for I guess
// purposes of link tracking. Figure out how to get past the rewrite. Maybe
// it involves an async process, maybe it requires traversing a chain of
// redirects and therefore the whole process should be more abstract
// TODO: if this becomes complete enough it could merit being its own module,
// but for now I think it is fine as a misc. utility function
utils.url.rewrite = function(url) {
  const GOOGLE_NEWS = /^https?:\/\/news.google.com\/news\/url\?.*url=(.*)/i;
  const matches = GOOGLE_NEWS.exec(url);
  if(matches && matches.length === 2 && matches[1]) {
    return decodeURIComponent(matches[1]);
  }

  return url;
};
