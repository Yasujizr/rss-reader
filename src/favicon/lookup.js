import assert from "/src/common/assert.js";
import * as FetchUtils from "/src/common/fetch-utils.js";
import {parseHTML} from "/src/common/html-utils.js";
import * as Status from "/src/common/status.js";
import FaviconCache from "/src/favicon/cache.js";

// Class that provides favicon lookup
export default class FaviconLookup {
  constructor() {
    this.cache = undefined;
    this.kMaxFailureCount = 2;
    this.skipURLFetch = false;
    this.maxAgeMs = FaviconCache.MAX_AGE_MS;
    this.fetchHTMLTimeoutMs = 4000;
    this.fetchImageTimeoutMs = 1000;
    this.minImageSize = 50;
    this.maxImageSize = 10240;
  }
}

// TODO: this function is kind of large. I think the issue is cyclomatic complexity? Basically
// it is somewhat hard to read through and follow the flow. I think the difficulty comes primarily
// from insufficient abstraction around the different steps that are taken? Also I think I focused
// too much on trying to re-use variables throughout the function when there really isn't a
// performance benefit (once again ... premature optimization habit).

// Looks up the favicon url for a given web page url
// @param url {URL} the lookup url
// @param document {Document} optional pre-fetched document for the url
// @throws {Error} database related
// @returns {String} the associated favicon url or undefined if not found
FaviconLookup.prototype.lookup = async function(url, document) {
  let status;

  if(!(url instanceof URL)) {
    console.error('Invalid url argument', url);
    return [Status.EINVAL];
  }

  if(typeof document !== 'undefined' && !(document instanceof Document)) {
    console.error('Invalid document argument', document);
    return [Status.EINVAL];
  }

  console.log('Lookup favicon for url', url.href);

  // Store a distinct set of request urls involved in the lookup so that various conditions are
  // simpler to implement and read
  const urls = [];
  urls.push(url.href);

  // Initialize the origin url to the origin of the input url. Non-const because it may change
  // on redirect.
  const originURL = new URL(url.origin);
  let originEntry;

  // If the cache is available, first check if the input url is cached
  if(this.hasOpenCache()) {
    let entry;
    [status, entry] = await this.cache.findEntry(url);
    if(status !== Status.OK) {
      console.error('Error finding entry:', Status.toString(status));
      return [status];
    }

    if(entry) {
      // If we found a fresh entry then exit early with the icon url
      if(entry.iconURLString && !this.isExpired(entry)) {
        return [Status.OK, entry.iconURLString];
      }

      // Otherwise, if the input url is an origin url itself, then check failure count
      if(originURL.href === url.href && entry.failureCount >= this.kMaxFailureCount) {
        console.debug('Max lookup failures exceeded for url', url.href);
        return [Status.OK];
      }
    }
  }

  // If a pre-fetched document was specified, search it and possibly return.
  if(document) {
    let iconURL;
    [status, iconURL] = await this.search(document, url);
    if(status !== Status.OK) {
      console.debug('Failed to search document', url.href);
      // Continue
    }

    if(iconURL) {
      if(this.hasOpenCache()) {
        // This affects both the input entry and the redirect entry. However, since we have not yet
        // checked for the redirect, this basically only affects the input url
        // This does not affect the origin entry because per-page icons are not site-wide. That is,
        // they could be, but it is not guaranteed. The only thing that guarantees site wide if is
        // origin is found and page does not specify.
        status = await this.cache.putAll(urls, iconURL);
        if(status !== Status.OK) {
          console.error('Failed to put entries:', Status.toString(status));
          return [status];
        }
      }
      return [Status.OK, iconURL];
    }
  }

  // Before fetching, check if we reached the max failure count for requests to the origin, if the
  // origin is different than the input url. If the origin is the same, meaning that the input
  // url was itself an origin url, then we already checked.
  if(this.hasOpenCache() && originURL.href !== url.href) {
    // Set origin entry for use near the end of the lookup, so that we do not have to set it again
    // later and avoid doing a second call to findEntry.
    [status, originEntry] = await this.cache.findEntry(originURL);
    if(status !== Status.OK) {
      console.error('Error finding entry:', Status.toString(status));
      return [status];
    }

    if(originEntry && originEntry.failureCount >= this.kMaxFailureCount) {
      console.debug('Max lookup failures exceeded for origin url', originURL.href);
      return [Status.OK];
    }
  }

  // Fetch the url's response, failure is not fatal
  let response;
  if(!document && !this.skipURLFetch) {
    [status, response] = await this.fetchHTML(url);
    if(status !== Status.OK) {
      console.debug('Error %s fetching html for url', Status.toString(status), url.href);
      // Continue
    }
  }

  // Check if the response redirected and is in the cache
  let responseURL;
  if(response) {
    responseURL = new URL(response.url);

    if(FetchUtils.detectURLChanged(url, responseURL)) {

      // If we redirected, and the origin of the response url is different than the origin of the
      // request url, then change the origin to the origin of the response url
      if(responseURL.origin !== url.origin) {
        setURLHrefProperty(originURL, responseURL.origin);
      }

      // Only append if distinct from input url. We only 'redirected' if 'distinct'
      urls.push(responseURL.href);

      // If redirected, then check the cache for the redirect.
      if(this.hasOpenCache()) {
        let entry;
        [status, entry] = await this.cache.findEntry(responseURL);
        if(status !== Status.OK) {
          console.error('Error finding entry:', Status.toString(status));
          return [status];
        }

        if(entry && entry.iconURLString && !this.isExpired(entry)) {
          // Associate the redirect's icon with the input url.
          // This does not affect the redirect entry because its fine as is
          // This does not affect the origin entry because per-page icons do not apply site wide
          status = await this.cache.putAll([url.href], entry.iconURLString);
          if(status !== Status.OK) {
            console.error('Failed to put entries:', Status.toString(status));
            return [status];
          }

          return [Status.OK, entry.iconURLString];
        }
      }
    }
  }

  // Nullify document so there is no ambiguity regarding whether fetching/parsing failed and
  // whether an input document was specified. The document parameter variable is re-used.
  document = undefined;

  // If we successfully fetched the content for the url, parse it into a document in preparation for
  // searching the document. This is not delegated to search because search is sync should not
  // involve networking.
  if(response) {
    [status, document] = await this.parseHTMLResponse(response);
    if(status !== Status.OK) {
      console.error('Failed to parse html response', response.url, Status.toString(status));
      // Continue, parsing error is non-fatal
    }
  }

  // If we successfully parsed the fetched document, search it
  if(document) {
    const baseURL = responseURL ? responseURL : url;
    let iconURL;
    [status, iconURL] = await this.search(document, baseURL);
    if(status !== Status.OK) {
      console.debug('Failed to search document', baseURL.href, Status.toString(status));
      // Fall through
    }

    if(iconURL) {
      if(this.hasOpenCache()) {
        // This does not modify the origin entry if it exists because a per-page icon does not apply
        // site wide. We have not yet added origin to the urls array.
        status = await this.cache.putAll(urls, iconURL);
        if(status !== Status.OK) {
          console.error('Failed to put entries with status ' + status);
          return [status];
        }
      }

      return [Status.OK, iconURL];
    }
  }

  // Check the cache for the origin url if it is distinct from other urls already checked
  if(this.hasOpenCache() && !urls.includes(originURL.href)) {
    // TODO: this block was written before originEntry was global to the lookup function. This
    // should be refactored to not use a block-local "entry" variable and instead just reuse the
    // originEntry variable.

    // Origin url may have changed, so search for its entry again
    let entry;
    [status, entry] = await this.cache.findEntry(originURL);
    if(status !== Status.OK) {
      console.error('Error finding entry:', Status.toString(status));
      return [status];
    }

    // Set the shared origin entry to the new origin entry, which signals to the lookup failure
    // handler not to perform the lookup again
    // TODO: except it doesn't signal to avoid the additional findEntry call properly,
    // because it may be undefined ... maybe the lookup handler should just accept an entry as
    // input instead of the origin url? Or maybe the lookup handler receiving undefined means that
    // we know that entry does not exist.
    originEntry = entry;

    if(entry) {
      const iconURL = entry.iconURLString;
      if(iconURL && !this.isExpired(entry)) {
        // Store the icon for the other urls
        // We did not yet add origin to urls array
        status = await this.cache.putAll(urls, iconURL);
        if(status !== Status.OK) {
          console.error('Failed to put entries:', status);
          return [status];
        }
        return [Status.OK, iconURL];
      } else if(entry.failureCount >= this.kMaxFailureCount) {
        console.error('Max errors exceeded for origin url', originURL.href);
        return [Status.OK];
      }
    }
  }

  // Now append origin to urls list in prep for next step so that it is included in the putAll call
  // TODO: this basically only matters in the block calling the putAll call, so make this operation
  // only occur within that block
  if(!urls.includes(originURL.href)) {
    urls.push(originURL.href);
  }

  // Check for favicon in the origin root directory
  // TODO: this should be considering the redirect url if available, and using the
  // redirect url instead. This avoids cases of 404s, or client-side redirects
  // when Chrome auto-promotes http requests to https. By avoid I mean it skips making the browser
  // do the same work again. Since we update origin url on redirect, this should probably just
  // be doing something like originURL.href + 'favicon.ico'.  Note the lack of the leading slash,
  // because whereas origin excludes the slash so it must be added, href includes the slash.
  const imageURLString = url.origin + '/favicon.ico';
  const imageURLObject = new URL(imageURLString);
  [status, response] = await this.fetchImage(imageURLObject);
  if(status !== Status.OK) {
    console.warn('Failed to fetch image', imageURLObject.href);
    // Continue
  }

  if(this.isAcceptableImageResponse(response)) {
    if(this.hasOpenCache()) {
      status = await this.cache.putAll(urls, response.url);
      if(status !== Status.OK) {
        console.error('Failed to put entries with status ' + status);
        return [status];
      }
    }
    return [Status.OK, response.url];
  }

  if(this.hasOpenCache()) {
    [status] = await this.onLookupFailure(originURL, originEntry);
    if(status !== Status.OK) {
      console.warn('Failed to handle lookup failure property', status);
    }
  }

  return [Status.OK];
};

// Return true if there is both a connected cache and that cache is in the open state
FaviconLookup.prototype.hasOpenCache = function() {
  return this.cache && this.cache.isOpen();
};

// Returns true if response byte size in bounds. Tolerates undefined response.
FaviconLookup.prototype.isAcceptableImageResponse = function(response) {
  if(response) {
    const contentLength = FetchUtils.getContentLength(response);
    if(isNaN(contentLength)) {
      return true;
    }

    return contentLength >= this.minImageSize && contentLength <= this.maxImageSize;
  }
  return false;
};

// Helper that traps non-assertion errors because errors not fatal to lookup
FaviconLookup.prototype.fetchImage = async function(url) {
  if(!(url instanceof URL)) {
    return [Status.EINVAL];
  }

  const options = {method: 'head', timeout: this.fetchImageTimeoutMs};
  const [status, response] = await FetchUtils.fetchHelper(url, options);
  if(status !== Status.OK) {
    console.error('Failed to fetch image', url.href);
    return [status];
  }

  const type = FetchUtils.getMimeType(response);
  if(type && (type.startsWith('image/') || type === 'application/octet-stream')) {
    return [Status.OK, response];
  } else {
    return [Status.OK];
  }
};

// Helper that traps checked errors as those are non-fatal to lookup
FaviconLookup.prototype.fetchHTML = async function(url) {

  if(!(url instanceof URL)) {
    console.error('Invalid url argument', url);
    return [Status.EINVAL];
  }

  const [status, response] = await FetchUtils.fetchHTML(url, this.fetchHTMLTimeoutMs);
  if(status !== Status.OK) {
    console.error('Failed to fetch html:', url.href, Status.toString(status));
    return [status];
  }

  return [Status.OK, response];
};

// TODO: I don't like this function, feels like wrong coupling, inline it again
// Helper that traps non-assertion errors
// @param response {Response or response wrapper}
// @returns {Document}
FaviconLookup.prototype.parseHTMLResponse = async function(response) {
  //assert(response instanceof Response);
  if(!(response instanceof Response)) {
    console.error('Invalid response argument', response);
    return [Status.EINVAL];
  }

  let text;
  try {
    text = await response.text();
  } catch(error) {
    console.error(error);
    return [Status.EFETCH];
  }

  const [status, document, message] = parseHTML(text);
  if(status !== Status.OK) {
    console.error('Failed to parse html response', Status.toString(status));
    return [status];
  }

  return [Status.OK, document];
};

// Returns whether a cache entry is expired
FaviconLookup.prototype.isExpired = function(entry) {
  // Expect entries to always have a date set
  if(!(entry.dateUpdated instanceof Date)) {
    console.error('Entry has invalid dateUpdated value', entry);
    return false;
  }

  if(!Number.isInteger(this.maxAgeMs) || this.maxAgeMs < 0) {
    console.error('Invalid maxAgeMs value', this.maxAgeMs);
    return false;
  }

  // An entry is expired if the difference between the current date and the date the
  // entry was last updated is greater than max age.
  const currentDate = new Date();
  // The subtraction operator on dates yields a difference in milliseconds
  const entryAgeMs = currentDate - entry.dateUpdated;
  return entryAgeMs > this.maxAgeMs;
};

FaviconLookup.prototype.LINK_SELECTOR = [
  'link[rel="icon"][href]',
  'link[rel="shortcut icon"][href]',
  'link[rel="apple-touch-icon"][href]',
  'link[rel="apple-touch-icon-precomposed"][href]'
].join(',');

// Searches the document for favicon urls
// @param document {Document}
// @param baseURL {URL} the base url of the document for resolution purposes
// @returns {String} a favicon url, if found, canonical, and exists (successful HEAD http request)
FaviconLookup.prototype.search = async function(document, baseURL) {
  if(!(document instanceof Document)) {
    console.error('Invalid document argument', document);
    return [Status.EINVAL];
  }

  const candidateURLStrings = this.findCandidateURLStrings(document);
  if(!candidateURLStrings.length) {
    console.debug('No candidates found in document', baseURL.href);
    return [Status.OK];
  }

  // Convert the list of candidate url strings into canonical URL objects
  let canonicalURLs = [];
  for(const candidateURLString of candidateURLStrings) {
    const canonicalURL = resolveURLString(candidateURLString, baseURL);
    // resolveURLString returns undefined on error, only append if defined
    if(canonicalURL) {
      canonicalURLs.push(canonicalURL);
    }
  }

  if(!canonicalURLs.length) {

    // TEMP:
    console.debug('Found candidates but none canonicalizable', baseURL.href, candidateURLStrings);

    return [Status.OK];
  }

  // Remove duplicate urls
  const distinctURLStrings = [];
  const distinctURLs = [];
  for(const url of canonicalURLs) {
    if(!distinctURLStrings.includes(url.href)) {
      distinctURLStrings.push(url.href);
      distinctURLs.push(url);
    }
  }
  canonicalURLs = distinctURLs;

  // Find the first url that exists. Requests are executed serially for now.
  // TODO: concurrent requests
  // TODO: rather than do the requests here, search should return an array of candidates, and
  // search should be a simpler sync function. Validating and picking from amongst the candidates
  // shouldn't be search's concern.

  for(const url of canonicalURLs) {
    let response;
    [status, response] = await this.fetchImage(url);

    if(status === Status.OK && this.isAcceptableImageResponse(response)) {
      return [status, response.url];
    }
  }

  return [Status.OK];
};


// TODO: inline this, this is too simple and only called from one place
// Searches the document for favicon urls
// @param document {Document}
// @return {Array} an array of candidate url strings, canonicalized
FaviconLookup.prototype.findCandidateURLStrings = function(document) {
  assert(document instanceof Document);
  const candidates = [];

  if(!document.head) {
    return candidates;
  }

  const elements = document.head.querySelectorAll(this.LINK_SELECTOR);
  for(const element of elements) {
    const href = element.getAttribute('href');
    if(href) {
      candidates.push(href);
    }
  }

  return candidates;
};


// Returns a promise
// @param originURL {URL}
// @param entry {Object} optional, the existing origin entry
FaviconLookup.prototype.onLookupFailure = function(originURL, entry) {
  assert(this.hasOpenCache());

  if(entry) {
    const newEntry = {};
    newEntry.pageURLString = entry.pageURLString;
    newEntry.dateUpdated = new Date();
    newEntry.iconURLString = entry.iconURLString;
    if('failureCount' in entry) {
      if(entry.failureCount <= this.kMaxFailureCount) {
        newEntry.failureCount = entry.failureCount + 1;


        return this.cache.put(newEntry);
      }
    } else {
      newEntry.failureCount = 1;
      return this.cache.put(newEntry);
    }
  } else {
    const newEntry = {};
    newEntry.pageURLString = originURL.href;
    newEntry.iconURLString = undefined;
    newEntry.dateUpdated = new Date();
    newEntry.failureCount = 1;
    return this.cache.put(newEntry);
  }

  // Default to returning a no-op resolved promise
  return Promise.resolve();
};


// TODO: deprecate
function setURLHrefProperty(url, newHrefString) {
  const guardURL = new URL(newHrefString);
  url.href = guardURL.href;
}

// TODO: maybe inline
function resolveURLString(urlString, baseURL) {
  assert(baseURL instanceof URL);

  // Allow for bad input for caller convenience
  // If the url is not a string (e.g. undefined), return undefined
  if(typeof urlString !== 'string') {
    return;
  }

  // Check if urlString is just whitespace. If just whitespace, then return undefined. This departs
  // from the behavior of the URL constructor, which tolerates an empty or whitespace string as
  // input. The url constructor in that case will create a new URL from the base url exclusively.
  // That is misleading for this purpose.

  // If the length of the string is 0 then return undefined
  if(!urlString) {
    return;
  }

  // If the trimmed length of the string is 0 then return undefined
  if(!urlString.trim()) {
    return;
  }

  let canonicalURL;
  try {
    canonicalURL = new URL(urlString, baseURL);
  } catch(error) {
    // Ignore
  }
  return canonicalURL;
}
