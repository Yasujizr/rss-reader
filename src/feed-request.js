// Copyright 2015 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

class FeedRequest {

  // TODO: somehow use responseURL? 
  // TODO: intelligently react to redirects
  static fetch(url, timeout, callback) {
    const request = new XMLHttpRequest();
    request.timeout = timeout;
    request.onerror = callback;
    request.ontimeout = callback;
    request.onabort = callback;
    request.onload = FeedRequest._onload.bind(request, url, callback);
    request.open('GET', url, true);
    request.overrideMimeType('application/xml');
    request.send();
  }

  static _onload(url, callback, event) {
    let document = event.target.responseXML;

    if(!document) {
      document = FeedRequest._retryMalformedResponse(event.target);
    }

    if(!document || !document.documentElement) {
      callback(event);
      return;
    }

    try {
      const feed = FeedRequest.deserialize(document);
      feed.url = url;
      feed.fetched = Date.now();
      
      // TODO: maybe this post-processing is outside the scope
      // of requesting a feed? Maybe these should be the caller's
      // responsibility? Also, it seems like overly tight
      // coupling.

      feed.entries = feed.entries.filter(function(entry) {
        return entry.link;
      });
      
      feed.entries.forEach(function(entry) {
        entry.link = URLUtils.rewrite(entry.link);
      });

      // TODO: this should be unique by entry link, not just a general
      // unique entry object
      feed.entries = ArrayUtils.unique(feed.entries);

      callback(null, feed);
    } catch(exception) {
      // TODO: the type of error passed back as first argument 
      // should be consistent. Mimic an event object here instead
      // of an exception
      callback(exception);
    } 
  }

  // responseXML is null when there was an xml parse error
  // such as invalid UTF-8 characters. For example:
  // error on line 1010 at column 25: Input is not proper UTF-8, 
  // indicate encoding ! Bytes: 0x07 0x50 0x72 0x65
  // So, access the raw text and try and re-encode and re-parse it

  static _retryMalformedResponse(response) {

  	try {
  	  const encoded = utf8.encode(response.responseText);
  	  const parser = new DOMParser();
  	  const document = parser.parseFromString(encoded, 'application/xml');
 
  	  // XML parsing exceptions are not thrown, they are embedded 
  	  // as nodes within the result. Behavior varies by browser.
  	  const error = document.querySelector('parsererror');
  	  if(error) {
  	  	error.remove();
  	  }

  	  return document;
  	} catch(exception) {

  	}

  	return null;
  }

  // TODO: support Apple iTunes format, embedded media format (??)
  // TODO: store original format as a property
  // TODO: querySelector is not depth-sensitive. Maybe increase 
  // the strictness to searching immediate node children
  static deserialize(document) {

    const getText = FeedRequest._getElementText;

    const root = document.documentElement;
    if(!root) {
      throw new TypeError('Undefined document element');
    }

    if(!root.matches('feed, rss, rdf')) {
      throw new TypeError('Unsupported document element: ' + root.localName);
    }

    const isAtom = root.matches('feed');
    const isRDF = root.matches('rdf');

    if(!isAtom && !root.querySelector('channel')) {
      throw new TypeError('Missing required channel element');
    }

    const channel = isAtom ? root : root.querySelector('channel');

    const feed = {};
    const title = getText(channel, 'title');
    if(title) {
      feed.title = title;
    }

    const description = getText(channel, isAtom ? 'subtitle' : 'description');
    if(description) {
      feed.description = description;
    }

    const dateUpdated = isAtom ? getText(channel, 'updated') : 
      (getText(channel, 'pubdate') || getText(channel, 'lastBuildDate') ||
      getText(channel, 'date'));
    if(dateUpdated) {
      feed.date = dateUpdated;
    }

    let link = '';
    if(isAtom) {
      link = channel.querySelector('link[rel="alternate"]') || 
        channel.querySelector('link[rel="self"]') ||
        channel.querySelector('link[href]');
      if(link) {
        link = link.getAttribute('href');
      }
    } else {
      link = getText(channel, 'link:not([href])');
      if(!link) {
        link = channel.querySelector('link');
        if(link) {
          link = link.getAttribute('href');
        }
      }
    }
    if(link) {
      link = link.trim();
    }
    if(link) {
      feed.link = link;
    }

    let entries = [];
    if(isAtom) {
      entries = root.querySelectorAll('entry');
    } else if(isRDF) {
      entries = root.querySelectorAll('item');
    } else {
      entries = channel.querySelectorAll('item');
    }

    const map = Array.prototype.map;

    feed.entries = map.call(entries, function(entry) {
      const result = {};
      const title = getText(entry, 'title');
      if(title) {
        result.title = title;
      }

      const author = isAtom ? getText(entry, 'author name') : 
        (getText(entry, 'creator') || getText(entry, 'publisher'));
      if(author) {
        result.author = StringUtils.removeTags(author, ' ');
      }

      let link = '';
      if(isAtom) {
        link = entry.querySelector('link[rel="alternate"]') || 
          entry.querySelector('link[rel="self"]') ||
          entry.querySelector('link[href]');
        if(link) {
          link = link.getAttribute('href');
        }
      } else {
        link = getText(entry, 'origLink') || getText(entry, 'link');
      }
      if(link) {
        link = link.trim();
      }
      if(link) {
        result.link = link;
      }

      let date = '';
      if(isAtom) {
        date = entry.querySelector('published') || entry.querySelector('updated');
        if(date) {
          date = date.textContent;
        }
      } else {
        date = getText(entry, 'pubDate') || getText(entry, 'date');
      }
      if(date) {
        date = date.trim();
      }
      if(date) {
        result.pubdate = date;
      }

      if(isAtom) {
        // Special handling for some strange issue
        const content = entry.querySelector('content');
        const nodes = content ? content.childNodes : [];
        result.content = map.call(nodes, function(node) {
          return node.nodeType === Node.ELEMENT_NODE ?
            node.innerHTML : node.textContent;
        }).join('').trim();
      } else {
        const content = getText(entry, 'encoded') || 
          getText(entry, 'description') || getText(entry, 'summary');
        if(content) {
          result.content = content;
        }
      }

      return result;
    });

    return feed;
  }

  static _getElementText(parent, selector) {
    const element = parent.querySelector(selector);
    if(element) {
      const text = element.textContent;
      if(text) {
        return text.trim();
      }
    }
  }
}
