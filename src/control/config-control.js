// Controller for reading and writing app settings to and from the app
// configuration model. Internally, app settings are stored in localStorage so
// that they are easily and quickly available to all app pages. App settings
// are stored as separate keys and not in a single giant object for fast
// modifications to individual settings without the need to update all settings
// per settings change.

export function remove(key) {
  delete localStorage[key];
}

export function remove_all(keys) {
  for (const key of keys) {
    remove(key);
  }
}

export function has_key(key) {
  // We don't care about value, cannot use simple truthy test
  return typeof localStorage[key] !== 'undefined';
}

export function write_array(key, value) {
  localStorage[key] = JSON.stringify(value);
}

export function read_array(key) {
  const value = localStorage[key];
  return value ? JSON.parse(value) : [];
}

export function write_int(key, value) {
  localStorage[key] = '' + value;
}

export function read_int(key, fallback_value) {
  const string_value = localStorage[key];
  if (string_value) {
    const integer_value = parseInt(string_value, 10);
    if (!isNaN(integer_value)) {
      return integer_value;
    }
  }

  if (Number.isInteger(fallback_value)) {
    return fallback_value;
  }

  return NaN;
}

export function write_float(key, value) {
  localStorage[key] = '' + value;
}

export function read_float(key) {
  const string_value = localStorage[key];
  if (string_value) {
    const float_value = parseFloat(string_value, 10);
    if (!isNaN(float_value)) {
      return float_value;
    }
  }
  return NaN;
}

export function write_string(key, value) {
  localStorage[key] = value;
}

export function read_string(key) {
  return localStorage[key];
}