// Feed update lib
(function(exports) {
'use strict';

// Starts updating a single feed
function updateFeed(db, feed, callback, timeout) {
  var entriesProcessed = 0, entriesAdded = 0;

  var fetchErrorHandler = function(err) {
    var url = err.url;
    if(err.type == 'unknown') {
      feed.error = 'The request to "'+url+'" encountered an unknown error.';
    } else if(err.type == 'abort') {
      feed.error = 'The request to "' + url + '" was aborted.';
    } else if(err.type == 'timeout') {
      feed.error = 'The request to "' + url + '" took longer than '+err.timeout+'ms to complete.';
    } else if(err.type == 'status') {
      feed.error = 'The request to "'+ url+'" returned an invalid response (' +
        err.status + ' ' + err.statusText + ').';
    } else if(err.type == 'contentType') {
      feed.error = 'The request to "'+ url+'" did not return a valid content type ('+err.contentType+').';
    } else if(err.type == 'undefinedResponseXML') {
      feed.error = 'The request to "'+url+'" did not return an XML document.';
    } else if(err.type == 'undefinedDocumentElement') {
      feed.error = 'The request to "'+ url+'" did not return a valid XML document.';
    }

    callback(feed, 0, 0);
  };

  fetchFeed(feed.url, function(responseXML) {

    var fetchedFeed;
    try {
      fetchedFeed = xml2json(responseXML);
    } catch(exception) {
      feed.error = exception.message;
      callback(feed, 0, 0);
      return;
    }

    if(fetchedFeed.title) feed.title = fetchedFeed.title;
    if(fetchedFeed.link) feed.link = fetchedFeed.link;

    // Store description too
    if(fetchedFeed.description) feed.description = fetchedFeed.description;

    if(fetchedFeed.date) {
      var feedDate = parseDate(fetchedFeed.date);
      if(feedDate) {
        feed.date = feedDate.getTime();
      }
    }

    var entryCount = fetchedFeed.entries.length;

    model.insertOrUpdateFeed(db, feed, function(feed) {
      var entryUpdated = function() {
        if(++entriesProcessed >= entryCount) {
          callback(feed, entriesProcessed, entriesAdded);
        }
      };

      var onEntryUpdateSuccess = function() {
        entriesAdded++;
        entryUpdated();
      };

      var onEntryUpdateError = function() {
        entryUpdated();
      };
      
      var store = db.transaction('entry','readwrite').objectStore('entry');
      each(fetchedFeed.entries, function(entry) {
        entry.feedId = feed.id;
        if(feed.link) entry.feedLink = feed.link;
        if(feed.title) entry.feedTitle = feed.title;
        if(feed.feedDate) entry.feedDate = feed.date;
        updateEntry(store, entry, onEntryUpdateSuccess, onEntryUpdateError);
      });
    });
  }, fetchErrorHandler, timeout);
}

// Prep and attempt to store an entry
function updateEntry(store, entry, onSuccess, onError) {
  var hash = model.generateEntryHash(entry);

  if(!hash) {
    console.log('Could not generate hash for entry %s', entry);
    onError();
    return;
  }

  model.containsEntryHash(store, hash, function(hashedEntry) {
    if(hashedEntry) {
      // console.log('entries already contains %s', hash);
      onError();
      return;
    }

    var newEntry = {};
    newEntry.hash = hash;
    newEntry.feed = entry.feedId;

    newEntry.unread = model.UNREAD;

    if(entry.feedLink) newEntry.baseURI = entry.feedLink;
    if(entry.feedTitle) newEntry.feedTitle = entry.feedTitle;
    if(entry.author) newEntry.author = entry.author;
    if(entry.link) newEntry.link = entry.link;
    if(entry.title) newEntry.title = entry.title;

    var pubdate = parseDate(entry.pubdate);
    if(pubdate) {
      newEntry.pubdate = pubdate.getTime();
    } else if(entry.feedDate) {
      newEntry.pubdate = entry.feedDate;
    }

    if(entry.content) {
        var doc = parseHTML(entry.content);
        var sanitizedDOM = sanitize(entry.feedLink, doc);
        if(sanitizedDOM) {
          
          // Do we apply content filtering before or after sanitize?
          // Here would be after


          // Trim the document
          trimDocument(sanitizedDOM);

          // Set the content property after sanitization, trimming
          newEntry.content = sanitizedDOM.body.innerHTML;

        } else {
          console.log('unclear what to do without sanitzed dom');
        }
    }

    model.addEntry(store, newEntry, onSuccess, onError);
  });
}

function unsubscribe(feedId, callback) {
  model.connect(function(db) {
    model.unsubscribe(db, feedId, function() {     
      // Update badge
      updateBadge();
      
      // Broadcast event
      chrome.runtime.sendMessage({'type':'unsubscribe', 'feed': feedId});
      
      // NOTE: why call a callback here if I am sending a message?
      // Can't the views just handle the message event? Or does the message
      // only get sent to the first view that handles it?
      if(callback) {
        callback(feedId);
      }
    });
  });
}

exports.updateFeed = updateFeed;
exports.unsubscribe = unsubscribe;

})(this);