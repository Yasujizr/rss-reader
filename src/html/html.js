// HTML utilities

import assert from "/src/utils/assert.js";
import {isUncheckedError} from "/src/utils/errors.js";
import parseHTML from "/src/html/parse-html.js";

// Returns a new string where certain 'unsafe' characters in the input string have been replaced
// with html entities. If input is not a string returns undefined.
export function escapeHTML(htmlString) {
  if(typeof htmlString === 'string') {
    // See https://stackoverflow.com/questions/784586 for reference
    // TEMP: not replacing & due to common double encoding issue
    const HTML_PATTERN = /[<>"']/g;
    return htmlString.replace(HTML_PATTERN, encodeFirst);
  }
}

// Returns the first character of the input string as an numeric html entity
function encodeFirst(string) {
  return '&#' + string.charCodeAt(0) + ';';
}

// Replaces html tags in the input string with the replacement. If no replacement, then removes the
// tags.
export function replaceTags(htmlString, replacement) {
  assert(typeof htmlString === 'string');

  // Fast case for empty strings
  // Because of the above assert this basically only checks 0 length
  if(!htmlString) {
    return htmlString;
  }

  if(replacement) {
    assert(typeof replacement === 'string');
  }

  let doc;

  // TODO: do not catch?
  try {
    doc = parseHTML(htmlString);
  } catch(error) {
    if(isUncheckedError(error)) {
      throw error;
    } else {
      return 'Unsafe HTML redacted';
    }
  }

  if(!replacement) {
    return doc.body.textContent;
  }

  // Shove the text nodes into an array and then join by replacement
  const it = doc.createNodeIterator(doc.body, NodeFilter.SHOW_TEXT);
  const nodeValues = [];
  for(let node = it.nextNode(); node; node = it.nextNode()) {
    nodeValues.push(node.nodeValue);
  }

  return nodeValues.join(replacement);
}
