'use strict';

// import http/mime.js
// import opml/opml-document.js
// import opml/opml-outline.js
// import rss/feed.js
// import favicon.js
// import file.js
// import reader-db.js
// import subscription.js

// Import the collection of opml files
// @param files {FileList} a collection of File objects, such as one
// generated by an HTML input element after browsing for files
// @returns status
async function reader_import_files(files) {
  console.assert(files);
  console.log('importing %d files', files.length);

  let reader_conn, icon_conn;
  try {
    [reader_conn, icon_conn] = await Promise.all([
      reader_db_open(), favicon_open_db()
    ]);

    await reader_import_files_internal(files, reader_conn, icon_conn);
  } catch(error) {
    console.warn(error);
    return ERR_DB;
  } finally {
    if(reader_conn)
      reader_conn.close();
    if(icon_conn)
      icon_conn.close();
  }

  return STATUS_OK;
}

function reader_import_files_internal(files, reader_conn, icon_conn) {
  const promises = [];
  for(const file of files)
    promises.push(reader_import_file_silently(file, reader_conn, icon_conn));
  return Promise.all(promises);
}

async function reader_import_file_silently(file, reader_conn, icon_conn) {
  let num_feeds_added = 0;
  try {
    num_feeds_added = await reader_import_file(file, reader_conn, icon_conn);
  } catch(error) {
    console.log(error);
  }
  return num_feeds_added;
}

async function reader_import_file(file, reader_conn, icon_conn) {
  console.assert(file);
  console.log('importing opml file', file.name);

  if(file.size < 1) {
    console.log('file %s is 0 bytes', file.name);
    return 0;
  }

  if(!mime_is_xml(file.type)) {
    console.log('file %s is not mime type xml', file.type);
    return 0;
  }

  let file_content;
  try {
    file_content = await file_read_as_text(file);
  } catch(error) {
    console.warn(error);
    return 0;
  }

  let [status, document] = opml_parse_from_string(file_content);
  if(status !== STATUS_OK) {
    console.log('error parsing opml file', file.name);
    return 0;
  }

  opml_remove_outlines_with_invalid_types(document);
  opml_normalize_outline_xmlurls(document);
  opml_remove_outlines_missing_xmlurls(document);

  const outlines = opml_get_outline_objects(document);
  if(!outlines.length) {
    console.log('file %s contained 0 outlines', file.name);
    return 0;
  }

  const unique_outlines = reader_import_group_outlines(outlines);
  const dup_outline_count = outlines.length - unique_outlines.length;
  console.log('found %d duplicates in file', dup_outline_count, file.name);

  for(const outline of unique_outlines) {
    opml_outline_normalize_htmlurl(outline);
  }

  const feeds = [];
  for(const outline of unique_outlines) {
    feeds.push(opml_outline_to_feed(outline));
  }

  // Allow exceptions to bubble
  const sub_results = await subscription_add_all(feeds, reader_conn, icon_conn);

  // Tally successful subscriptions
  let sub_count = 0;
  for(const sub_result of sub_results) {
    if(sub_result.status === STATUS_OK)
      sub_count++;
  }

  console.log('subbed to %d of %d feeds in file', sub_count, feeds.length, file.name);
  return sub_count;
}

// Filter duplicates, favoring earlier in array order
function reader_import_group_outlines(outlines) {
  const unique_urls = [];
  const unique_outlines = [];
  for(const outline of outlines) {
    if(!unique_urls.includes(outline.xmlUrl)) {
      unique_outlines.push(outline);
      unique_urls.push(outline.xmlUrl);
    }
  }
  return unique_outlines;
}
