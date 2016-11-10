// See license.md

'use strict';

function is_url_object(value) {
  return Object.prototype.toString.call(value) === '[object URL]';
}

function condense_whitespace(str) {
  return str.replace(/\s{2,}/g, ' ');
}

// Returns a new string where Unicode Cc-class characters have been removed
// Adapted from http://stackoverflow.com/questions/4324790
// http://stackoverflow.com/questions/21284228
// http://stackoverflow.com/questions/24229262
function filter_control_chars(str) {
  return str.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
}

// Returns a new object that is a copy of the input less empty properties. A
// property is empty if it s null, undefined, or an empty string. Ignores
// prototype, deep objects, getters, etc. Impure.
// TODO: use filter_object
function filter_empty_props(obj) {
  const copy = {};
  const has_own = Object.prototype.hasOwnProperty;

  for(let prop in obj) {
    if(has_own.call(obj, prop)) {
      const value = obj[prop];
      if(value !== undefined && value !== null && value !== '')
        copy[prop] = value;
    }
  }
  return copy;
}

// Creates a new object only containing properties where predicate returns true.
// Predicate is given props obj and prop name
function filter_object(obj, predicate) {
  const copy = {};
  for(let prop in obj) {
    if(predicate(obj, prop)) {
      copy[prop] = obj[prop];
    }
  }
  return copy;
}

function format_date(date, delimiter) {
  const parts = [];
  if(date) {
    // getMonth is a zero based index
    parts.push(date.getMonth() + 1);
    parts.push(date.getDate());
    parts.push(date.getFullYear());
  }
  return parts.join(delimiter || '/');
}

// Calculates the approximate size of a value in bytes. This should only be used
// for basic testing because it is hilariously inaccurate.
// Adapted from http://stackoverflow.com/questions/1248302
// Generally does not work on built-ins (dom, XMLHttpRequest, etc)
function sizeof(object) {
  const seen = [];
  const stack = [object];
  const has_own = Object.prototype.hasOwnProperty;
  const to_string = Object.prototype.toString;
  let size = 0;
  while(stack.length) {
    const value = stack.pop();

    // NOTE: typeof null === 'object'
    if(value === null)
      continue;

    switch(typeof value) {
      case 'undefined':
        break;
      case 'boolean':
        size += 4;
        break;
      case 'string':
        size += value.length * 2;
        break;
      case 'number':
        size += 8;
        break;
      case 'function':
        size += 2 * value.to_string().length;
        break;
      case 'object':
        if(seen.indexOf(value) === -1) {
          seen.push(value);
          if(ArrayBuffer.isView(value)) {
            size += value.length;
          } else if(Array.isArray(value)) {
            stack.push(...value);
          } else {
            const to_string_output = to_string.call(value);
            if(to_string_output === '[object Date]') {
              size += 8;// guess
            } else if(to_string_output === '[object URL]') {
              size += 2 * value.href.length;// guess
            } else {
              for(let prop in value) {
                if(has_own.call(value, prop)) {
                  size += prop.length * 2;// prop name
                  stack.push(value[prop]);
                }
              }
            }
          }
        }
        break;
      default:
        break;// ignore
    }
  }

  return size;
}

// TODO: even though this is a utility, it isn't actually shared. There is only
// one place that uses it. Move to fade-element.js in view module

function fade_element(element, duration, delay) {
  return new Promise(function(resolve, reject) {
    const style = element.style;
    if(style.display === 'none') {
      style.display = '';
      style.opacity = '0';
    }

    if(!style.opacity)
      style.opacity = style.display === 'none' ? '0' : '1';
    element.addEventListener('webkitTransitionEnd', resolve, {'once': true});
    // transition params: property duration function delay
    style.transition = `opacity ${duration}s ease ${delay}s`;
    style.opacity = style.opacity === '1' ? '0' : '1';
  });
}
