// See license.md

'use strict';

const ReaderUtils = {};

ReaderUtils.condenseWhitespace = function(inputString) {
  return inputString.replace(/\s{2,}/g, ' ');
};

ReaderUtils.fadeElement = function(element, duration, delay, callback) {
  const style = element.style;
  if(style.display === 'none') {
    style.display = '';
    style.opacity = '0';
  }

  if(!style.opacity) {
    style.opacity = style.display === 'none' ? '0' : '1';
  }

  if(callback) {
    element.addEventListener('webkitTransitionEnd',
      ReaderUtils._onFadeEnd.bind(element, callback));
  }

  // property duration function delay
  style.transition = 'opacity ' + duration + 's ease ' + delay + 's';
  style.opacity = style.opacity === '1' ? '0' : '1';
};

ReaderUtils._onFadeEnd = function(callback, event) {
  event.target.removeEventListener('webkitTransitionEnd',
    ReaderUtils._onFadeEnd);
  callback(event.target);
};

// Returns a new string where Unicode Cc-class characters have been removed
// Adapted from http://stackoverflow.com/questions/4324790
ReaderUtils.filterControlChars = function(inputString) {
  return inputString.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
};

// A rudimentary process. Ignores prototype, deep objects, getters, etc.
// The output is a new object that is a copy of the input object. Not actually
// pure because property values are copied by reference.
// A value is empty if it is null, undefined, or an empty string
ReaderUtils.filterEmptyProps = function(obj) {
  const copy = {};
  const hasOwn = Object.prototype.hasOwnProperty;
  const undef = void(0);
  for(let prop in obj) {
    if(hasOwn.call(obj, prop)) {
      const value = obj[prop];
      if(value !== undef && value !== null && value !== '') {
        copy[prop] = value;
      }
    }
  }
  return copy;
};

// Formats a date object. This is obviously a very dumb implementation that
// could eventually be improved.
ReaderUtils.formatDate = function(date, delimiter) {
  const parts = [];
  if(date) {
    // getMonth is a zero based index
    parts.push(date.getMonth() + 1);
    parts.push(date.getDate());
    parts.push(date.getFullYear());
  }
  return parts.join(delimiter || '');
};

ReaderUtils.isURLObject = function(val) {
  return Object.prototype.toString.call(val) === '[object URL]';
};

// @param descriptors {Array} an array of basic descriptor objects such as the
// one produced by the parseSrcset library
ReaderUtils.serializeSrcset = function(descriptors) {
  const output = [];
  for(let descriptor of descriptors) {
    let buf = [descriptor.url];
    if(descriptor.d) {
      buf.push(' ');
      buf.push(descriptor.d);
      buf.push('x');
    } else if(descriptor.w) {
      buf.push(' ');
      buf.push(descriptor.w);
      buf.push('w');
    } else if(descriptor.h) {
      buf.push(' ');
      buf.push(descriptor.h);
      buf.push('h');
    }
    output.push(buf.join(''));
  }
  return output.join(', ');
};

ReaderUtils.smoothScrollTo = function(element, deltaY, targetY) {
  let scrollYStartTimer; // debounce
  let scrollYIntervalTimer; // incrementally move
  let amountToScroll = 0;
  let amountScrolled = 0;

  function debounce() {
    clearTimeout(scrollYStartTimer);
    clearInterval(scrollYIntervalTimer);
    scrollYStartTimer = setTimeout(start_scroll, 5);
  }

  function start_scroll() {
    amountToScroll = Math.abs(targetY - element.scrollTop);
    amountScrolled = 0;

    if(amountToScroll === 0) {
      return;
    }

    scrollYIntervalTimer = setInterval(do_scroll_step, 20);
  }

  function do_scroll_step() {
    const currentY = element.scrollTop;
    element.scrollTop += deltaY;
    amountScrolled += Math.abs(deltaY);
    if(currentY === element.scrollTop || amountScrolled >= amountToScroll) {
      clearInterval(scrollYIntervalTimer);
    }
  }

  return debounce();
};

// Calculates the approximate size of a value in bytes. This should only be used
// for basic testing because it is hilariously inaccurate.
// Adapted from http://stackoverflow.com/questions/1248302
// Generally does not work on built-ins (dom, XMLHttpRequest, NodeList, etc)
ReaderUtils.sizeof = function(object) {
  const seen = [];// Track visited to avoid infinite recursion
  const stack = [object];
  const hasOwn = Object.prototype.hasOwnProperty;
  const toString = Object.prototype.toString;
  let size = 0;
  while(stack.length) {
    const value = stack.pop();

    // NOTE: typeof null === 'object'
    if(value === null) {
      continue;
    }

    switch(typeof value) {
      case 'undefined':
        // Treat undefined as 0
        break;
      case 'boolean':
        size += 4;
        break;
      case 'string':
        // 2 bytes per character
        size += value.length * 2;
        break;
      case 'number':
        size += 8;
        break;
      case 'function':
        size += 2 * value.toString().length;
        break;
      case 'object':
        if(seen.indexOf(value) === -1) {
          seen.push(value);
          if(ArrayBuffer.isView(value)) {
            // Shortcut straight to an accurate byte size for views
            size += value.length;
          } else if(Array.isArray(value)) {
            // Iterate over arrays differently than general objects
            for(let i = 0, len = value.length; i < len; i++) {
              stack.push(value[i]);
            }
          } else {
            const toStringOutput = toString.call(value);
            if(toStringOutput === '[object Date]') {
              // special branch for dates because no enumerable own props
              // Just a guess, as its internal ms value is a number
              size += 8;
            } else if(toStringOutput === '[object URL]') {
              // special branch for URL objects because no props
              // Just a guess
              size += 2 * value.href.length;
            } else {
              for(let prop in value) {
                if(hasOwn.call(value, prop)) {
                  size += prop.length * 2; // size of property name as string
                  stack.push(value[prop]);
                }
              }
            }
          }
        }
        break;
      default:
        // ignore the value's contribution to total size
        break;
    }
  }

  return size;
};
