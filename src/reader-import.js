'use strict';

// import favicon.js
// import feed.js
// import mime.js
// import opml-document.js
// import opml-outline.js
// import opml-parser.js
// import rbl.js
// import reader-db.js
// import subscribe-request.js

// Import opml files
// @param files {FileList} a collection of File objects, such as one
// generated by an HTML input element after browsing for files
// @throws {AssertionError}
// @throws {Error} database related
async function readerImportFiles(files) {
  assert(files instanceof FileList);
  console.log('importing %d files', files.length);

  let readerConn, iconConn;
  try {
    [readerConn, iconConn] = await Promise.all([readerDbOpen(), faviconDbOpen()]);

    const promises = [];
    for(const file of files) {
      promises.push(readerImportFile(file, readerConn, iconConn));
    }

    // TODO: if the promises are executed above, maybe this can occur after
    // try/finally?
    await promiseEvery(promises);
  } finally {
    closeDB(readerConn, iconConn);
  }
}

// @throws {AssertionError}
// @throws {ParserError}
async function readerImportFile(file, readerConn, iconConn) {
  assert(file instanceof File);
  assert(isOpenDB(readerConn));
  assert(isOpenDB(iconConn));
  console.log('importing opml file', file.name);

  if(file.size < 1) {
    console.log('file %s is 0 bytes', file.name);
    return 0;
  }

  if(!mime.isXML(file.type)) {
    console.log('file %s is not mime type xml', file.type);
    return 0;
  }

  let fileContent;
  try {
    fileContent = await readFileAsText(file);
  } catch(error) {
    console.warn(error);
    return 0;
  }

  // Allow errors to bubble
  const document = OPMLParser.parse(fileContent);

  opmlRemoveOutlinesWithInvalidTypes(document);
  opmlNormalizeOutlineXMLURLs(document);
  opmlRemoveOutlinesMissingXMLURLs(document);

  const outlines = opmlGetOutlineObjects(document);
  if(!outlines.length) {
    console.log('file %s contained 0 outlines', file.name);
    return 0;
  }

  const uniqueOutlines = readerImportGroupOutlines(outlines);
  const dupCount = outlines.length - uniqueOutlines.length;
  console.log('found %d duplicates in file', dupCount, file.name);

  for(const outline of uniqueOutlines) {
    opmlOutlineNormalizeHTMLURL(outline);
  }

  const feeds = [];
  for(const outline of uniqueOutlines) {
    feeds.push(opmlOutlineToFeed(outline));
  }

  const request = new SubscribeRequest();
  request.readerConn = readerConn;
  request.iconConn = iconConn;
  request.timeoutMs = timeoutMs;
  request.notify = false;

  // Allow exceptions to bubble
  const subAllResults = await request.subscribeAll(feeds);
  console.log('subbed to %d feeds in file', subAllResults.length, file.name);
}

// Filter duplicates, favoring earlier in array order
function readerImportGroupOutlines(outlines) {
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
