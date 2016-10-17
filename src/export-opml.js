// See license.md

'use strict';

{

function exportOPML(db, title, fileName, log, callback) {
  const ctx = {
    'callback': callback,
    'title': title || 'Subscriptions',
    'fileName': fileName || 'subs.xml',
    'log': log
  };
  log.log('Exporting opml file', ctx.fileName);
  db.connect(openDBOnSuccess.bind(ctx), openDBOnError.bind(ctx));
}

function openDBOnSuccess(conn) {
  this.log.debug('Connected to database');
  const cache = new FeedCache(this.log);
  cache.getAllFeeds(conn, onGetFeeds.bind(this));
  conn.close();
}

function openDBOnError() {
  onComplete.call(this);
}

function onGetFeeds(feeds) {
  this.log.debug('Loaded %s feeds from database', feeds.length);
  const doc = createDoc(this.title);
  const outlines = [];
  for(let feed of feeds) {
    const outline = createOutline(doc, feed);
    outlines.push(outline);
  }

  // Append the outlines to the body
  // doc.body is sometimes undefined, not sure why
  const body = doc.querySelector('body');
  for(let outline of outlines) {
    body.appendChild(outline);
  }

  const writer = new XMLSerializer();
  const opmlString = writer.serializeToString(doc);
  const blob = new Blob([opmlString], {'type': 'application/xml'});
  const objectURL = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectURL;
  anchor.setAttribute('download', this.fileName);
  anchor.style.display = 'none';
  const parent = document.body || document.documentElement;
  parent.appendChild(anchor);
  this.log.debug('Triggering download of opml file');
  anchor.click();
  URL.revokeObjectURL(objectURL);
  anchor.remove();
  onComplete.call(this);
}

function onComplete() {
  this.log.log('Completed export');
  if(this.callback) {
    this.callback();
  }
}

// Creates an outline element from an object representing a feed
function createOutline(doc, feed) {
  const outline = doc.createElement('outline');

  if(feed.type) {
    outline.setAttribute('type', feed.type);
  }

  const feedURL = Feed.getURL(feed);
  if(!feedURL) {
    throw new Error(`Feed missing url ${JSON.stringify(feed)}`);
  }

  outline.setAttribute('xmlUrl', feedURL);

  if(feed.title) {
    outline.setAttribute('text', feed.title);
    outline.setAttribute('title', feed.title);
  }

  if(feed.description) {
    outline.setAttribute('description', feed.description);
  }

  if(feed.link) {
    outline.setAttribute('htmlUrl', feed.link);
  }

  return outline;
}

function createDoc(title) {
  const doc = document.implementation.createDocument(null, 'opml', null);
  doc.documentElement.setAttribute('version', '2.0');
  const head = doc.createElement('head');
  doc.documentElement.appendChild(head);
  if(title) {
    const titleEl = doc.createElement('title');
    titleEl.textContent = title;
    head.appendChild(titleEl);
  }
  const nowDate = new Date();
  const nowDateUTCString = nowDate.toUTCString();
  const dateCreated = doc.createElement('datecreated');
  dateCreated.textContent = nowDateUTCString;
  head.appendChild(dateCreated);
  const dateModified = doc.createElement('datemodified');
  dateModified.textContent = nowDateUTCString;
  head.appendChild(dateModified);
  const docs = doc.createElement('docs');
  docs.textContent = 'http://dev.opml.org/spec2.html';
  head.appendChild(docs);
  const body = doc.createElement('body');
  doc.documentElement.appendChild(body);
  return doc;
}

this.exportOPML = exportOPML;

}
