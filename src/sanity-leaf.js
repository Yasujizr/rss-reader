// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

// Removes leaf-like elements from the document. An element is a leaf unless
// it is a named exception, contains a non-whitespace-only text node, or
// contains at least one non-leaf child element.
//
// Because DOM modification is expensive, this tries to minimize the number
// of elements removed by only removing the shallowest elements. For example,
// when processing <outerleaf><innerleaf></innerleaf></outerleaf>, the naive
// approach would perform two operations, first removing the innerleaf and
// then the outerleaf. The outerleaf is also a leaf because upon removing the
// innerleaf, it then satisfies the is-leaf condition. Instead, this recognizes
// this situation, and only removes outerleaf. The cost of doing this is
// that the is-leaf function is recursive.
//
// This still iterates over all of the elements, because using querySelectorAll
// is faster than walking. As a result, this also checks at each step of the
// iteration whether the current element is still attached to the document, and
// avoids removing elements that were detached by virtue of an ancestor being
// detached in a prior iteration step.
function sanity_filter_leaves(document) {
  'use strict';

  const elements = document.querySelectorAll('*');
  const numElements = elements.length;
  const docElement = document.documentElement;
  for(let i = 0, element; i < numElements; i++) {
    element = elements[i];
    if(docElement.contains(element) && sanity_is_leaf_node(element)) {
      element.remove();
    }
  }
}

// These elements are never considered leaves, regardless of other criteria.
// In an HTML document context, element.nodeName is always uppercase
// I am using a plain old object instead of a Set because profiling showed
// poor performance.
var SANITY_LEAF_EXCEPTIONS = {
  'AREA': 1, 'AUDIO': 1, 'BASE': 1, 'COL': 1, 'COMMAND': 1, 'BR': 1,
  'CANVAS': 1, 'COL': 1, 'HR': 1, 'IFRAME': 1, 'IMG': 1, 'INPUT': 1,
  'KEYGEN': 1, 'META': 1, 'NOBR': 1, 'PARAM': 1, 'PATH': 1, 'SOURCE': 1,
  'SBG': 1, 'TEXTAREA': 1, 'TRACK': 1, 'VIDEO': 1, 'WBR': 1
};

// Returns whether the given node is a leaf. Recursive.
function sanity_is_leaf_node(node) {
  'use strict';

  if(node.nodeType === Node.ELEMENT_NODE) {
    if(node.nodeName in SANITY_LEAF_EXCEPTIONS) {
      return false;
    }

    // Recur on child nodes. If any child node is not a leaf, then this
    // element is not a leaf. Breaks upon the first non-leaf. If no children
    // or no child non-leaves found, fall through to the return true at the
    // the bottom.
    for(let child = node.firstChild; child; child = child.nextSibling) {
      if(!sanity_is_leaf_node(child)) {
        return false;
      }
    }

  } else if(node.nodeType === Node.TEXT_NODE) {

    // TODO: one idea of an alternate condition that may be faster is to
    // simply look for the presence of a non-whitespace character.

    return !node.nodeValue.trim();
  } else {
    // Never consider an unknown node type to be a leaf, and prevent
    // ancestors of this node from being leaves
    return false;
  }

  return true;
}
