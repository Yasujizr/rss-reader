import assert from '/src/assert/assert.js';

export const FEED_MAGIC = 0xfeedfeed;
export const ENTRY_MAGIC = 0xdeadbeef;

export const ENTRY_STATE_UNREAD = 0;
export const ENTRY_STATE_READ = 1;
export const ENTRY_STATE_UNARCHIVED = 0;
export const ENTRY_STATE_ARCHIVED = 1;

export function create_feed() {
  return {magic: FEED_MAGIC};
}

export function create_entry() {
  return {magic: ENTRY_MAGIC};
}

export function is_entry(value) {
  return value && typeof value === 'object' && value.magic === ENTRY_MAGIC &&
      is_plain_object(value);
}

function is_plain_object(value) {
  return value && value.__proto__ && value.__proto__.constructor &&
      value.__proto__.constructor.name === 'Object';
}

export function is_feed(value) {
  return value && typeof value === 'object' && value.magic === FEED_MAGIC &&
      is_plain_object(value);
}

export function is_valid_entry_id(value) {
  return Number.isInteger(value) && value > 0;
}

export function is_valid_feed_id(id) {
  return Number.isInteger(id) && id > 0;
}

export function append_entry_url(entry, url) {
  assert(is_entry(entry));
  return append_url_common(entry, url);
}

export function append_feed_url(feed, url) {
  assert(is_feed(feed));
  return append_url_common(feed, url);
}

function append_url_common(object, url) {
  assert(typeof url.href === 'string');

  const normal_url_string = url.href;
  if (object.urls) {
    if (object.urls.includes(normal_url_string)) {
      return false;
    }

    object.urls.push(normal_url_string);
  } else {
    object.urls = [normal_url_string];
  }

  return true;
}
