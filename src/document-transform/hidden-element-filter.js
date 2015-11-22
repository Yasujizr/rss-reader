// Copyright 2015 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

const HiddenElementFilter = {};

HiddenElementFilter.EXCEPTIONS = new Set([
  'noscript',
  'noembed'
]);

HiddenElementFilter.transform = function(document, rest) {
  const exceptions = HiddenElementFilter.EXCEPTIONS;
  // This uses a NodeIterator for traversal 
  // to avoid visiting detached subtrees.
  // This does not test against offsetWidth/Height because the 
  // properties do not appear to be initialized within inert documents

  const it = document.createNodeIterator(
    document.documentElement, NodeFilter.SHOW_ELEMENT, function(node) {
    return exceptions.has(node.localName) ? NodeFilter.FILTER_REJECT : 
      NodeFilter.FILTER_ACCEPT;
  });

  let element = it.nextNode();
  while(element) {
    const style = element.style;
    const opacity = parseFloat(style.opacity);
    if(style.display === 'none' || 
      style.visibility === 'hidden' || 
      style.visibility === 'collapse' || 
      opacity < 0.3) {
      element.remove();
    }

    element = it.nextNode();
  }
};
