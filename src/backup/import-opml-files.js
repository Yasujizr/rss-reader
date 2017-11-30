import assert from "/src/assert/assert.js";
import FaviconCache from "/src/favicon/cache.js";
import * as OPMLDocument from "/src/opml/document.js";
import * as OPMLOutline from "/src/opml/outline.js";
import parseOPML from "/src/opml/parse.js";
import * as Subscriber from "/src/reader/subscribe.js";
import * as Feed from "/src/reader-db/feed.js";
import openReaderDb from "/src/reader-db/open.js";
import * as idb from "/src/utils/indexeddb-utils.js";
import * as mime from "/src/utils/mime-utils.js";
import promiseEvery from "/src/utils/promise-every.js";

export function Context() {
  this.readerConn;
  this.iconCache;
  this.fetchFeedTimeoutMs;
}

Context.prototype.open = async function() {
  assert(this.iconCache instanceof FaviconCache);
  const promises = [openReaderDb(), this.iconCache.open()];
  [this.readerConn] = await Promise.all(promises);
};

Context.prototype.close = function() {
  if(this.iconCache) {
    this.iconCache.close();
  }

  idb.close(this.readerConn);
};

// Import opml files
// @param files {FileList} a collection of File objects, such as one generated by an HTML input
// element after browsing for files
// @return {Promise} a promise that resolves to an array with length corresponding to the number
// of files imported, and for each file the number of feeds subscribed, or undefined if there was
// an error for that file.
export default function main(files) {
  assert(this instanceof Context);
  assert(files instanceof FileList);
  console.debug('Importing %d files', files.length);
  const filesArray = [...files];
  const promises = filesArray.map(importFile, this);
  return promiseEvery(promises);
}

async function importFile(file) {
  assert(this instanceof Context);
  assert(file instanceof File);
  assert(idb.isOpen(this.readerConn));
  assert(this.iconCache.isOpen());

  console.log('Importing file', file.name);

  if(file.size < 1) {
    console.log('File %s is 0 bytes', file.name);
    return 0;
  }

  if(!mime.isXML(file.type)) {
    console.log('File %s is not mime type xml', file.type);
    return 0;
  }

  let fileContent;
  try {
    fileContent = await readFileAsText(file);
  } catch(error) {
    console.warn(error);
    return 0;
  }

  const document = parseOPML(fileContent);
  removeOutlinesWithInvalidTypes(document);
  normalizeOutlineXMLURLs(document);
  removeOutlinesMissingXMLURLs(document);

  const outlines = OPMLDocument.getOutlineObjects(document);
  console.debug('Found %d outlines in file', outlines.length, file.name);
  if(!outlines.length) {
    return 0;
  }

  const uniqueOutlines = groupOutlines(outlines);
  console.debug('Found %d distinct outlines in file', uniqueOutlines.length, file.name);
  uniqueOutlines.forEach(OPMLOutline.normalizeHTMLURL);

  const subscribeContext = new Subscriber.Context();
  subscribeContext.readerConn = this.readerConn;
  subscribeContext.iconCache = this.iconCache;
  subscribeContext.fetchFeedTimeoutMs = this.fetchFeedTimeoutMs;
  subscribeContext.notify = false;

  // Signal to subscribe that it should not attempt to poll the feed's entries
  subscribeContext.concurrent = true;

  const feeds = uniqueOutlines.map(outlineToFeed);
  const subscribePromises = feeds.map(Subscriber.subscribe, subscribeContext);
  const subscribeResults = await promiseEvery(subscribePromises);

  let subCount = 0;
  for(const result of subscribeResults) {
    if(result) {
      subCount++;
    }
  }

  console.log('Subscribed to %d new feeds in file', subCount, file.name);
  return subCount;
}

function removeOutlinesWithInvalidTypes(doc) {
  assert(doc instanceof Document);
  const elements = OPMLDocument.getOutlineElements(doc);
  for(const element of elements) {
    if(!OPMLOutline.elementHasValidType(element)) {
      element.remove();
    }
  }
}

function normalizeOutlineXMLURLs(doc) {
  assert(doc instanceof Document);
  const outlines = OPMLDocument.getOutlineElements(doc);
  for(const outline of outlines) {
    OPMLOutline.elementNormalizeXMLURL(outline);
  }
}

function removeOutlinesMissingXMLURLs(doc) {
  assert(doc instanceof Document);
  const outlines = OPMLDocument.getOutlineElements(doc);
  for(const outline of outlines) {
    if(!OPMLOutline.elementHasXMLURL(outline)) {
      outline.remove();
    }
  }
}

// Filter duplicates, favoring earlier in array order
function groupOutlines(outlines) {
  const uniqueURLs = [];
  const uniqueOutlines = [];
  for(const outline of outlines) {
    if(!uniqueURLs.includes(outline.xmlUrl)) {
      uniqueOutlines.push(outline);
      uniqueURLs.push(outline.xmlUrl);
    }
  }
  return uniqueOutlines;
}

// Convert an outline object into a feed
function outlineToFeed(outline) {
  assert(OPMLOutline.isOutline(outline));

  // Note that this uses create, not a simple object, to allow magic to happen
  const feed = Feed.create();

  if(outline.type) {
    feed.type = outline.type;
  }

  if(outline.title) {
    feed.title = outline.title;
  }

  if(outline.text) {
    feed.text = outline.text;
  }

  if(outline.description) {
    feed.description = outline.description;
  }

  if(outline.htmlUrl) {
    feed.link = outline.htmlUrl;
  }

  Feed.appendURL(feed, outline.xmlUrl);
  return feed;
}

// Returns a promise that resolves to the full text of a file
function readFileAsText(file) {
  return new Promise(function executor(resolve, reject) {
    assert(file instanceof File);
    const reader = new FileReader();
    reader.readAsText(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
  });
}
