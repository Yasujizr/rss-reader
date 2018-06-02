import {db_open} from '/src/db/db-open.js';
import {export_opml} from '/src/export-opml.js';
import {log} from '/src/log.js';

// Abstracts away all of the operations involved in generating and downloading
// an opml xml file into a simple call for the slideshow page. Also hides
// the helper functions in module scope
export async function slideshow_export_opml(title, filename) {
  const op = {};
  op.conn = await db_open();
  op.export_opml = export_opml;
  const opml_document = await op.export_opml(title);
  op.conn.close();

  log('%s: downloading...', slideshow_export_opml.name);

  download_blob_using_chrome_api(
      opml_document_to_blob(opml_document), filename);

  log('%s: export completed', slideshow_export_opml.name);
}

function opml_document_to_blob(opml_document) {
  const serializer = new XMLSerializer();
  const xml_string = serializer.serializeToString(opml_document);
  return new Blob([xml_string], {type: 'application/xml'});
}

function download_blob_using_anchor(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.setAttribute('download', filename);
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL();
}

// An alternative to download_blob_using_anchor that avoids the issue introduced
// in Chrome 65 with cross-origin download urls (see Issue #532)
function download_blob_using_chrome_api(blob, filename) {
  const url = URL.createObjectURL(blob);
  const options = {url: url, filename: filename};
  chrome.downloads.download(options);
  URL.revokeObjectURL(url);
}