// Utilities for working with app feeds

import assert from "/src/utils/assert.js";
import {isPosInt} from "/src/utils/number.js";
import {isCanonicalURLString} from "/src/url/url-string.js";

export function create() {
  return {};
}

export function isFeed(feed) {
  return typeof feed === 'object';
}

export const isValidId = isPosInt;

export function hasURL(feed) {
  assert(isFeed(feed));
  return feed.urls && feed.urls.length;
}

// Returns the last url in the feed's url list as a string
// @param feed {Object} a feed object
// @returns {String} the last url in the feed's url list
export function peekURL(feed) {
  assert(hasURL(feed));
  return feed.urls[feed.urls.length - 1];
}

// Appends a url to the feed's internal list. Lazily creates the list if needed
// @param feed {Object} a feed object
// @param urlString {String}
export function appendURL(feed, urlString) {
  feed.urls = feed.urls || [];
  const urlObject = new URL(urlString);
  const normalURLString = urlObject.href;
  if(feed.urls.includes(normalURLString)) {
    return false;
  }

  feed.urls.push(normalURLString);
  return true;
}

// Returns the url used to lookup a feed's favicon
// @returns {URL}
export function createIconLookupURL(feed) {
  assert(isFeed(feed));

  // First, prefer the link, as this is the url of the webpage that is associated with the feed.
  // Cannot assume the link is set or valid. But if set, can assume it is valid.
  if(feed.link) {
    assert(isCanonicalURLString(feed.link));
    try {
      return new URL(feed.link);
    } catch(error) {
      // If feed.link is set it should always be a valid URL
      console.warn(error);
    }
  }

  // If the link is missing or invalid then use the origin of the feed's xml url. Assume the feed
  // always has a url.
  const urlString = peekURL(feed);
  const urlObject = new URL(urlString);
  return new URL(urlObject.origin);
}

// Returns a new object that results from merging the old feed with the new feed. Fields from the
// new feed take precedence, except for urls, which are merged to generate a distinct ordered set of
// oldest to newest url. Impure because of copying by reference.
export function merge(oldFeed, newFeed) {
  const mergedFeed = Object.assign(create(), oldFeed, newFeed);

  // After assignment, the merged feed has only the urls from the new feed. So the output feed's url
  // list needs to be fixed. First copy over the old feed's urls, then try and append each new feed
  // url.
  mergedFeed.urls = [...oldFeed.urls];

  if(newFeed.urls) {
    for(const urlString of newFeed.urls) {
      appendURL(mergedFeed, urlString);
    }
  }

  return mergedFeed;
}
