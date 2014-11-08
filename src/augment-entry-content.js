// Copyright 2014 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

var lucu = lucu || {};

/**
 * Replaces the content of each entry with the html of its link.
 * If there is failure to fetch the html the content is left as is.
 * Each entry's link value may be rewritten: either by the rewrite
 * function or (possibly in the future) be set to the post-redirect-url
 *
 * NOTE: entries is 'pass-by-ref' so there is no need to pass it back
 * to onComplete since it is available and updated within the caller
 * context. That is, unless, I were to decide to return a new array
 * instead of the original? More like a async-map function?
 *
 * TODO: dont forget this is new file that must be included if used
 *
 * TODO: if pdf content type then maybe we embed iframe with src
 * to PDF? also, we should not even be trying to fetch pdfs? is this
 * just a feature of fetchHTML or does it belong here?
 */
lucu.augmentEntryContent = function(entries, timeout, onComplete) {
  'use strict';

  // Exit early and ensure continuation if no entries
  if(!entries.length) {
    return onComplete();
  }

  // TODO: should the caller be responsible for filtering entries without
  // links? Is link the entry GUID now? Will it be in the future?

  // Ignore entries that are missing links
  var fetchables = entries.filter(function (entry) {
    return entry.link;
  });

  // Create a counter that will be used later to keep track of
  // the progress of updating the entries.
  var numEntries = fetchables.length;

  // Exit early and ensure continuation if no fetchable entries
  if(!numEntries) {
    return onComplete();
  }

  // TODO: does link rewriting belong here? Is it really integral to
  // this particular function at this particular time? Clearly it has
  // to happen prior to this being called.

  // Preprocess entry link values by rewriting
  // links. This also updates the link property of
  // each entry as a side effect. The link property may also be
  // further updated later after fetching and using the
  // post-redirect-url.
  fetchables.forEach(function (entry) {
    entry.link = lucu.rewriteURL(entry.link);
  });

  // NOTE: this no longer checks whether an entry already exists
  // in the database. This just blindly fetches the html for
  // each entry. Why was I doing it? I think it is because I always
  // get a feed object when polling feeds and updating them, and
  // many of the entries already exist in the database for these.
  // I need to think of a better way to filter out entries from the
  // feed object that do not need to be fetched here. Perhaps as a
  // separate preprocessing step that occurs after fetching
  // the feed.
  // So really, this function should work off an array of feed
  // entries, not a feed object, because it does not need to be aware
  // of the other feed properties. Some other function should be
  // responsible for pre-filtering those entries that should not be
  // fetched here. This should just blindly fetch the html for all
  // entries in the array.

  // NOTE: setting image dimensions requires a live host document
  // to trigger fetches for images from each inert fetched
  // document. So we get a reference to one here. Right now this
  // using window explicitly, but I eventually want to not
  // reference it explicitly. I may not even want to declare it
  // here, but instead require the caller to set it as an
  // explicit parameter dependency.
  var hostDocument = window.document;


  fetchables.forEach(function (entry) {
    lucu.fetchHTML(entry.link, timeout, onFetchSuccess, onFetchError);

    function onFetchSuccess(document, responseURL) {

      // TODO: set entry.link to responseURL??? Need to think about
      // whether and where this should happen. This also changes the result
      // of the exists-in-db call. In some sense, exists-in-db would have
      // to happen before?  Or maybe we just set redirectURL as a separate
      // property? We use the original url as id still? Still seems wrong.
      // It sseems like the entries array should be preprocessed each and
      // every time. Because two input links after redirect could point to
      // same url. So the entry-merge algorithm needs alot of thought. It
      // is not inherent to this function, but for the fact that resolving
      // redirects requires an HTTP request, and if not done around this
      // time, requires redundant HTTP requests.

      // if we rewrite then we cannot tell if exists pre/post fetch
      // or something like that. so really we just want redirect url
      // for purposes of resolving stuff and augmenting images.

      // we also want redirect url for detecting dups though. like if two
      // feeds (or even the same feed) include entries that both post-redirect
      //resolve to the same url then its a duplicate entry

      lucu.fetchImageDimensions(hostDocument, document, onDimensionsSet);

      function onDimensionsSet() {
        var html = document.body.innerHTML;

        if(html) {
          entry.content = html;
        } else {

          // TODO: maybe only set this if content is empty? So allow the
          // original content to continue to exist? But how do we
          // differentiate between original and augmented content then?
          entry.content = 'Unable to download content for this article';
        }

        numEntries--;
        if(numEntries) return;
        onComplete();
      }
    }

    function onFetchError(error) {
      // TODO: set the entry content here to an error message?
      // tentative debugging log message
      console.dir(error);

      numEntries--;
      if(numEntries) return; // not done yet
      onComplete(); // done
    }
  });
};
