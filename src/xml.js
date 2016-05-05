// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

// TODO: this is really only ever called by opml.js, just move it back into
// that lib

// Parses a string containing xml into an document. The document is XML-flagged,
// so node.nodeName is case-sensitive. Throws an exception when a parsing
// error occurs.
function xml_parse_string(xmlString) {
  const parser = new DOMParser();
  const MIME_TYPE_XML = 'application/xml';
  const document = parser.parseFromString(xmlString, MIME_TYPE_XML);

  // TODO: are document or documentElement ever undefined? I feel like
  // parseFromString guarantees they are defined or else it would throw
  // or something like that. Look into this.

  if(!document) {
    throw new Error('Undefined document');
  }

  if(!document.documentElement) {
    throw new Error('Undefined document element');
  }

  // If there is a parsing error, some browsers (or all??) insert the
  // error into the content. Pluck it and throw it.
  const parserError = document.querySelector('PARSERERROR');
  if(parserError) {
    throw new Error('Format error: ' + parserError.textContent);
  }

  return document;
}
