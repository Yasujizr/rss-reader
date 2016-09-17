// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

{ // Begin file block scope

const lazyAttrs = [
  'load-src',
  'data-src',
  'data-original-desktop',
  'data-baseurl',
  'data-lazy',
  'data-img-src',
  'data-original',
  'data-adaptive-img',
  'data-imgsrc',
  'data-default-src'
];

function transformLazyImages(doc) {
  const images = doc.querySelectorAll('img');
  for(let img of images) {
    transformLazyImage(img);
  }
}

function transformLazyImage(img) {
  if(img.hasAttribute('src') || img.hasAttribute('srcset')) {
    return;
  }

  for(let altName of lazyAttrs) {
    if(img.hasAttribute(altName)) {
      const altValue = img.getAttribute(altName);
      if(altValue && isValidURL(altValue)) {
        img.removeAttribute(altName);
        img.setAttribute('src', altValue);
        return;
      }
    }
  }
}

// Only minimal validation against possibly relative urls
function isValidURL(inputString) {
  return !inputString.trim().includes(' ');
}

var rdr = rdr || {};
rdr.transformLazyImages = transformLazyImages;

} // End file block scope
