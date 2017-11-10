'use strict';

// import rbl.js

class HTMLParser {

  // When html is a fragment, it will be inserted into a new document
  // using a default template provided by the browser, that includes a document
  // element and usually a body. If not a fragment, then it is merged into a
  // document with a default template.
  // @throws AssertionError
  // @throws ParserError
  static parseDocumentFromString(html) {
    assert(typeof html === 'string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, mime.HTML);
    assert(doc instanceof Document);
    const parserErrorElement = doc.querySelector('parsererror');
    if(parserErrorElement) {
      throw new ParserError(parserErrorElement.textContent);
    }
    return doc;
  }
}