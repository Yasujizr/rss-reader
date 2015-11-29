// Copyright 2015 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

{ // BEGIN ANONYMOUS NAMESPACE

// Asynchronously attempts to set the width and height for
// all image elements. Calls callback when complete
this.fetchImageDimensions = function _fetchImageDimensions(document, callback) {
	const images = document.getElementsByTagName('img');
	async.forEach(images, _fetch, callback);
};

// Sets an image's dimensions and then calls the callback
// (without arguments).
function _fetch(image, callback) {

	// We use the attribute, not the property, to avoid any
	// changes by the user agent to the value
	let sourceURL = image.getAttribute('src') || '';
	sourceURL = sourceURL.trim();

	// Can't do anything about a sourceless image
	if(!sourceURL) {
		callback();
		return;
	}

	// Can't do anything about an embedded image aside
	// from relying on its attributes or properties
	// TODO: or can we? Does it matter if it an inert
	// document (e.g. created by XMLHttpRequest?)
	// TODO: isDataURI is only ever called from here, maybe
	// the function belongs here?
	// Are the width and height properties automatically set
	// for a data URI within an inert document context? If so,
	// then we do not need to fetch.
	if(/^\s*data\s*:/i.test(sourceURL)) {
		callback();
		return;
	}

	// If the image already has dimensions, do not re-fetch
	if(image.width > 0) {
		callback();
		return;
	}

	// To get the image's dimensions, we recreate the image
	// locally and ask the browser to fetch it, and then
	// transfer the retrieved properties to the image. This
	// avoids the issue that setting the src property on the
	// image has no effect if the image comes from an
	// inert document
	const proxy = document.createElement('img');
	proxy.onload = onProxyLoad.bind(proxy, callback, image);
	proxy.onerror = onProxyError.bind(proxy, callback);
	proxy.src = sourceURL;
};

function onProxyLoad(callback, image, event) {
	const proxy = event.target;
	image.width = proxy.width;
	image.height = proxy.height;
	callback();
}

function onProxyError(callback, event) {
	callback();
}

} // END ANONYMOUS NAMESPACE
