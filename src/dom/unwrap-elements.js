import assert from "/src/assert.js";
import unwrap from "/src/dom/unwrap-element.js";

export default function unwrapDescendantsMatchingSelector(ancestorElement, selector) {
  assert(ancestorElement instanceof Element);
  assert(typeof selector === 'string');
  const elements = ancestorElement.querySelectorAll(selector);
  for(const element of elements) {
    unwrap(element);
  }
}
