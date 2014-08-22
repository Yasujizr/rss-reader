// Copyright 2014 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

var lucu = lucu || {};

(function(exports) {

'use strict';

/**
 * Private helper function for the values function
 * Looks up the value of the property in the object. There does
 * not appear to be a native way of undoing the syntactic sugar
 * so this function is necessary.
 */
function at(object, key) {
  return object[key];
}

/**
 * Fade an element in/out
 * Elements must have opacity defined as 0 or 1 for this to work
 *
 * TODO: this needs to be entirely refactored. it could be
 * greatly simplified, it could make fewer assumptions about the element's
 * state
 */
exports.fade = function(element, duration, delay, callback) {

  if(element.style.display == 'none') {
    element.style.display = '';
    element.style.opacity = '0';
  }

  if(!element.style.opacity)
    element.style.opacity = element.style.display == 'none' ? '0' : '1';

  if(callback)
    element.addEventListener('webkitTransitionEnd', ended);

  // property duration function delay
  element.style.transition = 'opacity '+duration+'s ease '+delay+'s';
  element.style.opacity = element.style.opacity == '1' ? '0' : '1';

  function ended(event) {
    this.removeEventListener('webkitTransitionEnd', ended);
    callback(element);
  }
};

//Finds first matching CSS rule by selectorText query.
exports.findCSSRule = function(sheet, selectorText) {

  if(!sheet) {
    return;
  }

  var rules = sheet.cssRules;

  // TODO: use a partial instead of an outer scope ref

  var matches = Array.prototype.filter.call(rules, function(rule) {
    return rule.selectorText == selectorText;
  });

  // TODO: is the length check even necessary?
  if(matches.length) {
    return matches[0];
  }
};

exports.forEach = function(arrayLikeObject, fn) {

  if(!arrayLikeObject) {
    return;
  }

  return Array.prototype.forEach.call(arrayLikeObject, fn);
};

/**
 * Simple date formatting
 * TODO: switch to moments.js and deprecate
 */
exports.formatDate = function(date, sep) {
  if(!date)
    return '';

  var parts = [];
  parts.push(date.getMonth() + 1);
  parts.push(date.getDate());
  parts.push(date.getFullYear());
  return parts.join(sep || '');
};

// TODO: this is only ever called from entry.js, move it there
// Generate a simple hashcode from an array of strings
exports.generateHash = function(array) {
  if(array) {
    return array.reduce(reduceChar, 0);
  }
};

/**
 * Returns a URL string pointing to the fav icon for a url. If url is
 * undefined/empty, the locally stored default fav icon url is returned
 * instead.
 *
 * NOTE: chrome://favicons/url only works for urls present in
 * history, so it is useless.
 * TODO: this should be using a callback, to allow for more seamless
 * transition to async service call.
 * TODO: support offline. right now this returns a remote url which
 * then causes images to not load later if offline.
 * TODO: this is should be refactored to look more like a wrapper call
 * to a service from which urls are fetched.
 * TODO: does it matter whether we use http or https?
 * TODO: does fetching involve CORS issues or need to change manifest
 * or similar issues? If I ever want to stop using all_urls, the
 * URLs used here would maybe need to be explicit in manifest?
 *
 * @param url {String} the url of a webpage for which to find the
 * corresponding fav icon.
 * @return {String} the url of the favicon
 */
exports.getFavIconURL = function(url) {
  return url ?
    'http://www.google.com/s2/favicons?domain_url=' + encodeURIComponent(url) :
    '/media/rss_icon_trans.gif';
};

// private helper for stripTags
function getNodeValue(node) {
  return node.nodeValue;
}

/**
 * Gets the mime type from the XMLHttpRequest. Note that for now
 * this does not actually parse it, it just gets the full header
 * TODO: this is only ever called from one place, it belongs there not here
 */
exports.getMimeType = function(request) {
  return request && request.getResponseHeader('Content-Type');
};

/**
 * TODO: this is only called from one place it belongs there not here
 */
exports.isMimeFeed = function(contentType) {
  return /(application|text)\/(atom|rdf|rss)?\+?xml/i.test(contentType);
};

/**
 * TODO: this is only called from one place it belongs there not here
 */
exports.isTextHTML = function(contentType) {
  return /text\/html/i.test(contentType);
};

/**
 * TODO: if this function is only called by one thing then it belongs
 * there not here. Move this to backup.js
 */
exports.loadAsText = function(onFileLoad, file) {
  var reader = new FileReader();
  reader.onload = onFileLoad;
  reader.readAsText(file);
};


// TODO: this is only ever called from one place, move it there
// Map a function over an array like object, such as NodeList or
// arguments
lucu.map = function(list, fn) {

  // This defensive guard lets us avoid the null check
  // in the calling context, which is typical because the list
  // is typically generated by getElementsByTagName or querySelectorAll
  // which has at times (for unknown reasons) returned undefined/null.
  if(!list) {
    return [];
  }

  return Array.prototype.map.call(list, fn);
};

/**
 * A simple no operation function singleton
 */
exports.noop = function() {};

/**
 * Simple date parsing. Does not always yield a valid date.
 * TODO: switch to moments.js and deprecate
 */
exports.parseDate = function(str) {
  if(!str) {
    return;
  }

  var date = new Date(str);

  // Try to avoid returning an invalid date
  if(Object.prototype.toString.call(date) != '[object Date]') {
    return;
  }

  if(!isFinite(date)) {
    return;
  }

  return date;
};

/**
 * Parses an HTML string into an HTML element. For now
 * this parses into a new HTML document and returns
 * the body element.
 *
 * This does not use document.createElement. Webkit
 * fetches resources in a local document element the moment the
 * element is created, regardless of whether the element is later
 * appended to the document. Therefore, we create a separate
 * document using document.implementation.createHTMLDocument, and
 * then use the innerHTML trick on the body element.
 *
 * Appending an element created in a foreign document to the
 * local document should technically throw an exception. The proper
 * approach is to use document.importNode or document.adoptNode
 * to create an element within the local document context and
 * then append that element. However, Webkit/Chrome sometimes allows
 * for the import step to be implied when using appendChild or
 * replaceChild. Caveat implementor.
 *
 * NOTE: DOMParser.parseFromString in Webkit/Chrome just decorates
 * document.implementation.createDocument and passes in
 * some default parameters. The two approaches are basically the
 * same.
 *
 * NOTE: this uses doc.body simply because I did not realize at the time
 * I first wrote this that using doc.documentElement.innerHTML would
 * work just as well.
 *
 * NOTE: because this returns the body element, a simple way to get to
 * the containing document is by doc.body.ownerDocument
 *
 * TODO: return the doc, not doc.body. Will conform with xml.parse and
 * require fewer caller gymnastics
 */
exports.parseHTML = function(string) {
  var doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = string;
  return doc.body;
};

/**
 * Possibly simpler parseHTML function that uses a template
 * element.
 *
 * Using a template approach could be better for several reasons.
 * Template HTML is inert until appended, unlike createElement. It still
 * uses what is basically the innerHTML hack. It gives us something
 * rootless so we do not have to mess with doc.body stuff. It also
 * significantly less heavyweight then creating a document. It looks
 * like it also requires adoptNode instead of doing it implicitly in
 * appendChild, which could reduce errors and XSS surprises.
 *
 * See http://www.html5rocks.com/en/tutorials/webcomponents/template/
 *
 * UNDER DEVELOPMENT, UNTESTED
 */
exports.parseHTML2 = function(string) {
  console.warn('CALLED UNTESTED FUNCTION lucu.html.parse2');
  var template = document.createElement('template');
  template.content = string;
  return template;
};

/**
 * Parses the string into an XMLDocument.
 * If the XML is invalid, an exception is thrown
 *
 * Returns the document (not documentElement), which
 * is a bit different than what parseHTML returns
 */
exports.parseXML = function(string) {

  var parser = new DOMParser();
  var doc = parser.parseFromString(string, 'application/xml');

  if(!doc || !doc.documentElement) {
    throw new SyntaxError('invalid xml');
  }

  // TODO: use querySelector instead of gebtn?
  // Check for the presence of a parsererror element in the output
  // and if so, undo the mixing of a parse exception event with
  // the parsed content, and throw an error instead
  var parserError = doc.documentElement.getElementsByTagName('parsererror');
  if(parserError && parserError.length) {

    // Only work with the first error element
    parserError = parserError[0];

    console.debug('parsing error %o', parserError);

    // Search for the text content of just the error message
    if(parserError.firstChild && parserError.firstChild.nextSibling) {
      parserError = parserError.firstChild.nextSibling.textContent;
      if(parserError) {
        throw new SyntaxError(parserError);
      }
    }

    // Fallback to just using an error message that may have tags
    throw new SyntaxError(parserError.textContent);
  }

  return doc;
};

// Private helper for generateHash
function reduceChar(accum, value) {
  var firstCharCode = value.charCodeAt(0);
  var sum = accum * 31 + firstCharCode;
  return sum % 4294967296;
}

/**
 * Scrubs html from a string by parsing into HTML and then
 * back into text without element tags.
 */
exports.stripTags = function(string, replacement) {
  if(!string) {
    return;
  }

  var htmlDocumentBody = lucu.parseHTML(string);

  if(!replacement) {
    return htmlDocumentBody.textContent;
  }

  var ownerDocument = htmlDocumentBody.ownerDocument;
  var textNodeIterator = ownerDocument.createNodeIterator(
    htmlDocumentBody, NodeFilter.SHOW_TEXT);
  var textNode;
  var textNodes = [];

  while(textNode = textNodeIterator.nextNode()) {
    textNodes.push(textNode);
  }

  var nodeValues = textNodes.map(getNodeValue);
  return nodeValues.join(replacement);
};

/**
 * Naive <br> removal
 */
exports.stripBRs = function(string) {
  return string && string.replace(/<br>/gi,'');
};

/**
 * Returns a string without control-like characters
 *
 * TODO: this needs a better name
 * TODO: this doesn't actually strip all binary control characters
 * TODO: \t\r\n is approximately \s, and could just be \s ?
 * What's the diff between \s/g and \s+/g  ?
 */
exports.stripControls = function(string) {
  return string && string.replace(/[\t\r\n]/g,'');
};

/**
 * Returns a string that has been shortened
 * NOTE: rename to elide?
 * NOTE: Array.prototype.slice ?
 */
exports.truncate = function(str, position, extension) {
  return str && (str.length > position) ?
    str.substr(0,position) + (extension || '...') :
    str;
};

/**
 * Gets the values of the properties of an object as an array
 */
exports.values = function(object) {
  // TODO: this function is only called once, maybe move it to the one place
  // it is ever called? Maybe even just inline it?
  // TODO: consider some type of convolutional approach that avoids using
  // intermediate arrays but also avoids an explicit loop
  // TODO: does the native keys function already restrict? In other words, is
  // filtering by hasOwnProperty already done for us?
  var keys = Object.keys(object);
  var hasOwn = Object.prototype.hasOwnProperty.bind(object);
  var ownKeys = keys.filter(hasOwn);
  var lookup = at.bind(null,object);
  return ownKeys.map(lookup);
};

}(lucu));