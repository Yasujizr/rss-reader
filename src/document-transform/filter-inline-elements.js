// Copyright 2015 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

{ // BEGIN ANONYMOUS NAMESPACE

// Unwraps various inline elements in a document. Given that style information
// and other information is removed, several elements in the document may
// no longer serve a formatting purpose, so we want to remove them but
// keep the child elements. Because the topology serves as a feature in
// boilerplate extraction, this should only be done after analyzing the content
// for boilerplate.
function filterInlineElements(document) {
	transformAnchors(document);
	unwrapInlines(document);
}

this.filterInlineElements = filterInlineElements;

// NOTE: This does not contain ALL inline elements, just those we
// want to unwrap. This is different than the set of inline
// elements defined for the purpose of trimming text nodes.
// TODO: some of these would maybe be better handled in other more
// specialized handlers
// noscript and noembed are handled by other transforms
const UNWRAPPABLE_ELEMENTS = [
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
];

const UNWRAPPABLE_SELECTOR = UNWRAPPABLE_ELEMENTS.join(',');

function unwrapInlines(document) {
	const elements = document.querySelectorAll(UNWRAPPABLE_SELECTOR);
	const numElements = elements.length;
	for(let i = 0; i < numElements; i++) {
		DOMUtils.unwrap(elements[i]);
	}
}

// Special handling for anchors
// NOTE: this intentionally breaks in-page anchors
// (e.g. name="x" and href="#x")
// TODO: what we could do maybe is not unwrap if has name attribute, and
// then leave in the anchor
function transformAnchors(document) {
	const anchors = document.querySelectorAll('a');
	const numAnchors = anchors.length;
	let anchor = null;
	let href = null;
	for(let i = 0; i < numAnchors; i++) {
		anchor = anchors[i];
		if(anchor.hasAttribute('href')) {
			href = anchor.getAttribute('href');
			href = href || '';
			href = href.trim();
			if(!href) {
				// The anchor had an href, but without a value, so treat it
				// as nominal, and therefore unwrap
				DOMUtils.unwrap(anchor);
			} else {
				if(href.startsWith('#')) {
					// It is an in-page anchor that will no longer work, if,
					// for example, we unwrapped its counterpart
					// Side note: this is actually dumb, because resolve-document-urls
					// makes all anchors absolute, so this condition is never triggered
					// so the test actually needs to be checking against the document's
					// own url, which isn't available to this function at the moment
					DOMUtils.unwrap(anchor);
				}
			}
		} else {
			// It is a nominal anchor, unwrap
			DOMUtils.unwrap(anchor);
		}
	}
}

} // END ANONYMOUS NAMESPACE
