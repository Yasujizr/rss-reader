// Copyright 2015 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

function isValidURL(url) {
  try {
    let uri = URI(url);
    return uri && uri.protocol() && uri.hostname();
  } catch(e) {
  }
  return false;
}

function getSchemelessURL(url) {
  const uri = new URI(url);
  uri.protocol('');
  return uri.toString().substring(2);
}

function isDataURI(url) {
  return /^\s*data\s*:/i.test(url);
}

function rewriteURL(url) {
  const RE_GOOGLE_NEWS = /^https?:\/\/news.google.com\/news\/url\?.*url=(.*)/i;
  const matches = RE_GOOGLE_NEWS.exec(url);
  if(matches && matches.length === 2 && matches[1]) {
    return decodeURIComponent(matches[1]);
  }
  return url;
}

/**
 * TODO: support img srcset
 * TODO: support style.backgroundImage?
 * TODO: the new template tag?
 * NOTE: not supporting applet
 * NOTE: iframe.srcdoc?
 * NOTE: ignores param values with URIs
 * NOTE: could stripping the base tag could lead to invalid urls??? Should
 * the base tag, if present, be considered when resolving elements?
 * Also note that there could be multiple base tags, the logic for handling
 * it properly is all laid out in some RFC standard somewhere, and is probably
 * present in Webkit source.
 */
function resolveURLs(document, baseURL) {
  const forEach = Array.prototype.forEach;
  const RESOLVABLE_ATTRIBUTES = new Map([
    ['a', 'href'],
    ['area', 'href'],
    ['audio', 'src'],
    ['blockquote', 'cite'],
    ['embed', 'src'],
    ['iframe', 'src'],
    ['form', 'action'],
    ['img', 'src'],
    ['link', 'href'],
    ['object', 'data'],
    ['script', 'src'],
    ['source', 'src'],
    ['track', 'src'],
    ['video', 'src']
  ]);

  const bases = document.getElementsByTagName('base');
  forEach.call(bases, function(element) {
    element.remove();
  });

  // TODO: build this from the map
  const RESOLVABLES_QUERY = 'a, area, audio, blockquote, embed, ' + 
    'iframe, form, img, link, object, script, source, track, video';
  const elements = document.querySelectorAll(RESOLVABLES_QUERY);
  forEach.call(elements, function(element) {
    const name = element.localName;
    const attribute = RESOLVABLE_ATTRIBUTES.get(name);
    const url = (element.getAttribute(attribute) || '').trim();
    try {
      const uri = new URI(url);
      if(!uri.protocol()) {
        const resolved = uri.absoluteTo(baseURL).toString();
        element.setAttribute(attribute, resolved);
      }
    } catch(e) {

    }
  });
}

function getFavIconURL(url) {
  if(url) {
    return 'http://www.google.com/s2/favicons?domain_url=' + 
      encodeURIComponent(url);
  } else {
    return '/media/rss_icon_trans.gif';
  }
}
