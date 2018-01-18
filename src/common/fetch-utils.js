import assert from "/src/common/assert.js";
import formatString from "/src/common/format-string.js";
import * as MimeUtils from "/src/common/mime-utils.js";
import * as PromiseUtils from "/src/common/promise-utils.js";
import {
  EFETCH, ENET, ENOACCEPT, EOFFLINE, EPOLICY, OK, ETIMEOUT, EINVAL, toString as statusToString
} from "/src/common/status.js";

// TODO: maybe return response, which has response.status built in, and just lose out on
// returning a custom message ... ? Can I create stub responses for errors?
// Yes, see https://developer.mozilla.org/en-US/docs/Web/API/Response/Response
// For that matter I can also just check response.ok instead of checking the various statuses.
// Then I don't even need to check response.ok at end of fetchHelper.
// But are there client side http status codes?

// Fetches the html content of the given url
// @param url {URL} request url
// @param timeoutMs {Number} optional, in milliseconds, how long to wait before considering the
// fetch to be a failure.
export async function fetchHTML(url, timeoutMs) {
  const [status, response] = await fetchHelper(url, {
    timeout: timeoutMs
  });

  if(status !== OK) {
    return [status, response, url];
  }

  const mimeType = getMimeType(response);
  if(mimeType !== 'text/html') {
    console.error('Unacceptable mime type fetching html', url.href, mimeType);
    return [ENOACCEPT, null, url, mimeType];
  }

  return [status, response, url];
}

const feedTypes = [
  'application/octet-stream',
  'application/rss+xml',
  'application/rdf+xml',
  'application/atom+xml',
  'application/xml',
  'text/html',
  'text/xml'
];

// Fetches a feed. Returns a basic object, similar to Response, with custom properties.
// @param url {URL} request url
// @param timeoutMs {Number} optional, timeout in milliseconds, before considering the fetch a
// failure
// @returns {Promise} a promise that resolves to a response
export async function fetchFeed(url, timeoutMs) {
  const [status, response] = await fetchHelper(url, {timeout: timeoutMs});
  if(status !== OK) {
    console.error('Failed to fetch url', url.href, statusToString(status));
    return [status];
  }

  const mimeType = getMimeType(response);
  if(!feedTypes.includes(mimeType)) {
    console.error('Unacceptable mime type fetching feed', url.href, mimeType);
    return [ENOACCEPT, null, url, mimeType];
  }

  return [status, response];
}

// Does a fetch with a timeout
// @param url {URL} request url
// @param options {Object} optional, fetch options parameter. This extends the basic
// fetch api with a non-standard option, 'timeout', that if specified should be a positive integer,
// that causes fetches to fail if they take longer than the given number of milliseconds
// @returns {Object} a Response-like object. This extends (in the general sense) the basic
// Response object with properties that have already be converted to preferred data type
export async function fetchHelper(url, options) {
  // fetch implicitly canonicalizes its input url, which in this case would mean providing
  // chrome-extension:// to relative urls. To avoid this, this function demands a URL as input,
  // and because URLs must be canonical, this avoids the implicit resolution. In addition, fetch
  // throws a type error when given an invalid url parameter. This later translates all fetch
  // type errors into network errors, so avoid that by translating such type errors into assertion
  // errors before the call.
  if(!(url instanceof URL)) {
    console.error('Expected URL, got ' + url);
    return [EINVAL];
  }

  // fetch throws a TypeError when its options parameter is invalid. While normally desired, this
  // function is translating all type errors into network errors when calling fetch. Sidestep this
  // by translating this kind of error into an explicit assertion error.
  if(typeof options !== 'undefined' && typeof options !== 'object') {
    console.error('Expected object, got ' + options);
    return [EINVAL];
  }

  // Parameter options => these defaults => fetch defaults
  const defaultOptions = {
    credentials: 'omit',
    method: 'get',
    mode: 'cors',
    cache: 'default',
    redirect: 'follow',
    referrer: 'no-referrer',
    referrerPolicy: 'no-referrer'
  };
  const mergedOptions = Object.assign(defaultOptions, options);

  // Extract timeout from options
  let timeoutMs;
  if('timeout' in mergedOptions) {
    timeoutMs = mergedOptions.timeout;
    // Admittedly superfluous, but avoid any unclear behavior with passing non-standard options
    // to fetch
    delete mergedOptions.timeout;
  }

  const untimed = typeof timeoutMs === 'undefined';
  if(!untimed && !(Number.isInteger(timeoutMs) || timeoutMs < 0)) {
    console.error('Expected positive integer, got ' + timeoutMs);
    return [EINVAL];
  }

  // Check if the url is allowed to be fetched according to this app's policy
  if(!isAllowedURL(url)) {
    console.error('URL violates fetch policy', url.href);
    return [EPOLICY, null, url];
  }

  // Restrict methods
  const method = mergedOptions.method.toUpperCase();
  const allowedMethods = ['GET', 'HEAD'];
  if(!allowedMethods.includes(method)) {
    console.error('HTTP method violates fetch policy', method, url.href);
    return [EPOLICY, null, url, method];
  }

  // Avoid the TypeError fetch throws when offline, and distinguish this type of network error from
  // other network errors. TypeErrors are unexpected and represent permanent programming errors.
  // Being offline is an expected and temporary error.
  assert(navigator && 'onLine' in navigator);
  if(!navigator.onLine) {
    console.error('Cannot fetch while offline');
    return [EOFFLINE, null, url];
  }

  const fetchPromise = fetch(url.href, mergedOptions);

  // If a timeout was specified, initialize a derived promise to the result of racing fetch
  // against timeout. Otherwise, initialize a derived promise to the result of fetch.
  let aggregatePromise;
  let timeoutId;
  if(untimed) {
    aggregatePromise = fetchPromise;
  } else {
    let timeoutPromise;
    [timeoutId, timeoutPromise] = PromiseUtils.setTimeoutPromise(timeoutMs);
    const contestants = [fetchPromise, timeoutPromise];
    aggregatePromise = Promise.race(contestants);
  }

  // aggregatePromise points to the fetch promise. Once awaited, if fetch rejected, it throws.
  // fetch rejects with a TypeError when a network error is encountered, or when the url contains
  // credentials. It could also be a timeout, but that is a native timeout.
  let response;
  try {
    response = await aggregatePromise;
  } catch(error) {
    console.error(error);
    if(error instanceof TypeError) {
      return [ENET, null, url, '' + error];
    } else {
      return [EFETCH, null, url, '' + error];
    }
  }

  // If fetch wins then response is defined. If timeout wins then response is undefined.
  if(response) {
    clearTimeout(timeoutId);
  } else {
    return [ETIMEOUT, null, url];
  }

  if(!response.ok) {
    console.error('Response not ok', url.href, response.status, response.statusText);
    return [EFETCH, null, url, response.status];
  }

  return [OK, response];
}

// Return true if the response url is 'different' than the request url
// @param requestURL {URL}
// @param responseURL {URL}
export function detectURLChanged(requestURL, responseURL) {
  return !compareURLsWithoutHash(requestURL, responseURL);
}

// Compares two urls for equality without considering hash values
function compareURLsWithoutHash(url1, url2) {
  // Mutate only clones to preserve purity
  const modURL1 = new URL(url1.href);
  const modURL2 = new URL(url2.href);
  modURL1.hash = '';
  modURL2.hash = '';
  return modURL1.href === modURL2.href;
}

// Returns the value of the response's Last-Modified header as a date, or undefined on error
export function getLastModified(response) {
  if(!(response instanceof Response)) {
    console.error('Invalid response argument', response);
    return;
  }

  const lastModifiedString = response.headers.get('Last-Modified');
  if(lastModifiedString) {
    try {
      return new Date(lastModifiedString);
    } catch(error) {
      console.debug(error);
    }
  }
}

export function getMimeType(response) {
  if(!(response instanceof Response)) {
    console.error('Invalid response argument', response);
    return;
  }

  const contentType = response.headers.get('Content-Type');
  if(!contentType) {
    console.debug('Response missing content type header', response);
    return;
  }


  return MimeUtils.fromContentType(contentType);
}

// Return true if the app's policy permits fetching the url
// TODO: allow various overrides through localStorage setting or some config setting?
export function isAllowedURL(url) {

  if(!(url instanceof URL)) {
    console.error('Invalid url argument', url);
    return false;
  }

  const protocol = url.protocol;
  const hostname = url.hostname;

  // Quickly check for data urls and allow them before any other tests. Data URI fetches do not
  // involve the network so there is no policy concern
  if(protocol === 'data:') {
    return true;
  }

  // Of course things like hosts file can be manipulated to whatever. This is just one of the
  // low-hanging fruits. Prevent fetches to local host urls.
  if(hostname === 'localhost') {
    return false;
  }

  // Again, ignores things like punycode, IPv6, host manipulation, local dns manipulation, etc.
  // This is just a simple and typical case
  if(hostname === '127.0.0.1') {
    return false;
  }

  const protocolBlacklist = [
    'about:',
    'chrome:',
    'chrome-extension:',
    'file:'
  ];

  if(protocolBlacklist.includes(protocol)) {
    return false;
  }

  // Prevent fetches of urls containing credentials. Although fetch implicitly throws in this case,
  // I prefer to explicit. Also, this is a public function is use by other modules that may not
  // call fetch (e.g. see fetchImageElement) where I want the same policy to apply.
  if(url.username || url.password) {
    return false;
  }

  return true;
}
