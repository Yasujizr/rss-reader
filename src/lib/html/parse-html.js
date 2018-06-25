import * as string from '/src/lib/string.js';

// Parses a string into an html document. When html is a fragment, it will be
// inserted into a new document using a default template provided by the
// browser, that includes a document element and usually a body. If not a
// fragment, then it is merged into a document with a default template.
export function parse_html(html_string) {
  if (typeof html_string !== 'string') {
    throw new TypeError('html_string is not a string');
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(html_string, 'text/html');

  const error = document.querySelector('parsererror');
  if (error) {
    const msg = string.condense_whitespace(error.textContent);
    throw new Error(msg);
  }

  return document;
}