import assert from "/src/assert/assert.js";
import unwrap from "/src/utils/dom/unwrap-element.js";
import isPosInt from "/src/utils/is-pos-int.js";

// Filters certain occurrences of emphasized content from document content
// @param maxTextLength {Number} optional, if number of non-tag characters
// within emphasis element is greater than this, then the element is filtered
export default function emphasisFilter(doc, maxTextLength) {
  assert(doc instanceof Document);

  if(typeof maxTextLength === 'undefined') {
    maxTextLength = 0;
  }
  assert(isPosInt(maxTextLength));
  if(!doc.body) {
    return;
  }

  // TODO: use non-whitespace character count instead of full character count?

  const elements = doc.body.querySelectorAll('b, big, em, i, strong');
  for(const element of elements) {
    if(element.textContent.length > maxTextLength) {
      unwrap(element);
    }
  }
}
