// See license.md

'use strict';

// TODO: buffer all files before opening connection?

{

function importOPML(feedDb, log, callback) {
  if(!parseXML) {
    throw new ReferenceError('parseXML');
  }

  log = log || SilentConsole;
  log.log('Starting opml import');

  // Create the uploader in the context of the document
  // containing this script
  const uploader = document.createElement('input');
  uploader.setAttribute('type', 'file');
  uploader.setAttribute('accept', 'application/xml');
  uploader.style.display = 'none';
  document.documentElement.appendChild(uploader);

  const ctx = {
    'numFilesProcessed': 0,
    'callback': callback,
    'uploader': uploader,
    'files': null,
    'log': log,
    'feedDb': feedDb,
    'feedDbConn': null,
    'iconCacheConn': null,
    'iconCache': new FaviconCache(log)
  };
  uploader.onchange = onUploaderChange.bind(ctx);
  uploader.click();
  log.debug('Clicked uploader');
}

function parseFromString(str) {
  const doc = parseXML(str);
  if(!doc) {
    throw new Error('parseXML did not yield a document');
  }
  const rootName = doc.documentElement.localName;
  if(rootName !== 'opml') {
    throw new Error('Invalid document element: ' + rootName);
  }
  return doc;
}

function onUploaderChange(event) {
  this.uploader.removeEventListener('change', onUploaderChange);

  this.files = [...this.uploader.files];
  this.files = filterNonXMLFiles(this.files);
  this.files = filterEmptyFiles(this.files);

  if(!this.files.length) {
    onComplete.call(this);
    return;
  }

  this.feedDb.open(openDBOnSuccess.bind(this), openDBOnError.bind(this));
}

function openDBOnSuccess(event) {
  this.log.debug('Connected to database');
  this.feedDbConn = event.target.result;

  // TODO: open a connection to favicon cache here, store it in context, then
  // continue.
  this.iconCache.connect(iconCacheConnectOnSuccess.bind(this),
    iconCacheConnectOnError.bind(this));
}

function openDBOnError(event) {
  this.log.error(event.target.error);
  onComplete.call(this);
}

function iconCacheConnectOnSuccess(event) {
  this.log.debug('Connected to database', this.iconCache.name);

  this.iconCacheConn = event.target.result;

  for(let file of this.files) {
    this.log.debug('Loading', file.name);
    const reader = new FileReader();
    reader.onload = readerOnLoad.bind(this, file);
    reader.onerror = readerOnError.bind(this, file);
    reader.readAsText(file);
  }
}

function iconCacheConnectOnError(event) {
  this.log.error(event.target.error);
  onComplete.call(this);
}

function filterNonXMLFiles(files) {
  const output = [];
  for(let file of files) {
    if(file.type.toLowerCase().includes('xml')) {
      output.push(file);
    }
  }
  return output;
}

function filterEmptyFiles(files) {
  const output = [];
  for(let file of files) {
    if(file.size > 0) {
      output.push(file);
    }
  }
  return output;
}

function readerOnLoad(file, event) {
  this.log.log('Loaded file', file.name);

  const text = event.target.result;
  let doc;
  try {
    doc = parseFromString(text);
  } catch(error) {
    this.log.warn(file.name, error);
    onFileProcessed.call(this, file);
    return;
  }

  const outlineElements = selectOutlineElements(doc);
  let outlines = outlineElements.map(createOutlineObject);
  outlines = outlines.filter(outlineHasValidType);
  outlines = outlines.filter(outlineHasURL);
  outlines.forEach(deserializeOutlineURL);
  outlines = outlines.filter(outlineHasURLObject);

  // It is probably faster to reduce the number of subscribe errors that will
  // occur here rather than during
  outlines = filterDuplicateOutlines(outlines);

  const feeds = outlines.map(createFeedFromOutline);

  const suppressNotifications = true;
  const callback = null;

  for(let feed of feeds) {
    subscribe(this.feedDbConn, this.iconCacheConn, feed, suppressNotifications,
      this.log, callback);
  }

  onFileProcessed.call(this, file);
}

function readerOnError(file, event) {
  this.log.warn(file.name, event.target.error);
  onFileProcessed.call(this, file);
}

function onFileProcessed(file) {
  this.log.debug('Processed file "', file.name, '"');
  this.numFilesProcessed++;
  // Compare against this.files, not uploader.files, because we have filtered
  // out some files before processing
  if(this.numFilesProcessed === this.files.length) {
    onComplete.call(this);
  }
}

function onComplete() {
  this.log.log('Completed opml import');
  if(this.uploader) {
    this.uploader.remove();
  }
  if(this.feedDbConn) {
    this.log.debug('Closing feed cache database connection');
    this.feedDbConn.close();
  }
  if(this.iconCacheConn) {
    this.log.debug('Closing icon cache database connection');
    this.iconCacheConn.close();
  }
  if(this.callback) {
    this.callback();
  }
}

function selectOutlineElements(doc) {
  const outlines = [];

  // This is using querySelector because doc.body is undefined, not sure why.
  const body = doc.querySelector('body');
  if(!body) {
    return outlines;
  }

  // Look at immediate children
  for(let el = body.firstElementChild; el; el = el.nextElementSibling) {
    if(el.localName === 'outline') {
      outlines.append(el);
    }
  }
  return outlines;
}

function createOutlineObject(element) {
  return {
    'description': outline.getAttribute('description'),
    'link': outline.getAttribute('htmlUrl'),
    'text': outline.getAttribute('text'),
    'title': outline.getAttribute('title'),
    'type': outline.getAttribute('type'),
    'url': outline.getAttribute('xmlUrl')
  };
}

function outlineHasValidType(outline) {
  const type = outline.type;
  return type && type.length > 2 && /rss|rdf|feed/i.test(type);
}

function outlineHasURL(outline) {
  return outline.url && outline.url.trim();
}

function deserializeOutlineURL(outline) {
  try {
    outline.urlObject = new URL(outline.url);
    outline.urlObject.hash = '';
  } catch(error) {
  }
}

function outlineHasURLObject(outline) {
  return 'urlObject' in outline;
}

function filterDuplicateOutlines(outlines) {
  const output = [];
  for(let outline of outlines) {
    const urlString = outline.urlObject.href;
    if(!output.includes(urlString)) {
      output.push(outline);
    }
  }

  return output;
}

function createFeedFromOutline(outline) {
  const feed = {};
  Feed.addURL(feed, outline.urlObject.href);
  feed.type = outline.type;
  feed.title = outline.title || outline.text;
  feed.description = outline.description;
  if(outline.link) {
    try {
      const linkURL = new URL(outline.link);
      linkURL.hash = '';
      feed.link = linkURL.href;
    } catch(error) {
    }
  }
  return feed;
}

this.importOPML = importOPML;

}
