'use strict';

// TODO: impose length cap on url strings

// Allows for leading whitespace characters. Returns true for javascript: and
// mailto: and data:. Returns true for https:// and http://. Returns false for
// '//' (which is preferable).
// @param url {String} input url
// @returns {Boolean} true if the url is canonical, otherwise false
function url_is_canonical(url) {
  console.assert(typeof url === 'string');
  return /^\s*[a-z]+:/i.test(url);
}

// A url must be at least this long to be a script url
const URL_MIN_SCRIPT_LENGTH = 'javascript:'.length;

// Returns true if the url has the 'javascript:' protocol. Does not throw in
// the case of bad input.
// @param url {String}
// @returns {Boolean}
function url_has_script_protocol(url) {
  return typeof url === 'string' &&
    url.length > URL_MIN_SCRIPT_LENGTH &&
    /^\s*javascript:/i.test(url);
}


// Returns the absolute form the input url
// @param url {String}
// @param base_url {URL}
// @returns {URL} either the input url as an object if the url was already
// absolute, or the absolute url, or undefined if a parsing error occurred
function url_resolve(url, base_url) {
  console.assert(typeof url === 'string');
  console.assert(url_is_url_object(base_url));

  let canonical_url;

  if(url_is_canonical(url)) {
    try {
      canonical_url = new URL(url);
    } catch(error) {
    }
    return canonical_url;
  }

  try {
    canonical_url = new URL(url, base_url);
  } catch(error) {
  }
  return canonical_url;
}

// @param url {String}
// @returns {String}
function url_get_hostname(url) {
  console.assert(typeof url === 'string');
  try {
    const url_object = new URL(url);
    return url_object.hostname;
  } catch(error) {
  }
}

// Only minor validation for speed. Tolerates bad input.
// Assumes canonical url
// @param url {String}
// @returns {Boolean}
function url_is_valid(url) {
  const URL_MIN_LENGTH = 1;

  if(typeof url === 'string') {
    url = url.trim();
    if(url.length >= URL_MIN_LENGTH) {
      return !url.includes(' ');
    }
  }
  return false;
}

// Returns true if the input string appears to be a valid path
// @param path {String} a path component of a url
// @returns {Boolean} true if the path appears valid, otherwise false
function url_path_is_valid(path) {
  return typeof path === 'string' &&
    path.length > 0 &&
    path.charAt(0) === '/' &&
    !path.includes(' ');
}

// TODO: test input 'foo.', I suspect it is incorrect
// @param path {String}
// @returns {String}
function url_path_get_extension(path) {
  console.assert(url_path_is_valid(path));

  // Fail if the path is probably too short to contain an extension
  const min_path_length = '/a.b'.length;
  if(path.length < min_path_length)
    return;

  const last_dot_position = path.lastIndexOf('.');
  if(last_dot_position === -1)
    return;

  // A path that ends with a period is a valid path.
  // The +1 skips past the period itself.
  // TODO: this should avoid out of bounds error? What if dot is final position?
  let extension = path.substring(last_dot_position + 1);

  // If the path ended with a dot, then the extension string will be
  // empty, so assume the path is malformed and no extension exists
  // TODO: does this make sense if I avoid the case above?
  if(!extension)
    return;

  const max_extension_len = 4;
  if(extension.length > max_extension_len)
    return;

  extension = extension.toLowerCase();
  if(!/[a-z]/.test(extension))
    return;

  return extension;
}

// Return true if url probably represents a binary resource. This does not
// actually inspect the bytes of the resource. This makes a guess based on the
// extension of the file name in the url.
// @param url {URL} url object
// @returns {Boolean} true if probably binary, otherewise false
function url_sniff_is_binary(url) {
  console.assert(url_is_url_object(url));

  // Assume data url objects are probably non binary
  if(url.protocol === 'data:') {
    return false;
  }

  const path = url.pathname;
  const extension = url_path_get_extension(path);
  if(!extension)
    return false;

  const mime_type = mime_get_type_for_extension(extension);
  if(!mime_type)
    return false;

  const slash_position = mime_type.indexOf('/');
  // All mime types resulting from the lookup should contain a slash.
  // This is an extra check
  console.assert(slash_position !== -1);

  const super_type = mime_type.substring(0, slash_position);
  const bin_super_types = ['application', 'audio', 'image', 'video'];
  return bin_super_types.includes(super_type);
}

// Returns a file name without its extension (and without the '.')
function url_file_name_filter_extension(file_name) {
  const index = file_name.lastIndexOf('.');
  return index < 0 ? file_name : file_name.substring(0, index);
}

function url_path_get_file_name(path) {
  console.assert(url_path_is_valid(path));
  const index = path.lastIndexOf('/');
  if(index > -1) {
    const index_plus_1 = index + 1;
    if(index_plus_1 < path.length)
      return path.substring(index_plus_1);
  }
  return path;
}

// Returns true if value is a URL object
function url_is_url_object(value) {
  return Object.prototype.toString.call(value) === '[object URL]';
}

// Compares two urls for equality, after normalization and removing the hash
// from each url, if present. Both urls must be defined strings.
// @param url1 {String}
// @param url2 {String}
// @throws {Error} if either url is not a valid url
// @returns Boolean
function url_equals_no_hash(url1, url2) {
  console.assert(typeof url1 === 'string');
  console.assert(typeof url2 === 'string');

  // Unmarshalling enables normalization and simple hash filtering
  // Allow url parsing errors to bubble.
  const url1_object = new URL(url1);
  const url2_object = new URL(url2);
  url1_object.hash = '';
  url2_object.hash = '';
  return url1_object.href === url2_object.href;
}
