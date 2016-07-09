// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

// TODO: think of what do about the common 'http://#fragment' url value
// found on various sites
// TODO: think about what to do about the common '#' url. Usually these are
// just links back to the top, or have an onclick handler. maybe these should
// be treated specially by a separate transform.

const URL_ATTRIBUTE_MAP = {
  'A': 'href',
  'APPLET': 'codebase',
  'AREA': 'href',
  'AUDIO': 'src',
  'BASE': 'href',
  'BLOCKQUOTE': 'cite',
  'BODY': 'background',
  'BUTTON': 'formaction',
  'DEL': 'cite',
  'EMBED': 'src',
  'FRAME': 'src',
  'HEAD': 'profile',
  'HTML': 'manifest',
  'IFRAME': 'src',
  'FORM': 'action',
  'IMG': 'src',
  'INPUT': 'src',
  'INS': 'cite',
  'LINK': 'href',
  'OBJECT': 'data',
  'Q': 'cite',
  'SCRIPT': 'src',
  'SOURCE': 'src',
  'TRACK': 'src',
  'VIDEO': 'src'
};

// Resolves all urls in a document, such as element attribute values
// TODO: resolve xlink type simple (on any attribute) in xml docs
function resolveDocumentURLs(document, baseURL) {
  filterBaseElements(document);
  resolveElementsWithURLAttributes(document, baseURL);
  resolveElementsWithSrcsetAttributes(document, baseURL);
}

function selectElementsWithURLAttributes(document) {
  const SELECTOR = Object.keys(URL_ATTRIBUTE_MAP).map(function(key) {
    return key + '[' + URL_ATTRIBUTE_MAP[key] +']';
  }).join(', ');
  return document.querySelectorAll(SELECTOR);
}

function resolveElementsWithURLAttributes(document, baseURL) {
  const elements = selectElementsWithURLAttributes(document);
  for(let i = 0, len = elements.length; i < len; i++) {
    const element = elements[i];
    const elementName = element.nodeName.toUpperCase();

    const attributeName = URL_ATTRIBUTE_MAP[elementName];
    if(!attributeName) {
      continue;
    }

    const attributeValue = element.getAttribute(attributeName);
    if(!attributeValue) {
      continue;
    }

    // todo: this probably belongs in a separate filter pass
    if(/^\s*https?:\/\/#/i.test(attributeValue)) {
      console.debug("removing invalid anchor url:", element.outerHTML);
      element.remove();
      continue;
    }

    if(/^\s*#/.test(attributeValue)) {
      console.debug('Resolving fragment', attributeValue);
    }

    const resolvedURL = resolveURL(attributeValue, baseURL);
    if(!resolvedURL) {
      continue;
    }

    if(resolvedURL.href !== attributeValue) {
      element.setAttribute(attributeName, resolvedURL.href);
    }
  }
}

function resolveElementsWithSrcsetAttributes(document, baseURL) {
  const elements = document.querySelectorAll(
    'img[srcset], source[srcset]');
  for(let i = 0, len = elements.length; i < len; i++) {
    const element = elements[i];
    const attributeValue = element.getAttribute('srcset');

    if(!attributeValue) {
      continue;
    }

    const srcset = parseSrcset(attributeValue);
    if(!srcset || !srcset.length) {
      continue;
    }

    let dirtied = false;
    for(let j = 0, slen = srcset.length; j < slen; j++) {
      const descriptor = srcset[j];
      const resolvedURL = resolveURL(descriptor.url, baseURL);
      if(resolvedURL && resolvedURL.href !== descriptor.url) {
        dirtied = true;
        descriptor.url = resolvedURL.href;
      }
    }

    if(!dirtied) {
      continue;
    }

    const newSrcsetValue = serializeSrcset(srcset);
    if(newSrcsetValue && newSrcsetValue !== attributeValue) {
      element.setAttribute('srcset', newSrcsetValue);
    }
  }
}

function filterBaseElements(document) {
  const bases = document.querySelectorAll('base');
  for(let i = 0, len = bases.length; i < len; i++) {
    bases[i].remove();
  }
}
