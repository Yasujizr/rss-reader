import {parse_content_type} from '/src/mime/mime.js';

export const STATUS_UNACCEPTABLE = 801;
export const STATUS_UNACCEPTABLE_TEXT = 'Unacceptable mime type';
export const STATUS_POLICY_REFUSAL = 802;
export const STATUS_POLICY_REFUSAL_TEXT = 'Refused to fetch';
export const STATUS_FORBIDDEN_METHOD = 803;
export const STATUS_FORBIDDEN_METHOD_TEXT = 'Forbidden request method';
export const STATUS_OFFLINE = 804;
export const STATUS_OFFLINE_TEXT = 'Offline';
export const STATUS_TIMEOUT = 805;
export const STATUS_TIMEOUT_TEXT = 'Request timed out';

export async function fetch_html(url, timeout) {
  const response = await tfetch(url, {timeout: timeout});
  if (!response.ok) {
    return response;
  }

  if (response_get_mime_type(response) !== 'text/html') {
    const body = null;
    return new Response(body, {
      status: STATUS_UNACCEPTABLE,
      statusText: STATUS_UNACCEPTABLE_TEXT,
      headers: response.headers
    });
  }

  return response;
}

const feed_mime_types = [
  'application/octet-stream', 'application/rss+xml', 'application/rdf+xml',
  'application/atom+xml', 'application/xml', 'text/html', 'text/xml'
];

export async function fetch_feed(url, timeout) {
  const response = await tfetch(url, {timeout: timeout});

  if (!response.ok) {
    return response;
  }

  if (!feed_mime_types.includes(response_get_mime_type(response))) {
    const body = null;
    return new Response(body, {
      status: STATUS_UNACCEPTABLE,
      statusText: STATUS_UNACCEPTABLE_TEXT,
      headers: response.headers
    });
  }

  return response;
}

export async function tfetch(url, options) {
  assert(url instanceof URL);

  const default_options = {
    credentials: 'omit',
    method: 'get',
    mode: 'cors',
    cache: 'default',
    redirect: 'follow',
    referrer: 'no-referrer',
    referrerPolicy: 'no-referrer'
  };

  const merged_options = Object.assign({}, default_options, options);

  let timeout;
  if ('timeout' in merged_options) {
    timeout = merged_options.timeout;
    delete merged_options.timeout;
  }

  const untimed = typeof timeout === 'undefined';
  if (!untimed) {
    assert(Number.isInteger(timeout) && timeout >= 0);
  }

  if (!url_is_allowed(url)) {
    const body = null;
    return new Response(body, {
      status: STATUS_POLICY_REFUSAL,
      statusText: STATUS_POLICY_REFUSAL_TEXT,
      headers: response.headers
    });
  }

  const method = merged_options.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const body = null;
    return new Response(body, {
      status: STATUS_FORBIDDEN_METHOD,
      statusText: STATUS_FORBIDDEN_METHOD_TEXT,
      headers: response.headers
    });
  }

  if (!navigator.onLine) {
    const body = null;
    return new Response(body, {
      status: STATUS_OFFLINE,
      statusText: STATUS_OFFLINE_TEXT,
      headers: response.headers
    });
  }

  const fetch_promise = fetch(url.href, merged_options);

  // If a timeout was specified, initialize a derived promise to the result of
  // racing fetch against timeout. Otherwise, initialize a derived promise to
  // the result of fetch. If timeout wins then response is undefined.
  const response = await (
      untimed ? fetch_promise : Promise.race([fetch_promise, sleep(timeout)]));

  if (!response) {
    const body = null;
    return new Response(body, {
      status: STATUS_TIMEOUT,
      statusText: STATUS_TIMEOUT_TEXT,
      headers: response.headers
    });
  }

  return response;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Return whether the response url is "different" than the request url,
// indicating a redirect, regardless of the value of response.redirected
export function url_did_change(request_url, response_url) {
  return !url_compare_no_hash(request_url, response_url);
}

function url_compare_no_hash(url1, url2) {
  // operate on clones to avoid mutating input (stay "pure")
  const modified_url1 = new URL(url1.href);
  const modified_url2 = new URL(url2.href);
  modified_url1.hash = '';
  modified_url2.hash = '';
  return modified_url1.href === modified_url2.href;
}

export function response_get_last_modified_date(response) {
  assert(response instanceof Response);

  const header_value = response.headers.get('Last-Modified');
  if (header_value) {
    // TODO: is try/catch needed around date constructor?
    try {
      const date = new Date(header_value);

      // If the date constructor fails to parse, it simply stored NaN
      // internally, which is an invalid date, and NaN !== NaN
      if (date.getTime() === date.getTime()) {
        return date;
      } else {
        console.debug('Invalid date string:', header_value);
      }
    } catch (error) {
      console.debug(error);
    }
  }
}

export function response_get_mime_type(response) {
  assert(response instanceof Response);
  const content_type = response.headers.get('Content-Type');
  if (content_type) {
    return parse_content_type(content_type);
  }
}

export function url_is_allowed(url) {
  assert(url instanceof URL);

  const protocol = url.protocol;
  const hostname = url.hostname;

  // Quickly check for data urls and allow them before any other tests. Data
  // URI fetches do not involve the network so there is no policy concern
  if (protocol === 'data:') {
    return true;
  }

  if (hostname === 'localhost') {
    return false;
  }


  if (hostname === '127.0.0.1') {
    return false;
  }

  const protocol_blacklist =
      ['about:', 'chrome:', 'chrome-extension:', 'file:'];
  if (protocol_blacklist.includes(protocol)) {
    return false;
  }

  if (url.username || url.password) {
    return false;
  }

  return true;
}

function assert(value, message) {
  if (!value) throw new Error(message || 'Assertion error');
}

export class TimeoutError extends Error {
  constructor(message) {
    super(message);
  }
}

export class OfflineError extends Error {
  constructor(message) {
    super(message);
  }
}
