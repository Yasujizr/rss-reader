// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

// Create a storable object from the input feeds by combining together the
// properties of current and new feed into a basic object, and then
// sanitizing the properties of the storable feed, and then storing the
// storable feed, and then calling the callback.
// TODO: ensure the date is not beyond the current date?
// TODO: maybe do not modify date updated if no values changed
// TODO: think more about XSS and where I should be sanitizing these inputs,
// should it be the responsibility of render, or here before storage. There is
// an ambiguity then regarding the input formatting, I don't want to mistakenly
// re-encode encoded html entities and so forth. Maybe just using textContent
// instead of innerHTML in the render will ensure no problem.
function putFeed(connection, currentFeed, newFeed, callback) {

  // Provide minimal assertions as to behavior
  // TODO: since I added these, I think the callers might assuming the params
  // are always defined, i will get NPEs, so I need to have all the call sites
  // not assume this

  if(!newFeed) {
    callback(null, {
      'type': 'undefinednewfeed'
    });
    return;
  }

  if(!newFeed.url) {
    callback(null, {
      'type': 'undefinednewfeedurl'
    });
    return;
  }

  // Generate a serializable object for storage and to pass to the callback
  const storable = Object.create(null);

  // Only set the id if we are doing an update. If we are doing an add, the
  // id is automatically defined by indexedDB's autoincrement feature
  // Assume that if id is defined that it is valid.
  // Assume that if currentFeed is defined that id is defined.
  if(currentFeed) {
    storable.id = currentFeed.id;
  }

  if(Object.prototype.toString.call(newFeed.url) === '[object URL]') {
    storable.url = newFeed.url.href;
  } else {
    storable.url = newFeed.url;
  }

  // Setup storable.urls, which contains an array of all the urls that point
  // to a feed.
  if(newFeed.urls && newFeed.urls.length) {
    if(currentFeed && currentFeed.urls) {

      storable.urls = [];
      // Copy over the old urls
      // TODO: Use a builtin like slice or concat or push.apply
      for(let i = 0, len = currentFeed.urls.length; i < len; i++) {
        storable.urls.push(currentFeed.urls[i]);
      }

      // Copy over the new urls when they are distinct
      for(let i = 0, len = newFeed.urls; i < len; i++) {
        if(currentFeed.urls.indexOf(newFeed.urls[i]) === -1) {
          storable.urls.push(newFeed.urls[i]);
        }
      }
    } else {
      storable.urls = newFeed.urls;
    }
  } else if(currentFeed && currentFeed.urls && currentFeed.urls.length) {
    // Retain the current urls even when there are no new ones
    storable.urls = currentFeed.urls;
  }

  // Store the fetched feed type (e.g. rss or rdf) as a string
  // Assume that if type is defined that it is valid
  if('type' in newFeed) {
    storable.type = newFeed.type;
  }

  // The 'schemeless' property is deprecated
  // Derive and store the schemeless url of the feed, which is used to
  // check for dups
  //if(currentFeed) {
  //  storable.schemeless = currentFeed.schemeless;
  //} else {
    // TODO: I think filterProtocol can throw. I need to think about how
    // to deal with this expressly.
  //  storable.schemeless = utils.url.filterProtocol(storable.url);
  //}

  // NOTE: title is semi-required. It must be defined, although it can be
  // an empty string. It must be defined because of how views query and
  // iterate over the feeds in the store using title as an index. If it were
  // ever undefined those feeds would not appear in the title index.
  // TODO: remove this requirement somehow? Maybe the options page that
  // retrieves feeds has to manually sort them?
  const title = sanitizeBeforePut(newFeed.title);
  storable.title = title || '';

  const description = sanitizeBeforePut(newFeed.description);
  if(description) {
    storable.description = description;
  }

  if(newFeed.link) {
    if (Object.prototype.toString.call(newFeed.link) === '[object URL]') {
      storable.link = newFeed.link.href;
    } else {
      storable.link = sanitizeBeforePut(newFeed.link);
    }
  } else if(currentFeed.link) {
    if (Object.prototype.toString.call(currentFeed.link) === '[object URL]') {
      storable.link = currentFeed.link.href;
    } else {
      storable.link = currentFeed.link;
    }
  }

  //const link = sanitizeBeforePut(newFeed.link);
  //if(link) {
  //  storable.link = link;
  //}

  // Even though date should always be set, this can work in the absence of
  // a value
  // TODO: qualify this date better. What is it? And what type is it?
  // Look at the RSS specs again and define this clearly.
  if(newFeed.date) {
    storable.date = newFeed.date;
  }

  // The date the feed was last fetched
  if(newFeed.dateFetched && Object.prototype.toString.call(
    newFeed.dateFetched) === '[object Date]') {
    storable.dateFetched = newFeed.dateFetched;
  }

  // The date the feed's remote file was last modified
  if(newFeed.dateLastModified &&
    Object.prototype.toString.call(newFeed.dateLastModified) ===
    '[object Date]') {
    storable.dateLastModified = newFeed.dateLastModified;
  }

  // Set date created and date updated. We only modify date updated if we
  // are updating an existing feed. We don't set date updated for a new feed
  // because it has never been updated (note I am not sure if I like this).
  // TODO: use better names, like dateCreated, dateUpdated or dateModified
  // TODO: use Date objects instead of timestamps
  if(currentFeed) {
    storable.updated = Date.now();
    storable.created = currentFeed.created;
  } else {
    storable.created = Date.now();
  }

  const transaction = connection.transaction('feed', 'readwrite');
  const store = transaction.objectStore('feed');
  let request = null;

  // Some testing showed that certain indexedDB errors are thrown as a result
  // of calling store.put instead of creating events catch by request.onerror,
  // so I have to use a try catch here.

  try {
    request = store.put(storable);
  } catch(exception) {
    if(callback) {
      const exceptionEvent = Object.create(null);
      exceptionEvent.type = 'exception';
      exceptionEvent.message = exception.message;
      callback(storable, exceptionEvent);
    }
    return;
  }

  if(callback) {
    request.onsuccess = onPutSuccess;
    request.onerror = onPutError;
  }

  function onPutSuccess(event) {
    if(!('id' in storable)) {
      storable.id = event.target.result;
    }
    callback(storable, event);
  }

  function onPutError(event) {
    callback(storable, event);
  }

  // Prep a string property of an object for storage
  function sanitizeBeforePut(inputString) {
    let outputString = inputString;
    if(inputString) {
      outputString = utils.string.filterControlCharacters(outputString);
      outputString = HTMLUtils.replaceTags(outputString, '');
      // Condense whitespace
      // TODO: maybe this should be a utils function
      outputString = outputString.replace(/\s+/, ' ');
      outputString = outputString.trim();
    }
    return outputString;
  }
}
