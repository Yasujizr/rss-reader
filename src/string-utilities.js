// Copyright 2014 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

var lucu = lucu || {};

// Scrubs tags
lucu.stripTags = function(string, replacement) {
  'use strict';
  if(!string) return;
  var doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = string;
  if(!replacement) return doc.body.textContent;
  var iterator = doc.createNodeIterator(doc.body, NodeFilter.SHOW_TEXT);
  var node, values = [];
  while(node = iterator.nextNode()) {
    values.push(node.nodeValue);
  }
  return values.join(replacement);
};

// Scrubs html from a string
lucu.stripControls = function(string) {
  'use strict';
  // TODO: research the proper pattern
  // var p = /[^\x20-\x7E]+/g;
  var p = /[\t\r\n]/g;
  return string && string.replace(p,'');
};

// Shorten a string if its too long
lucu.truncate = function(str, position, extension) {
  'use strict';

  // \u2026 == ellipsis
  if(!str) return;
  if(str.length > position)
    return str.substr(0, position) + (extension || '\u2026');
  return str;
};
