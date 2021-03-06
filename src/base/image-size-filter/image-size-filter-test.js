import assert from '/src/base/assert.js';
import {set_base_uri} from '/src/base/set-base-uri.js';
import * as html from '/src/base/html.js';
import {set_image_sizes} from './image-size-filter.js';

// Assert the ordinary case of a basic html document with an image with unknown
// attributes
export async function set_image_sizes_basic_test() {
  const doc = await fetch_local('basic.html');
  await set_sizes(doc);
  const image = doc.querySelector('img');
  assert(image.width === 16);
  assert(image.height === 12);
}

// Assert that fetching an image that does not exist skips over the image
// NOTE: unfortunately Chrome makes it impossible to suppress network errors
// in the log in devtools, so this will still generate a log message that
// looks like an error. However, the test still completes without error. Note
// that due to this failure message always appearing and having no way to remove
// it, simply glancing at the test log for errors should not be an indication
// that a test failed, so I must always remember to ignore this error. Or, I
// must always remember to run tests with the "Hide network errors" checkbox
// checked in the devtools console settings. Or, what I should do is create a
// fake Response object with 404 status... but I somehow need to be able to
// inject the fetching into the module itself
export async function set_image_sizes_404_test() {
  const doc = await fetch_local('404.html');
  // This should not throw even though the image specified in the html is
  // missing
  await set_sizes(doc);

  const image = doc.querySelector('img');

  // Because the image does not have express attributes, and because this is an
  // inert file where images are not eagerly loaded by Chrome on document load,
  // the properties for the image should not be initialized. Also, failing to
  // fetch or find any other indication of size should not affect these props.
  assert(image.width === 0);
  assert(image.height === 0);
}

// Exercise running the function on a document without any images. This should
// not cause any kind of error (e.g. any code that assumes images always exist
// is incorrect).
export async function set_image_sizes_text_only_test() {
  const doc = await fetch_local('text-only.html');
  await set_sizes(doc);
}

// Test that an image that is completely devoid of source information does not
// cause an error, and does not somehow set attributes or properties.
export async function set_image_sizes_sourceless_test() {
  const doc = await fetch_local('sourceless.html');
  await set_sizes(doc);
  const image = doc.querySelector('img');
  assert(image.width === 0);
  assert(image.height === 0);
}

// Simple private helper that abstracts away the extra params
function set_sizes(doc) {
  return set_image_sizes(doc, undefined, url => true);
}

// Simple private helper that loads a local html file, parses it, and sets its
// base uri
async function fetch_local(filename) {
  const base_path = '/src/base/image-size-filter/';

  const path = base_path + filename;
  const url_string = chrome.extension.getURL(path);
  const response = await fetch(url_string);
  const text = await response.text();
  const doc = html.parse_html(text);

  const canonical_base_url_string = chrome.extension.getURL(base_path);
  const base_url = new URL(canonical_base_url_string);
  set_base_uri(doc, base_url);
  return doc;
}
