// Copyright 2014 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

var lucu = lucu || {};

// TODO: maybe this module does not really belong
// as a 'feed' submodule, maybe it is its own
// fetch module?

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
 * TODO: this should not also do the xml to feed conversion? The coupling is
 * too tight because I want to be able to test fetching and transformation
 * separately. but separate web page fetching requires the feed be
 * converted first to identify links. Maybe what I am saying is I want
 * fetching to only be about fetching, and some more abstract controller
 * does the sequential cohesion by composing fetch+convert
 * TODO: is an approach that uses overrideMimeType better than
 * checking content type? will it just cause the native parsing errors I
 * was trying to avoid?
 * TODO: responseURL contains the redirected URL. Need to update the url
 * when that happens. Maybe I need to be storing both urls in the db.
 * TODO: entryTimeout should maybe be deprecated? Where should it really
 * be coming from?
 *
 * @param params {object} an object literal that should contain props:
 * - url the remote url of the feed to fetch
 * - oncomplete - a callback to call when the feed is fetched, that is passed
 * a javascript object representing the contents of the feed
 * - onerror - a callback to call in case of an error, that is called instead
 * of oncomplete
 * - timeout - optional timeout before giving up on feed
 * - augmentEntries - if true, fetches full content of entry.link and
 * uses that instead of the feed content
 * - entryTimeout - optional timeout before giving up on fetching webpage for entry
 */
lucu.feed.fetch = function(params) {

  // NOTE: augmentEntries has to exist as a paramter because
  // we we want to augment in a poll update context but do not
  // want to augment in a subscribe preview context.

  // NOTE: now that I think about it, the reason augmentEntries exists
  // is because fetch.js is doing two things instead of one thing. I should
  // never haved mixed together the augmentEntry code with the fetch code.
  // The caller can easily just pass the result of fetch to augmentEntries
  // using two function calls. Calling only fetch is the equivalent of
  // passing in augmentEntries:false.
  // As a result of the above change, it should cut this file size in half
  // and move all the augment code into its own file.
  // It would move the entryTimeout function out of here as well.
  // It would make the number of arguments small enough to go back to using
  // basic explicit arguments

  // A part of the above involves the 'url exists' check. I really don't
  // like how this queries the storage.  Id rather have the caller do
  // some kind of array.filter(async method) that passes in just those
  // distinct entries to fetch. Something like that at least

  var url = (params.url || '').trim();
  var oncomplete = params.oncomplete || lucu.noop;
  var onerror = params.onerror || lucu.noop;
  var timeout = params.timeout;
  var augmentEntries = params.augmentEntries;
  var entryTimeout = params.entryTimeout;

  // For some unexpected reason this function is sometimes
  // called when offline so we need to check for that here
  // and exit early. This avoids a bunch of net::ERR_NETWORK_IO_SUSPENDED
  // error messages produced by request.send.
  // request.send() does not appear to throw a catchable exception.

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
    onerror, augmentEntries, entryTimeout);
  request.open('GET', url, true);
  request.send();
};

lucu.feed.onFetch = function(onComplete, onError, shouldAugmentEntries,
  entryTimeout) {

  // Expects this instanceof XMLHttpRequest

  var mime = lucu.getMimeType(this) || '';

  if(lucu.isMimeFeed(mime)) {
    if(!this.responseXML || !this.responseXML.documentElement) {
      return onError({type: 'invalid-xml', target: this});
    }

    return lucu.feed.convertFromXML(this.responseXML, onComplete, onError,
      shouldAugmentEntries, entryTimeout);
  }

  lucu.isTextHTMLOrPlain = function(s) {
    return /text\/html|plain/i.test(s);
  };

  if(lucu.isTextHTMLOrPlain(mime)) {

    try {
      var xmlDocument = lucu.parseXML(this.responseText);
    } catch(e) {
      return onError(e);
    }

    if(!xmlDocument || !xmlDocument.documentElement) {
      return onError({type: 'invalid-xml', target: this});
    }

    return lucu.feed.convertFromXML(xmlDocument, onComplete, onError,
      shouldAugmentEntries, entryTimeout);
  }

  return onError({type: 'invalid-content-type', target: this});
};

lucu.feed.convertFromXML = function(xmlDocument, onComplete, onError,
  shouldAugmentEntries, entryTimeout) {

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

  fetchableEntries.forEach(lucu.entry.rewriteLink);


  // TODO: this is around the critical break in the data flow
  // where augmenting entries (and images and so forth) should
  // occur in a separate module

  if(!shouldAugmentEntries) {
    return onComplete(feed);
  }

  var augmentContext = {};
  augmentContext.numEntriesToProcess = numEntriesToProcess;
  augmentContext.feed = feed;
  augmentContext.entries = fetchableEntries;
  augmentContext.timeout = entryTimeout;
  augmentContext.onComplete = onComplete;

  var onOpenAugment = lucu.feed.onDatabaseOpenAugmentEntries.bind(augmentContext);
  lucu.database.open(onOpenAugment);
};

lucu.feed.onDatabaseOpenAugmentEntries = function(db) {
  this.entries.forEach(lucu.feed.augmentEntry, {
    db: db,
    dispatchIfComplete: lucu.feed.onFetchDispatchIfComplete.bind(this),
    timeout: this.timeout
  });
};

lucu.feed.onFetchDispatchIfComplete = function() {

  // TODO: deprecate this function. this code can be handled
  // by the called function by putting these values in its
  // context. Kind of like what I did with image loading below

  this.numEntriesToProcess -= 1;

  if(this.numEntriesToProcess) {
    return;
  }

  this.onComplete(this.feed);
};

lucu.feed.augmentEntry = function(entry) {

  // TODO: this lookup check should be per feed, not across all feeds,
  // otherwise if two feeds link to the same article, only the first gets
  // augmented. need to use something like findEntryByFeedIdAndLinkURL
  // that uses a composite index

  var onFind = lucu.feed.onAugmentFindByLink.bind(this, entry);
  lucu.entry.findByLink(this.db, entry.link, onFind);
};

/**
 * Callback after searching for whether an entry already exists in
 * storage with the same link. If it already exists then this exits
 * early. If it does not then it tries to fetch the page and
 * overwrite the entry.content property.
 */
lucu.feed.onAugmentFindByLink = function(entry, existingEntry) {

  // Expects this instanceof an object containing props
  // See onDatabaseOpenAugmentEntries second parameter to forEach
  // which gets passed to augmentEntry

  if(existingEntry) {
    this.dispatchIfComplete();
    return;
  }

  // TODO: think more about what happens if content is not successfully
  // retrieved.

  // TODO: move code that sets image dimension out of onFetchHTML
  // and into an explicitly specified continuation here

  var replace = lucu.feed.replaceEntryContent.bind(null,
    entry, this.dispatchIfComplete);

  var request = new XMLHttpRequest();
  request.timeout = this.timeout;
  request.ontimeout = this.dispatchIfComplete;
  request.onerror = this.dispatchIfComplete;
  request.onabort = this.dispatchIfComplete;
  request.onload = lucu.feed.onFetchHTML.bind(request, replace,
    this.dispatchIfComplete);
  request.open('GET', entry.link, true);
  request.responseType = 'document';
  request.send();
};

lucu.feed.replaceEntryContent = function(entry, onComplete, doc) {
  var html = doc.body.innerHTML;
  if(html) {
    entry.content = html;
  }

  onComplete();
};

lucu.feed.onFetchHTML = function(onComplete, onError, event) {

  // Expects this instanceof XMLHttpRequest

  var mime = lucu.getMimeType(this);

  // TODO: use overrideMimeType instead of this content type check?
  if(!lucu.isTextHTML(mime)) {
    return onError({type: 'invalid-content-type', target: this, contentType: mime});
  }

  // TODO: check for 404 and other status messages and handle those separately?
  // This was attached to onload. Does onload get called for other status?

  if(!this.responseXML || !this.responseXML.body) {
    return onError({type: 'invalid-document', target: this});
  }

  // TODO: consider embedding iframe content
  // TODO: consider sandboxing iframes

  // TODO: resolve element URLs
  // Leaving this here as a note. At some point we have to resolve the URLs
  // for href and src attributes. We already resolve a/img in other places
  // explicitly but we are not yet doing so for these other elements
  // var SELECTOR_RESOLVABLE = 'a,applet,audio,embed,iframe,img,object,video';

  // NOTES: above is incomplete.  See http://medialize.github.io/URI.js/docs.html
  // blockquote.cite, track.src, link.href, base.href, source.src, area.href,
  // form.action, script.src

  // TODO: store redirects properly
  // NOTE: this uses the post-redirect url as the base url for anchors

  var baseURI = lucu.uri.parse(this.responseURL);
  var anchors = this.responseXML.body.querySelectorAll('a');
  var resolveAnchor = lucu.feed.resolveAnchor.bind(this, baseURI);
  lucu.forEach(anchors, resolveAnchor);

  // TODO: should we notify the callback of responseURL (is it
  // the url after redirects or is it the same url passed in?). i think
  // the onload callback should also receive responseURL. maybe onerror
  // should also receive responseURL if it is defined. that way the caller
  // can choose to also replace the original url

  // TODO: one of the problems with fetching images before scrubbing is that
  // tracker gifs are pinged by the image loader. think of how to avoid stupid
  // requests like that
  // TODO: the caller should be responsible for choosing this followup
  // process. This should not be controlling the flow here
  // TODO: move image prefetching out of here to some type of caller, this should
  // only fetch

  // NOTE: this uses the post-redirect responseURL as the base url
  lucu.feed.augmentImages(this.responseXML, this.responseURL, onComplete);
};

/**
 * Set dimensions for image elements that are missing dimensions.
 *
 * TODO: maybe most of this code can be moved into onFetchHTML
 * above
 * TODO: srcset, picture (image families)
 *
 * @param doc {HTMLDocument} an HTMLDocument object to inspect
 * @param baseURL {string} for resolving image urls
 * @param oncomplete {function}
 */
lucu.feed.augmentImages = function(doc, baseURL, onComplete) {

  var images = doc.body.getElementsByTagName('img');

  var resolve = lucu.feed.resolveImage.bind(null, baseURL);
  var resolvedImages = Array.prototype.map.call(images, resolve);
  var loadableImages = resolvedImages.filter(lucu.feed.shouldUpdateImage);

  if(!loadableImages.length) {
    return onComplete(doc);
  }

  var updateContext = {
    numImagesToLoad: loadableImages.length,
    onComplete: onComplete,
    doc: doc
  };

  loadableImages.forEach(lucu.feed.updateImageElement, updateContext);
};

lucu.feed.updateImageElement = function(remoteImage) {

  // Expects this to be instanceof a special context object set
  // in lucu.feed.augmentImages

  // Nothing happens when changing the src property of an HTMLImageElement
  // that is located in a foreign Document context. Therefore we have to
  // create an image element within the local document context for each
  // image in the remote context (technically we could reuse one local
  // element). Rather than creating new ones, we can just import the
  // remote, which does a shallow element clone from remote to local.

  // TODO: does this next line cause an immediate fetch? If it does
  // then it kind of defeats the point of changing the source later on,
  // right? Should we instead be creating an image element and
  // just setting its source?
  var localImage = document.importNode(remoteImage, false);

  // If a problem occurs just go straight to onComplete and do not load
  // the image or augment it.
  // TODO: wait, this is wrong. this should be doing what onload is doing
  // regarding decrementing images. Right now this causes an early exit if
  // any image in the list, before the last one, fails to load
  localImage.onerror = this.onComplete.bind(null, this.doc);

  // TODO: move this nested function out of here
  var self = this;
  localImage.onload = function() {

    // Modify the remote image properties according to
    // the local image properties
    remoteImage.width = this.width;
    remoteImage.height = this.height;

    // console.debug('W %s H %s', remoteImage.width, remoteImage.height);

    self.numImagesToLoad--;
    if(self.numImagesToLoad) {
      return;
    }

    self.onComplete(self.doc);
  };

  // Setting the src property is what triggers the fetch. Unfortunately
  // the 'set' operation is ignored unless the new value is different
  // than the old value.
  var src = localImage.src;
  localImage.src = void src;
  localImage.src = src;
};

lucu.feed.shouldUpdateImage = function(imageElement) {

  // Filter out data-uri images, images without src urls, and images
  // with dimensions

  if(imageElement.width) {
    return false;
  }

  var source = (imageElement.getAttribute('src') || '').trim();

  if(!source) {
    return false;
  }

  // I assume dimensions for data uris are set when the data uri is
  // parsed, because it essentially represents an already loaded
  // image. However, we want to make sure we do not try to fetch
  // such images
  if(/^\s*data:/i.test(source)) {

    console.debug('dimensionless data uri image: %o', imageElement);
    // NOTE: above sometimes appears for data uris. i notice it is appearing when
    // width/height attribute not expressly set in html. maybe we just need to
    // read in the width/height property and set the attributes?
    // but wait, we never even reach reach is width is set. so width isnt
    // set for a data uri somehow. how in the hell does that happen?
    // is it because the element remains inert (according to how parseHTML works)?

    // Is it even possible to send a GET request to a data uri? Does that
    // even make sense?

    // NOTE: i wonder if data-uri images have naturalWidth set but not
    // width? We could set the dimensions for this case?

    return false;
  }

  // We have a fetchable image with unknown dimensions
  // that we can augment
  return true;
};

/**
 * Mutates an image element in place by changing its src property
 * to be an absolute url, and then returns the image element.
 * Returns the element as is if already absolute or missing a url
 * or the base URL is unknown.
 */
lucu.feed.resolveImage = function(baseURL, imageElement) {

  if(!baseURL) {
    return imageElement;
  }

  var sourceURL = imageElement.getAttribute('src');
  if(!sourceURL) {
    return imageElement;
  }

  sourceURL = sourceURL.trim();
  if(!sourceURL) {
    return imageElement;
  }

  try {
    var abs = URI(sourceURL).absoluteTo(baseURL).toString();
    //console.debug('Resolved %s as %s', sourceURL, abs);
    imageElement.setAttribute('src', abs);
  } catch(e) {
    console.debug('Problem resolving %s with base %s', sourceURL, baseURL);
    console.warn(e);
  }

  return imageElement;
};

lucu.feed.resolveAnchor = function(baseURI, anchorElement) {

  // TODO: kind of a dry violation with resolveImage. I should have a
  // generic element resolver that works for all elements with url
  // attributes

  if(!baseURI) {
    return;
  }

  var sourceURL = anchorElement.getAttribute('href');
  if(!sourceURL) {
    return;
  }

  sourceURL = sourceURL.trim();
  if(!sourceURL) {
    return;
  }

  var sourceURI = lucu.uri.parse(sourceURL);

  // Avoid resolution when the url appears absolute
  // TODO: this condition should be a part of lucu.uri.resolve and
  // should not be this function's responsibility.
  if(sourceURI.scheme) {
    return;
  }

  var resolvedURL = lucu.uri.resolve(baseURI, sourceURI);

  // Is this really necessary?
  if(resolvedURL == sourceURL) {
    return;
  }

  // console.debug('Changing anchor url from %s to %s', sourceURL, resolvedURL);

  anchorElement.setAttribute('href', resolvedURL);
};
