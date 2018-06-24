import {subscribe} from '/src/control/subscribe.js';

// Concurrently reads in the opml files and subscribes to contained feeds.
// Returns a promise that resolves to an array of subscribe promise results.
export async function import_opml(
    dal, iconn, files, fetch_timeout, skip_icon_lookup) {
  const read_results = await read_files(files);
  const urls = dedup_urls(flatten_file_urls(read_results));
  return subscribe_all(dal, iconn, fetch_timeout, skip_icon_lookup, urls);
}

// Read in all the feed urls from all of the files into an array of arrays.
// Files are read and processed concurrently.
function read_files(files) {
  const promises = [];
  for (const file of files) {
    const promise = read_file_feeds(file);
    const catch_promise = promise.catch(console.warn);
    promises.push(catch_promise);
  }
  return Promise.all(promises);
}

// Flatten the results into a single array and filter missing values
function flatten_file_urls(all_files_urls) {
  const urls = [];
  for (const per_file_urls of all_files_urls) {
    if (per_file_urls) {
      for (const url of per_file_urls) {
        if (url) {
          urls.push(url);
        }
      }
    }
  }
  return urls;
}

function subscribe_all(dal, iconn, fetch_timeout, skip_icon_lookup, urls) {
  const promises = [];
  const notify_per_subscribe = false;
  for (const url of urls) {
    const promise = subscribe(
        dal, iconn, url, fetch_timeout, notify_per_subscribe, skip_icon_lookup);
    const catch_promise = promise.catch(console.warn);
    promises.push(catch_promise);
  }

  return Promise.all(promises);
}

// Returns a promise that resolves to an array of feed urls in the opml file.
// Throws errors if bad parameter, bad file type, i/o, parsing. Does not filter
// dupes. The return value is always a defined array, but may be empty.
async function read_file_feeds(file) {
  if (!file.size) {
    return [];
  }

  if (!file_is_opml(file)) {
    throw new TypeError(
        'Unacceptable type ' + file.type + ' for file ' + file.name);
  }

  const file_text = await file_read_text(file);
  const document = parse_opml(file_text);
  return find_feed_urls(document);
}

// Return a new array of distinct URLs. The output array is always defined.
function dedup_urls(urls) {
  const unique_urls = [], seen_url_strings = [];
  for (const url of urls) {
    if (!seen_url_strings.includes(url.href)) {
      unique_urls.push(url);
      seen_url_strings.push(url.href);
    }
  }
  return unique_urls;
}

// Searches the nodes of the document for feed urls. Returns an array of URL
// objects. The array is always defined even when no urls found.
function find_feed_urls(document) {
  const elements = document.querySelectorAll('opml > body > outline[type]');
  const type_pattern = /^\s*(rss|rdf|feed)\s*$/i;
  const urls = [];
  for (const element of elements) {
    const type = element.getAttribute('type');
    if (type_pattern.test(type)) {
      const url = parse_url_noexcept(element.getAttribute('xmlUrl'));
      if (url) {
        urls.push(url);
      }
    }
  }
  return urls;
}

function parse_url_noexcept(url_string) {
  if (url_string) {
    try {
      return new URL(url_string);
    } catch (error) {
    }
  }
}

function file_is_opml(file) {
  const opml_mime_types = [
    'application/xml', 'application/xhtml+xml', 'text/xml', 'text/x-opml',
    'application/opml+xml'
  ];
  return opml_mime_types.includes(file.type);
}

function file_read_text(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsText(file);
    reader.onload = _ => resolve(reader.result);
    reader.onerror = _ => reject(reader.error);
  });
}

// Parses a string containing opml into a xml-flagged document object. Throws an
// error if the parameter is unexpected or if there is a parse error.
function parse_opml(xml_string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(xml_string, 'application/xml');
  const error = document.querySelector('parsererror');
  if (error) {
    throw new Error(condense_whitespace(error.textContent));
  }

  // Need to normalize localName when document is xml-flagged
  const name = document.documentElement.localName.toLowerCase();
  if (name !== 'opml') {
    throw new Error('Document element is not opml: ' + name);
  }
  return document;
}

function condense_whitespace(value) {
  return value.replace(/\s{2,}/g, ' ');
}
