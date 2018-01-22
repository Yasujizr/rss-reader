import assert from "/src/common/assert.js";

// TODO: regarding feed schema, should the group of properties pertaining to a feed's active state
// by grouped together into a sub object? Like:
// {active-props: {active: true, deactivationReasonText: undefined, deactivationDate: undefined}};
// TODO: the active property is poorly named. Something that is named as
// active typically means active. So it would be more appropriate to name this as something
// like activeState or activeFlag. That removes the ambiguity between presence/absence style
// boolean, and true/false boolean.

export const FEED_MAGIC = 0xfeedfeed;

// Create a feed
export function create() {
  const blankFeed = {};
  blankFeed.magic = FEED_MAGIC;
  return blankFeed;
}

// Return true if the input value is a feed
export function isFeed(value) {
  return value !== null && typeof value === 'object' && value.magic === FEED_MAGIC;
}

export const isValidId = function(id) {
  // TODO: is 0 valid?
  return Number.isInteger(id) && id >= 0;
};

export function hasURL(feed) {
  assert(isFeed(feed));
  return feed.urls && (feed.urls.length > 0);
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
// @param url {URL}
export function appendURL(feed, url) {

  if(!isFeed(feed)) {
    console.error('Invalid feed argument:', feed);
    return false;
  }

  if(!(url instanceof URL)) {
    console.error('Invalid url argument:', url);
    return false;
  }

  feed.urls = feed.urls || [];
  const href = url.href;
  if(feed.urls.includes(href)) {
    return false;
  }
  feed.urls.push(href);
  return true;
}

// Returns the url used to lookup a feed's favicon
// Note this expects an actual feed object, not any object. The magic property must be set
// @returns {URL}
export function createIconLookupURL(feed) {
  assert(isFeed(feed));

  // First, prefer the link, as this is the url of the webpage that is associated with the feed.
  // Cannot assume the link is set or valid. But if set, can assume it is valid.
  if(feed.link) {

    try {
      return new URL(feed.link);
    } catch(error) {
      // If feed.link is set it should always be a valid URL
      console.warn(error);

      // If the url is invalid, just fall through
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
      appendURL(mergedFeed, new URL(urlString));
    }
  }

  return mergedFeed;
}