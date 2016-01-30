// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

// TODO: avoid global strict mode, maybe use an IIFE?
// TODO: look into http://www.streamjs.org/ for a NodeStream concept?

'use strict';

const DOMFilter = {};

// Allows for..of over NodeIterators, to use do:
// myNodeIterator[Symbol.iterator] = DOMFilter.getSymbolIteratorImpl
DOMFilter.getSymbolIteratorImpl = function(iterator) {
  return function() {
    return {
      next: function() {
        const node = iterator.nextNode();
        return { value: node, done: !node };
      }
    };
  };
};

// Returns whether the element has the given lowercase name
DOMFilter.elementHasName = function(name, element) {
  return element.localName === name;
};

// Finds the associated caption for an image
DOMFilter.findImageCaption = function(image) {
  const figure = image.closest('figure');
  return figure ? figure.querySelector('figcaption') : null;
};

// Removes all comment nodes from the document
DOMFilter.filterCommentNodes = function(document) {
  const iterator = document.createNodeIterator(document.documentElement,
    NodeFilter.SHOW_COMMENT);
  iterator[Symbol.iterator] = DOMFilter.getSymbolIteratorImpl(iterator);
  for(let comment of iterator) {
    comment.remove();
  }
};

DOMFilter.DEFAULT_BLACKLIST_POLICY = new Set([
  'applet',
  'object',
  'embed',
  'param',
  'video',
  'audio',
  'bgsound',
  'head',
  'meta',
  'title',
  'datalist',
  'dialog',
  'fieldset',
  'isindex',
  'math',
  'output',
  'optgroup',
  'progress',
  'spacer',
  'xmp',
  'style',
  'link',
  'basefont',
  'select',
  'option',
  'textarea',
  'input',
  'button',
  'command'
]);

// @param policy {Set} element names to remove
DOMFilter.filterBlacklistedElements = function(document, policy) {
  const localPolicy = policy || DOMFilter.DEFAULT_BLACKLIST_POLICY;
  const selector = Array.from(localPolicy).join(',');
  DOMFilter.moveElementsBySelector(document, null, selector);
};

// Replaces <br> elements within a document with <p>
// TODO: this function needs some substantial improvement. there are several
// problems with its current approach, such as what happens when inserting
// a paragraph element within an inline element.
// error case: http://paulgraham.com/procrastination.html
DOMFilter.filterBreakruleElements = function(document) {
  const breakRuleElements = document.querySelectorAll('br');
  breakRuleElements[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let breakRuleElement of breakRuleElements) {
    let parent = breakRuleElement.parentElement;
    let paragraph = document.createElement('p');
    parent.replaceChild(paragraph, breakRuleElement);
  }
};

// Removes certain attributes from all elements in the document
DOMFilter.filterAttributes = function(document) {
  const elements = document.getElementsByTagName('*');
  elements[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let element of elements) {
    DOMFilter.filterElementAttributes(element);
  }
};

// Removes certain attributes from an element
// TODO: not filtering attributes from SVG creates a security hole because it
// allows for onclick and such to pass through the filter.
// TODO: not filtering SVG creates display issues because the SVGs are not
// sized well
DOMFilter.filterElementAttributes = function(element) {

  const elementName = element.localName;

  if(elementName === 'svg' || elementName === 'path') {
    return;
  }

  // Iterate in reverse to avoid issues with mutating a live NodeList during
  // iteration
  const attributes = element.attributes || [];
  for(let j = attributes.length - 1, attributeName; j > -1; j--) {
    attributeName = attributes[j].name;
    if(!DOMFilter.isPermittedAttribute(elementName, attributeName)) {
      element.removeAttribute(attributeName);
    }
  }
};

// Returns whether an attribute should not be removed
// TODO: try and preserve more accessibility attributes
// TODO: support media and other embeds
// TODO: this should be implemented to work independently of the element
// blacklist policy. Even though an element may be blacklisted, it should
// still be processed here according to its own attribute policy.
// TODO: review aria handling
// TODO: what about role and other microdata attributes?
DOMFilter.isPermittedAttribute = function(elementName, attributeName) {
  if(elementName === 'a') {
    return attributeName === 'href' ||
      attributeName === 'name' ||
      attributeName === 'title';
  }

  if(elementName === 'html') {
    return attributeName === 'lang';
  }

  if(elementName === 'iframe') {
    return attributeName === 'src';
  }

  if(elementName === 'img') {
    return attributeName === 'alt' || attributeName === 'src' ||
      attributeName === 'srcset' || attributeName === 'title';
  }

  if(elementName === 'param') {
    return attributeName === 'name' || attributeName === 'value';
  }

  return false;
};

// Handles frame, noframes, frameset, and iframe elements
// Looks for the presence of a frameset and lack of a body
// element, and then removes the frameset and generates a body
// consisting of either noframes content or an error message.
// TODO: this may need to be a more general transform that is async
// and automatically identifies the core content frame, fetches its content,
// and then incorporates it into the document
// TODO: i want to consider inlining iframe content
// TODO: iframes are frame-like, but in the end, i think iframe filtering
// or handling should be done in its own transformational function, and not
// mixed-in here.
// TODO: the replacement text should be localized
// TODO: what if noframes contains an iframe or other frames?
DOMFilter.filterFrameElements = function(document) {
  let body = document.querySelector('body');
  const frameset = document.querySelector('frameset');
  if(!body && frameset) {
    const noframes = frameset.querySelector('noframes');
    body = document.createElement('body');
    if(noframes) {
      body.innerHTML = noframes.innerHTML;
    } else {
      body.textContent = 'Unable to display document due to frames.';
    }

    document.documentElement.appendChild(body);
    frameset.remove();
    return;
  }

  DOMFilter.removeElementsBySelector(document, 'frameset, frame, iframe');
};

//TODO: review aria properties, maybe include aria hidden?
// https://www.w3.org/TR/wai-aria/states_and_properties#aria-hidden
DOMFilter.HIDDEN_ELEMENTS_SELECTOR = [
  '[style*="display:none"]',
  '[style*="display: none"]',
  '[style*="visibility:hidden"]',
  '[style*="visibility: hidden"]',
  '[style*="opacity:0.0"]',
  '[style*="opacity: 0.0"]',
  '[style*="opacity:0"]'
].join(',');

// Removes hidden elements from a document. This function previously was more
// accurate and investigated each element's style property. However, this
// resulted in Chrome lazily computing each element's style, which resulted in
// poor performance. Given that we are ignoring non-inline styles in the first
// place, I don't think the loss of accuracy is too important.
DOMFilter.filterHiddenElements = function(document) {
  DOMFilter.removeElementsBySelector(document,
    DOMFilter.HIDDEN_ELEMENTS_SELECTOR);
};

// A set of names of inline elements that can be unwrapped
// NOTE: This does not contain ALL inline elements, just those we
// want to unwrap. This is different than the set of inline
// elements defined for the purpose of trimming text nodes.
// TODO: some of these would maybe be better handled in other more
// specialized handlers
// noscript and noembed are handled by other transforms
DOMFilter.INLINE_ELEMENT_NAMES = new Set([
  'article',
  'center',
  'colgroup',
  'data',
  'details',
  'div',
  'footer',
  'header',
  'help',
  'hgroup',
  'ilayer',
  'insert',
  'layer',
  'legend',
  'main',
  'mark',
  'marquee',
  'meter',
  'multicol',
  'nobr',
  'noembed',
  'section',
  'span',
  'tbody',
  'tfoot',
  'thead',
  'form',
  'label',
  'big',
  'blink',
  'font',
  'plaintext',
  'small',
  'tt'
]);

DOMFilter.INLINE_ELEMENTS_SELECTOR = Array.from(
  DOMFilter.INLINE_ELEMENT_NAMES).join(',');

DOMFilter.isInlineElement = function(element) {
  return DOMFilter.INLINE_ELEMENT_NAMES.has(element.localName);
};

// TODO: in cases like <blockquote><p>text</p></blockquote>, the p can be
// unwrapped? Leaving this as a place holder
DOMFilter.filterNestedBlockElements = function(document) {
  throw new Error('Not yet implemented');
};

// Removes various inline elements in a document. Given that style information
// and other information is removed, several elements in the document may
// no longer serve a formatting purpose, so we want to remove them but
// keep the child elements.
// TODO: when unwrapping an inline element, I need to insert a space following
// the contents of the element (e.g. createTextNode(' ')), to avoid things like
// <div><span>text</span>text</div> becoming texttext
// TODO: I observed an extreme performance drop when processing the URL
// https://www.reddit.com/r/announcements/comments/434h6c/reddit_in_2016/
// and my current best guess is that it is due to the above note about
// doing wasted moves in the case of <div><div>content</div><div>, so this
// function needs to be optimized
DOMFilter.filterInlineElements = function(document) {
  const elements = document.querySelectorAll(
    DOMFilter.INLINE_ELEMENTS_SELECTOR);
  elements[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let element of elements) {
    DOMFilter.unwrapElement(element);
  }
};

// TODO: this is completely untested, unfinished at the moment
// TODO: maybe optimize for the case <p><div>\n<div>text</div>\n</div></p>
// TODO: consider the similarities to filterLeafElements more, maybe the two
// should somehow be merged
// TODO: what about case of <p><div><div></div></div></p> => <p></p> ?
// Shouldn't I also be skipping in that case? Right now I am requiring content?
DOMFilter.filterInlineElements2 = function(document) {
  const elements = document.querySelectorAll(
    DOMFilter.INLINE_ELEMENTS_SELECTOR);
  elements[Symbol.iterator] = Array.prototype[Symbol.iterator];

  for(let element of elements) {
    if(!DOMFilter.isIntermediateInlineElement(element)) {
      DOMFilter.unwrapInlineElement(element);
    }
  }
};

DOMFilter.isIntermediateInlineElement = function(element) {
  return element.childNodes.length === 1 &&
    DOMFilter.isInlineElement(element.firstChild);
};

// Unwraps the child nodes of an node into an ancestor, and removes
// intermediate ancestors and the node itself. Internally this searches for
// outermost inline ancestor to unwrap.
// we don't want to just find the first non inline ancestor, we want
// to find either the nextSibling of the outermost inline ancestor beneath
// the first noninline ancestor, so that we can insertBefore, or we want to
// use the noninline ancestor and appendChild into it.
// TODO: once i get this working, i would need to eventually do the same
// optimization i did for unwrapElement where i sometimes remove the parent
// before doing other manipulations.
DOMFilter.unwrapInlineElement = function(element) {
  throw new Error('Not yet implemented');
};

// These element names are never considered leaves
DOMFilter.LEAF_EXCEPTION_ELEMENT_NAMES = new Set([
  'area',
  'audio',
  'br',
  'canvas',
  'col',
  'hr',
  'iframe',
  'img',
  'path', // an SVG component
  'source',
  'svg',
  'track',
  'video'
]);

// Elements containing only these text node values are still leaves
DOMFilter.TRIVIAL_TEXT_NODE_VALUES = new Set([
  '',
  '\n',
  '\n\t',
  '\n\t\t',
  '\n\t\t\t'
]);

// Prunes leaf elements from the document. Leaf elements are those
// elements that do not contain sub elements, such as <p></p>, or elements
// that only contain other leaf-like elements but are not leaf-like, such as
// the outer paragraph in <p id="outer"><p id="nested-inner"></p></p>.
// The document element (e.g. <html></html>) and the document body are never
// considered leaves.
// Certain elements are treated differently. For example, <img> is never
// considered a leaf even though it has no nested elements or text.
// Elements that contain only trivial text nodes are still considered leaves,
// such as <p>\n</p>
// TODO: this could still use improvement. it is revisiting and
// re-evaluating children sometimes.
// TODO: does the resulting set of leaves contain leaves within
// leaves? i want to avoid removing leaves within leaves.
// TODO: test cases
// TODO: i would like to do this without having a visitor function and
// an isLeaf function that also visits, it feels wrong.
// TODO: if we treat the document as a DAG, we can use graph principles,
// and process the document as if it were a graph. maybe we need a graph
// library.
// TODO: maybe what i should do is gather all leaves, then remove, so write
// a funciton that abstracts the gathering
DOMFilter.filterLeafElements = function(document) {
  const leafSet = new Set();
  DOMFilter.collectLeavesRecursively(leafSet, document.body,
    document.documentElement);
  for(let leaf of leafSet) {
    leaf.remove();
  }
};

// Recursively traverses and finds leaf elements and adds them to leaves
// TODO: i would like to do this without recursion for better perf
DOMFilter.collectLeavesRecursively = function(leaves, bodyElement, element) {
  const childNodes = element.childNodes;
  const numChildNodes = childNodes.length;
  for(let i = 0, cursor; i < numChildNodes; i++) {
    cursor = childNodes[i];
    if(DOMFilter.isElement(cursor)) {
      if(DOMFilter.isLeafElement(bodyElement, cursor)) {
        leaves.add(cursor);
      } else {
        DOMFilter.collectLeavesRecursively(leaves, bodyElement, cursor);
      }
    }
  }
};

// Returns true if the given element is a leaf
// TODO: remove the bodyElement parameter
DOMFilter.isLeafElement = function(bodyElement, element) {
  if(element === bodyElement) {
    return false;
  }

  if(DOMFilter.LEAF_EXCEPTION_ELEMENT_NAMES.has(element.localName)) {
    return false;
  }

  const childNodes = element.childNodes;

  childNodes[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let childNode of childNodes) {
    if(childNode.nodeType === Node.TEXT_NODE) {
      if(!DOMFilter.TRIVIAL_TEXT_NODE_VALUES.has(childNode.nodeValue)) {
        return false;
      }
    } else if(DOMFilter.isElement(childNode)) {
      if(!DOMFilter.isLeafElement(bodyElement, childNode)) {
        return false;
      }
    } else {
      return false;
    }
  }

  return true;
};

// Unwraps anchors that are not links to other pages
DOMFilter.filterNominalAnchors = function(document) {
  const anchors = document.querySelectorAll('a');
  anchors[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let anchor of anchors) {
    if(!anchor.hasAttribute('name')) {
      let href = anchor.getAttribute('href') || '';
      href = href.trim();
      if(!href) {
        DOMFilter.unwrapElement(anchor);
      }
    }
  }
};

DOMFilter.isNominalAnchor = function(anchor) {
  // todo: implement me
};

DOMFilter.filterScriptElements = function(document) {
  DOMFilter.removeElementsBySelector(document, 'script');
};

// NOTE: Due to content-loading tricks, noscript requires special handling
// e.g. nbcnews.com. I was originally unwrapping noscripts but it was
// leading to lots of garbage content. For now I am just removing until
// I give this more thought. There is also something I don't quite understand
// with a practice of using encoded html as the text content.
DOMFilter.filterNoScriptElements = function(document) {
  DOMFilter.removeElementsBySelector(document, 'noscript');
};

// Disable anchors that use javascript protocol. Keep the href
// around for boilerplate analysis, and because I am not quite sure I want
// remove content beneath such anchors. If I just unwrap, this leads to lots
// of junk words like 'click me' in the text that are not links. If I remove,
// I risk removing informative content.
DOMFilter.filterJavascriptAnchors = function(document) {
  const anchors = document.querySelectorAll('a[href]');
  anchors[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let anchor of anchors) {
    if(DOMFilter.isJavascriptAnchor(anchor)) {
      anchor.setAttribute('href', '');
    }
  }
};

// Returns whether the anchor is a javascript anchor
// NOTE: rather than use a regex, we can take advantage of the accurate
// parsing of the browser (and mirror its behavior for that matter) by
// just accessing the protocol property.
DOMFilter.isJavascriptAnchor = function(anchor) {
  return anchor.protocol === 'javascript:';
};

// Unwraps tables that consist of a single cell, which generally indicates
// a formatting purpose
DOMFilter.filterSingleCellTables = function(document) {
  const tables = document.querySelectorAll('table');
  tables[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let table of tables) {
    let cell = DOMFilter.getTableSingleCell(table);
    if(cell) {
      DOMFilter.unwrapSingleCellTable(table, cell);
    }
  }
};

// Returns the single cell of a table iff it is a single cell table,
// which means it has only 1 row and 1 column. This is implemented to return
// the element instead of a boolean so that subsequent code does not need to
// find the cell again.
DOMFilter.getTableSingleCell = function(table) {
  const rows = table.rows;
  let cell = null;
  if(rows.length === 1) {
    let cells = rows[0].cells;
    if(cells.length === 1) {
      cell = cells[0];
    }
  }

  return cell;
};

// Replaces a table in the dom with the child nodes of its single cell
// TODO: does HTMLTDElement have a pointer to its container table?
// TODO: detach before unwrap to reduce dom ops (see unwrapElement)
DOMFilter.unwrapSingleCellTable = function(table, cell) {
  const parent = table.parentElement;
  const nextSibling = table.nextSibling;

  if(nextSibling) {
    for(let node = cell.firstChild; node; node = cell.firstChild) {
      parent.insertBefore(node, nextSibling);
    }
  } else {
    for(let node = cell.firstChild; node; node = cell.firstChild) {
      parent.appendChild(node);
    }
  }

  table.remove();
};

// Transforms single column tables into paragraph separated row content
DOMFilter.filterSingleColumnTables = function(document) {
  const tables = document.querySelectorAll('table');
  tables[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let table of tables) {
    if(DOMFilter.isSingleColumnTable(table)) {
      DOMFilter.transformSingleColumnTable(table);
    }
  }
};

// Returns true if the table appears to consist of only a single column
DOMFilter.isSingleColumnTable = function(table) {
  const rows = table.rows;
  const upperBound = Math.min(rows.length, 20);
  let isSingleColumn = true;
  for(let i = 0; i < upperBound; i++) {
    if(rows[i].cells.length > 1) {
      isSingleColumn = false;
      break;
    }
  }

  return isSingleColumn;
};

// Returns an iterator that yields the cells of a table, in top down
// then left right order
DOMFilter.createTableCellIterator = function(table) {
  // TODO: implement me
};

// TODO: create and use a TableCellIterator instead of express iteration?
// TODO: test
DOMFilter.transformSingleColumnTable = function(table) {
  const parent = table.parentElement;
  const nextSibling = table.nextSibling;

  function insert(node, beforeNode) {
    parent.insertBefore(node, beforeNode);
  }

  function append(node) {
    parent.appendChild(node);
  }

  const moveNode = nextSibling ? insert : append;

  const ownerDocument = table.ownerDocument;
  for(let rows = table.rows, numRows = rows.length, rowIndex = 0,
    columnIndex = 0, cell, cells, numCells = 0, firstChild; rowIndex < numRows;
    rowIndex++) {
    for(columnIndex = 0, cells = rows[rowIndex], numCells = cells.length;
      columnIndex < numCells; columnIndex++) {
      for(cell = cells[columnIndex], firstChild = cell.firstChild; firstChild;
        firstChild = cell.firstChild) {
        moveNode(firstChild, nextSibling);
      }
    }

    moveNode(ownerDocument.createElement('p'), nextSibling);
  }

  table.remove();
};

DOMFilter.filterSingleItemLists = function(document) {
  const lists = document.querySelectorAll('ul, ol');
  lists[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let list of lists) {
    if(DOMFilter.countListItems(list) === 1) {
      DOMFilter.unwrapSingleItemList(list);
    }
  }
};

DOMFilter.isListItem = DOMFilter.elementHasName.bind(null, 'li');

DOMFilter.countListItems = function(list) {
  const childNodes = list.childNodes;
  childNodes[Symbol.iterator] = Array.prototype[Symbol.iterator];
  let count = 0;
  for(let childNode of childNodes) {
    if(DOMFilter.isListItem(childNode)) {
      count++;
    }
  }
  return count;
};

DOMFilter.getFirstListItem = function(list) {
  return Array.prototype.find.call(list.childNodes, DOMFilter.isListItem);
};

// assumes the list item count > 0
// TODO: detach first to reduce ops on live (see unwrapElement)
DOMFilter.unwrapSingleItemList = function(list) {
  const parent = list.parentElement;
  const item = DOMFilter.getFirstListItem(list);
  const nextSibling = list.nextSibling;
  if(nextSibling) {
    while(item.firstChild) {
      parent.insertBefore(item.firstChild, nextSibling);
    }
  } else {
    while(item.firstChild) {
      parent.appendChild(item.firstChild);
    }
  }

  list.remove();
};

// Removes images without a source. This should only be called after
// transformLazyImages because that function may derive a source property for
// an otherwise sourceless image.
// TODO: eventually stop logging. For now it helps as a way to
// identify new lazily-loaded images
DOMFilter.filterSourcelessImages = function(document) {
  const images = document.querySelectorAll('img');
  images[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let image of images) {
    if(DOMFilter.isSourcelessImage(image)) {
      console.debug('Removing sourceless image: %s', image.outerHTML);
      image.remove();
    }
  }
};

// NOTE: using hasAttribute allows for whitespace-only values, but I do not
// think this is too important
// NOTE: access by attribute, not by property, because the browser may
// supply a base url prefix or something like that to the property
DOMFilter.isSourcelessImage = function(image) {
  return !image.hasAttribute('src') && !image.hasAttribute('srcset');
};

// Removes all tracer images
DOMFilter.filterTracerImages = function(document) {
  const images = document.querySelectorAll('img');
  images[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let image of images) {
    if(DOMFilter.isTracerImage(image)) {
      image.remove();
    }
  }
};

// This function considers width and height independently, resulting in removal
// of not just tracer images but also images used as horizontal rule elements
// or vertical bars, which is desired.
// This requires the dimensions be set. If an image does not have dimension
// attributes, it should be pre-fetched before calling this.
DOMFilter.isTracerImage = function(image) {
  return image.width < 2 || image.height < 2;
};

// Moves elements matching the selector query from the source document into
// the destination document. This function iterates over elements in the node
// list generated as a result of querySelectorAll. Once an element is moved,
// its children are implicitly also moved. If a child also matches the selector
// query, it is not moved again.
// This function works similarly to removeElementsBySelector, but potentially
// performs fewer dom manipulations because of how it avoids manipulating
// child elements of moved elements. In theory, this can lead to better
// performance. This also achieves better technical accuracy, because the fact
// that removed/moved child elements remain in the node list even after a parent
// was removed/moved, is undesirable behavior. Unfortunately, I cannot think of
// a way to accomplish the desired behavior using the native API provided.
// If destination is undefined, then a dummy document is supplied, which is
// discarded when the function completes, which results in the elements being
// simply removed from the source document.
// TODO: use for..of once Chrome supports NodeList iterators
// @param source {Document}
// @param destination {Document}
// @param selector {String}
// @returns void
DOMFilter.moveElementsBySelector = function(source, destination, selector) {
  const targetDocument = destination ||
    document.implementation.createHTMLDocument();
  const elements = source.querySelectorAll(selector);
  elements[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let element of elements) {
    if(element.ownerDocument === source) {
      targetDocument.adoptNode(element);
    }
  }
};

// Finds all elements with the given tagName and removes them,
// in reverse document order. This will remove elements that do not need to
// be removed because an ancestor of them will be removed in a later iteration.
// NOTE: this ONLY works in reverse. getElementsByTagName returns a LIVE
// NodeList/HTMLCollection. Removing elements from the list while iterating
// screws up all later index access when iterating forward. To avoid this,
// use a non-live list such as the one returned by querySelectorAll.
DOMFilter.removeElementsByName = function(document, tagName) {
  const elements = document.getElementsByTagName(tagName);
  const numElements = elements.length;
  for(let i = numElements - 1; i > -1; i--) {
    elements[i].remove();
  }
};

// Finds all elements matching the selector and removes them,
// in forward document order. In contrast to moveElementsBySelector, this
// removes elements that are descendants of elements already removed.
// NOTE: i tried to find a way to avoid visiting detached subtrees, but
// document.contains still returns true for a removed element. The only way
// seems to be to traverse upwards and checking if documentElement is still at
// the top of the ancestors chain. That is obviously too inefficient, and
// probably less efficient than just visiting descendants. The real tradeoff
// is whether the set of remove operations is slower than the time it takes
// to traverse. I assume traversal is faster, but not fast enough to merit it.
// TODO: use for..of once Chrome supports NodeList iterators
DOMFilter.removeElementsBySelector = function(document, selector) {
  const elements = document.querySelectorAll(selector);
  elements[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let element of elements) {
    element.remove();
  }
};

DOMFilter.manipulateElementsBySelectorAndPredicate = function(document,
  selector, predicate, manipulate) {
  const elements = document.querySelectorAll(selector);
  elements[Symbol.iterator] = Array.prototype[Symbol.iterator];
  for(let element of elements) {
    if(predicate(element)) {
      manipulate(element);
    }
  }
};

DOMFilter.rejectTrivialTextNodeValues = function(node) {
  return DOMFilter.TRIVIAL_TEXT_NODE_VALUES.has(node.nodeValue) ?
    NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
};

DOMFilter.NBSP_PATTERN = /&nbsp;/g;

// Normalizes the values of all text nodes in a document
DOMFilter.normalizeWhitespace = function(document) {
  const iterator = document.createNodeIterator(document.documentElement,
    NodeFilter.SHOW_TEXT, DOMFilter.rejectTrivialTextNodeValues);
  iterator[Symbol.iterator] = DOMFilter.getSymbolIteratorImpl(iterator);
  for(let node of iterator) {
    node.nodeValue = node.nodeValue.replace(DOMFilter.NBSP_PATTERN, ' ');
  }
};

// Condenses spaces of text nodes that are not descendants of whitespace
// sensitive elements such as <pre>. This expects that node values were
// previous normalized, so, for example, it does not consider &nbsp;.
DOMFilter.condenseNodeValues = function(document, sensitiveElements) {
  const iterator = document.createNodeIterator(document.documentElement,
    NodeFilter.SHOW_TEXT,
    DOMFilter.rejectIfSensitive.bind(null, sensitiveElements));
  iterator[Symbol.iterator] = DOMFilter.getSymbolIteratorImpl(iterator);
  for(let node of iterator) {
    node.nodeValue = DOMFilter.condenseSpaces(node.nodeValue);
  }
};

// TODO: it is nice to use the function filter argument to createNodeIterator
// but performance is dropping because of it, maybe move the condition back
// inot the respective loops
DOMFilter.rejectIfSensitive = function(sensitiveElements, node) {
  return sensitiveElements.has(node.parentElement) ?
    NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
};

// A regular expression that matches any number of occurrences of one or more
// consecutive spaces
DOMFilter.CONSECUTIVE_SPACES_PATTERN = / +/g;

// Replaces one or more consecutive spaces with a single space
DOMFilter.condenseSpaces = function(inputString) {
  return inputString.replace(DOMFilter.CONSECUTIVE_SPACES_PATTERN, ' ');
};

// Removes trimmable elements from the start and end of the document
// NOTE: should isTrimmableElement be merged or share functionality with
// the isLeafElement function?
// NOTE: should only be called after filterLeafElements if that is ever called
// TODO: don't require body, e.g. let root = document.body ||
// document.documentElement
DOMFilter.trimDocument = function(document) {
  if(document.body) {
    let sibling = document.body;
    let node = document.body.firstChild;
    while(node && DOMFilter.isTrimmableNode(node)) {
      sibling = node.nextSibling;
      node.remove();
      node = sibling;
    }

    node = document.body.lastChild;
    while(node && DOMFilter.isTrimmableNode(node)) {
      sibling = node.previousSibling;
      node.remove();
      node = sibling;
    }
  }
};

DOMFilter.TRIMMABLE_NODE_NAMES = new Set([
  'br', 'hr', 'nobr'
]);

// TODO: support additional cases of empty elements other than paragraph? we
// basically want to consider every element except for img, svg, etc.
// TODO: review interaction with removal of empty node values, does that
// still happen anywhere? if a node value that is empty remains then
// the empty paragraph check or other similar checks, will not work if such
// checks only look at the presence of a child node, i think i do this
// implicitly as a part of trimTextNodes, maybe that should be separated out
// TODO: review interaction with filterLeafElements, won't the removal of
// all empty paragraphs already consider this? but then trimming would have
// to occur after leaves removed, right? should order matter?
DOMFilter.isTrimmableNode = function(node) {
  return DOMFilter.isElement(node) &&
    (DOMFilter.TRIMMABLE_NODE_NAMES.has(node.localName) ||
    DOMFilter.isEmptyParagraph(node));
};

DOMFilter.isEmptyParagraph = function(element) {
  return element && element.localName === 'p' && !element.firstChild;
};

// Carefully trims a document's text nodes, with special handling for
// nodes near inline elements and whitespace sensitive elements such as <pre>
// TODO: this is still causing an issue where there is no space adjacent
// to an inline element, e.g. a<em>b</em> is rendered as ab
// TODO: i am still observing errors in the output that I attribute to
// this function
DOMFilter.trimTextNodes = function(document, sensitiveElements) {
  const iterator = document.createNodeIterator(
    document.documentElement, NodeFilter.SHOW_TEXT,
    DOMFilter.rejectIfSensitive.bind(null, sensitiveElements));
  iterator[Symbol.iterator] = DOMFilter.getSymbolIteratorImpl(iterator);
  const isElement = DOMFilter.isElement;
  // Note this is using the no trim function, not the other function
  // for the purpose of unwrapping inlines, it is a different set
  const isInlineElement = DOMFilter.isInlineElementNoTrim;
  for(let node of iterator) {
    if(node.previousSibling) {
      if(isElement(node.previousSibling)) {
        if(isInlineElement(node.previousSibling)) {
          if(node.nextSibling) {
            if(isElement(node.nextSibling)) {
              if(!isInlineElement(node.nextSibling)) {
                node.nodeValue = node.nodeValue.trimRight();
              }
            }
          } else {
            node.nodeValue = node.nodeValue.trimRight();
          }
        } else {
          node.nodeValue = node.nodeValue.trim();
        }
      } else {
       if(node.nextSibling) {
          if(isElement(node.nextSibling)) {
            if(isInlineElement(node.nextSibling)) {
            } else {
             node.nodeValue = node.nodeValue.trimRight();
            }
          }
        } else {
          node.nodeValue = node.nodeValue.trimRight();
        }
      }
    } else if(node.nextSibling) {
     if(isElement(node.nextSibling)) {
        if(isInlineElement(node.nextSibling)) {
          node.nodeValue = node.nodeValue.trimLeft();
        } else {
          node.nodeValue = node.nodeValue.trim();
        }
      } else {
        node.nodeValue = node.nodeValue.trimLeft();
      }
    } else {
      // In this branch, we have a text node that has no siblings, which is
      // generally a text node within an inline element.
      // It feels like we want to full trim here, but we actually do not want
      // to trim, because it causes a funky display error where text following
      // an inline element's text is immediately adjacent to the inline
      // text. Not full-trimming here leaves trailing whitespace in the inline
      // element, which avoids the issue. I suppose, alternatively, we could
      // introduce a single space after the element, but that seems strange.
      node.nodeValue = node.nodeValue.trimLeft();
    }
  }
};

DOMFilter.filterEmptyTextNodes = function(document) {
  const iterator = document.createNodeIterator(
    document.documentElement, NodeFilter.SHOW_TEXT);
  iterator[Symbol.iterator] = DOMFilter.getSymbolIteratorImpl(iterator);
  for(let node of iterator) {
    if(!node.nodeValue) {
      node.remove();
    }
  }
};

// These elements are whitespace sensitive
// TODO: use a Set?
DOMFilter.SENSITIVE_ELEMENTS_SELECTOR = [
  'code',
  'code *',
  'pre',
  'pre *',
  'ruby',
  'ruby *',
  'textarea',
  'textarea *',
  'xmp',
  'xmp *'
].join(',');

// Return a set of elements that are whitespace sensitive. This is useful
// for checking whether a text node has an ancestor that deems it as sensitive.
// Rather than walking the ancestor chain each time to do such a check, we
// collect all such elements and their descendants into a large set, so that
// we can simply check if a text node's parent element is a member.
// TODO: see if I can avoid Array.from once Chrome supports iterable NodeLists
DOMFilter.getSensitiveSet = function(document) {
  const sensitiveElements = document.querySelectorAll(
    DOMFilter.SENSITIVE_ELEMENTS_SELECTOR);
  return new Set(Array.from(sensitiveElements));
};

// TODO: merge with inline elements above?
// TODO: rename to something simple
DOMFilter.INLINE_ELEMENTS_NO_TRIM = new Set([
  'a',
  'abbr',
  'acronym',
  'address',
  'b',
  'bdi',
  'bdo',
  'blink',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'ins',
  'kbd',
  'mark',
  'map',
  'meter',
  'q',
  'rp',
  'rt',
  'samp',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'time',
  'tt',
  'u',
  'var'
]);

DOMFilter.isInlineElementNoTrim = function(element) {
  return DOMFilter.INLINE_ELEMENTS_NO_TRIM.has(element.localName);
};

DOMFilter.isElement = function(node) {
  return node.nodeType === Node.ELEMENT_NODE;
};

// Replaces an element with its child nodes
// TODO: performance profiling showing hotspot when called by
// filterInlineElements. I think it actually may be that filterInlineElements
// does extra removals in the case of nested inlines
DOMFilter.unwrapElement = function(element) {

  // Count the number of child nodes we plan to move as an estimate of
  // how many dom manipulations will be performed
  const numChildNodes = element.childNodes.length;

  // Exit early when there are no children to move. Basically, we 'perform'
  // 0 move operations then delete the element as normal.
  if(!numChildNodes) {
    element.remove();
    return;
  }

  const parent = element.parentElement;

  // Without a parent, there is no destination for the child elements,
  // which means we are just going to completely delete the element
  // and its descendants. I am not sure that deleting the element is
  // necessary, but I like the consistent behavior of always deleting the
  // element. I am not sure, however, what it even means to delete an
  // element without a parent. If an element doesn't have a parent it is
  // probably already detached and we can just ignore it.
  // This might change, however, if we plan on allowing for an alternate
  // destination for the children
  if(!parent) {
    element.remove();
    return;
  }

  // Detach the parent only if we are going to be doing more than
  // 2 move operations on child nodes and there is a known grandparent
  // under which to re-attach the parent. I chose 2 because we are doing
  // one operation by removing the parent, and one operation re-attaching
  // the parent, and so we only have a reduction in dom manipulations if
  // the number of children we are going to move is greater than 2.
  const grandParent = parent.parentElement;
  if(grandParent && numChildNodes > 2) {
    // Cache the location of the parent within the grandparent before
    // detaching the parent, because removing the parent sets this to null, and
    // we need to know this to properly re-attach the parent
    const nextSibling = parent.nextSibling;
    // Detach the parent before moving the child nodes. This reduces the
    // number of dom operations on a possibly live document
    parent.remove();
    // Move the child nodes and delete the element
    DOMFilter.moveChildNodesIntoParent(parent, element);
    // Reattach the parent
    if(nextSibling) {
      grandParent.insertBefore(parent, nextSibling);
    } else {
      grandParent.appendChild(parent);
    }
  } else {
    // There was either not a grand parent, so we could not detach the parent,
    // or there are only a small number of nodes being moved
    // Move the child nodes and delete the element
    DOMFilter.moveChildNodesIntoParent(parent, element);
  }
};

// Private helper for unwrapElement
DOMFilter.moveChildNodesIntoParent = function(parent, element) {
  let firstNode = element.firstChild;
  while(firstNode) {
    parent.insertBefore(firstNode, element);
    firstNode = element.firstChild;
  }

  element.remove();
};
