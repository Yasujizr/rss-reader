// Copyright 2014 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

var lucu = lucu || {};

lucu.feed = lucu.feed || {};

/**
 * Fetches the XML for a feed from a URL, then parses it into
 * a javascript object, and passes this along to a callback. If an error
 * occurs along the way, calls an error callback instead. Async.
 *
 * For each entry, if augmentEntries is true, and if the entry has
 * a link, this also sends subsequent http requests to get the full html
 * of the link and uses that instead of the entry.content property that
 * was provided from within the xml feed.
 *
 * TODO: onerror could be passed an XMLHttpRequest event containing an error,
 * an exception, a string, or a custom object. I need to standardize the
 * error object that is passed to onerror. I also think it really does
 * need error codes because identifying each error by string key is making
 * it difficult to respond to different errors differently.
 *
 * TODO: this should not also do the xml to feed conversion. The coupling is
 * too tight because I want to be able to test fetching and transformation
 * separately. but separate web page fetching requires the feed be
 * converted first to identify links
 *
 * TODO: separate timeout for feed fetch and web page fetch
 * TODO: option to fetch/not fetch webpages instead of always fetch
 * TODO: formalize/standardize the parameter to onerror?
 * TODO: is an approach that uses overrideMimeType better than
 * checking content type? will it just cause the native parsing errors I
 * was trying to avoid?
 *
 * TODO: responseURL contains the redirected URL. Need to update the url
 * when that happens.
 *
 * TODO: this is always going to augment entries and images. these
 * do not need to be parameters
 *
 * @param params {object} an object literal that should contain props:
 * - url the remote url of the feed to fetch
 * - oncomplete - a callback to call when the feed is fetched, that is passed
 * a javascript object representing the contents of the feed
 * - onerror - a callback to call in case of an error, that is called instead
 * of oncomplete
 * - timeout - optional timeout before giving up on feed (or web pages)
 * - augmentEntries - if true, fetches full content of entry.link and
 * uses that instead of the feed content
 * - augmentImageData - augment image data in fetched web pages
 * - rewriteLinks - if true, entry.link values are rewritten in the feed
 * prior to fetching or checking if already fetched in db
 * - entryTimeout - optional timeout before giving up on fetching webpage for entry
 */
lucu.feed.fetch = function(params) {

  var url = (params.url || '').trim();
  var oncomplete = params.oncomplete || lucu.functionUtils.noop;
  var onerror = params.onerror || lucu.functionUtils.noop;
  var timeout = timeout;
  var augmentImageData = params.augmentImageData;
  var augmentEntries = params.augmentEntries;
  var rewriteLinks = params.rewriteLinks;
  var entryTimeout = params.entryTimeout;

  // For some unexpected reason this function is sometimes
  // called when offline so we need to check for that here
  // and exit early. This avoids a bunch of net::ERR_NETWORK_IO_SUSPENDED
  // error messages produced by request.send. request.send()
  // does not appear to throw a catchable exception.

  // NOTE: still getting this error. It is like onLine is not returning
  // false when offline.

  // NOTE: should this be the caller's responsibility? It seems kind of
  // strange to be able to call a 'fetch' operation while offline

  if(!navigator.onLine) {
    return onerror({type: 'offline', url: url});
  }

  var request = new XMLHttpRequest();
  request.timeout = timeout;
  request.onerror = onerror;
  request.ontimeout = onerror;
  request.onabort = onerror;
  request.onload = lucu.feed.onFetch.bind(request, oncomplete,
    onerror, augmentEntries, augmentImageData, rewriteLinks, entryTimeout);
  request.open('GET', url, true);
  request.send();
};

// expects to be bound to an XMLHttpRequest
lucu.feed.onFetch = function(onComplete, onError, shouldAugmentEntries,
  shouldAugmentImages, rewriteLinks, entryTimeout) {

  var mime = lucu.mime.getType(this) || '';

  if(lucu.mime.isFeed(mime)) {
    if(!this.responseXML || !this.responseXML.documentElement) {
      return onError({type: 'invalid-xml', target: this});
    }

    return lucu.feed.convertFromXML(this.responseXML, onComplete, onError,
      shouldAugmentEntries, shouldAugmentImages, rewriteLinks, entryTimeout);
  }

  if(lucu.mime.isTextHTMLOrPlain(mime)) {

    try {
      var xmlDocument = lucu.xml.parse(this.responseText);
    } catch(e) {
      return onError(e);
    }

    if(!xmlDocument || !xmlDocument.documentElement) {
      return onError({type: 'invalid-xml', target: this});
    }

    return lucu.feed.convertFromXML(xmlDocument, onComplete, onError,
      shouldAugmentEntries, shouldAugmentImages, rewriteLinks, entryTimeout);
  }

  return onError({type: 'invalid-content-type', target: this});
};

lucu.feed.convertFromXML = function(xmlDocument, onComplete, onError,
  shouldAugmentEntries, shouldAugmentImages, rewriteLinks, entryTimeout) {

  var feed = lucu.feed.createFromDocument(xmlDocument);

  if(feed.ERROR_UNDEFINED_DOCUMENT || feed.ERROR_UNDEFINED_DOCUMENT_ELEMENT ||
     feed.ERROR_UNSUPPORTED_DOCUMENT_ELEMENT) {

    return onError({type: 'invalid-xml'});
  }

  if(!feed.entries.length) {
    return onComplete(feed);
  }

  var entries = feed.entries || [];

  var fetchableEntries = entries.filter(lucu.entry.hasLink);

  var numEntriesToProcess = fetchableEntries.length;
  if(numEntriesToProcess == 0) {
    return onComplete(feed);
  }

  if(rewriteLinks) {
    fetchableEntries.forEach(lucu.entry.rewriteLink);
  }

  // In order to ensure consistent storage of entry.link values,
  // this check for whether to augment does not occur until after
  // entries with links have been possibly rewritten, so that
  // rewritten links are stored either way
  if(!shouldAugmentEntries) {
    return onComplete(feed);
  }

  var augmentContext = {};
  augmentContext.numEntriesToProcess = numEntriesToProcess;
  augmentContext.feed = feed;
  augmentContext.entries = fetchableEntries;
  augmentContext.timeout = entryTimeout;
  augmentContext.augmentImages = shouldAugmentImages;
  augmentContext.onComplete = onComplete;

  var onOpenAugment = lucu.feed.onDatabaseOpenAugmentEntries.bind(augmentContext);
  lucu.database.open(onOpenAugment);
};

lucu.feed.onDatabaseOpenAugmentEntries = function(db) {
  this.entries.forEach(lucu.feed.augmentEntry, {
    db: db,
    dispatchIfComplete: lucu.feed.onFetchDispatchIfComplete.bind(this),
    timeout: this.timeout,
    augmentImages: this.augmentImages
  });
};

lucu.feed.onFetchDispatchIfComplete = function() {
  this.numEntriesToProcess -= 1;

  if(this.numEntriesToProcess) {
    return;
  }

  console.debug('onFetchDispatchIfComplete calling onComplete');
  this.onComplete(this.feed);
};

lucu.feed.augmentEntry = function(entry) {

  // TODO: this lookup check should be per feed, not across all entries,
  // otherwise if two feeds link to the same article, only the first gets
  // augmented. need to use something like findEntryByFeedIdAndLinkURL
  // that uses a composite index

  var onFind = lucu.feed.onAugmentFindByLink.bind(this, entry);
  lucu.entry.findByLink(this.db, entry.link, onFind);
};

lucu.feed.onAugmentFindByLink = function(entry, existingEntry) {
  if(existingEntry) {
    console.debug('onAugmentFindByLink found existing entry');
    this.dispatchIfComplete();
    return;
  }

  console.debug('onAugmentFindByLink replacing content for new entry');

  var replace = lucu.feed.replaceEntryContent.bind(null,
    entry, this.dispatchIfComplete);

  // TODO: support retry after fetch?

  // TODO: move augmentImage followup out of fetchHTML
  // and turn it into a continuation
  lucu.feed.fetchHTML(entry.link, this.timeout,
    this.augmentImages, replace, this.dispatchIfComplete);
};

lucu.feed.replaceEntryContent = function(entry, onComplete, doc) {
  var html = doc.body.innerHTML;
  if(html) {
    entry.content = html;
  }

  onComplete();
};


/**
 * Fetches a webpage. Basically wraps an XMLHttpRequest.
 *
 * TODO: should we notify the callback of responseURL (is it
 * the url after redirects or is it the same url passed in?). i think
 * the onload callback should also receive responseURL. maybe onerror
 * should also receive responseURL if it is defined. that way the caller
 * can choose to also replace the original url
 * TODO: consider support for a fallback to plaintext
 * and recharacterizing this as fetchHTMLOrPlaintextDocument or something.
 * TODO: could this pass the xhr along instead of HTMLDocument? it works in
 * the normal case because caller ust accesses responseXML, but what about
 * if we provide the plaintext fallback?
 * TODO: consider an option to embed iframe content
 * TODO: consider an option to auto-sandboxing iframes
 * TODO: use overrideMimeType instead of the content type check?
 * TODO: check for 404 and other status messages and handle those separately?
 * TODO: move image prefetching out of here to some type of caller, this should
 * only fetch
 *
 * TODO: one of the problems with fetching images before scrubbing is that
 * tracker gifs are pinged by the image loader. think of how to avoid stupid
 * requests like that
 *
 * Params is object with following properties
 * @param {string} url - the url to fetch
 * @param {function} onload - callback when completed without errors,
 * passed HTMLDocument object as only parameter
 * @param {function} onerror - callback when an error occurs that
 * prevents completion, such as abort, timeout, missing body tag, wrong content type
 * @param {integer} timeout - optional, ms
 * @param {boolean} augmentImageData - if true, will pre-fetch images
 * and store dimensions as html attributes.
 */
lucu.feed.fetchHTML = function(url, timeout, augmentImages, onComplete, onError) {
  var request = new XMLHttpRequest();
  request.timeout = timeout;
  request.ontimeout = onError;
  request.onerror = onError;
  request.onabort = onError;
  request.onload = lucu.feed.onFetchHTML.bind(request, onComplete,
    onError, augmentImages);
  request.open('GET', url, true);
  request.responseType = 'document';
  request.send();
};

lucu.feed.onFetchHTML = function(onComplete, onError, augmentImages, event) {

  var mime = lucu.mime.getType(this);

  if(!lucu.mime.isTextHTML(mime)) {
    return onError({type: 'invalid-content-type', target: this, contentType: mime});
  }

  if(!this.responseXML || !this.responseXML.body) {
    return onError({type: 'invalid-document', target: this});
  }

  // TODO: resolve element URLs
  // Leaving this here as a note. At some point we have to resolve the URLs
  // for href and src attributes. We already resolve a/img in other places
  // explicitly but we are not yet doing so for these other elements
  // var SELECTOR_RESOLVABLE = 'a,applet,audio,embed,iframe,img,object,video';

  // TODO: store redirects properly
  // NOTE: this uses the post-redirect url as the base url for anchors

  var baseURI = lucu.uri.parse(this.responseURL);
  var anchors = this.responseXML.body.querySelectorAll('a');
  var resolveAnchor = lucu.anchor.resolve.bind(this, baseURI);
  lucu.element.forEach(anchors, resolveAnchor);

  // TODO: the caller should be responsible for choosing this followup
  // process. This should not be controlling the flow here
  if(augmentImages) {
    // NOTE: this uses the post-redirect responseURL as the base url
    return lucu.image.augmentDocument(this.responseXML, this.responseURL, onComplete);
  }

  onComplete(this.responseXML);
};
