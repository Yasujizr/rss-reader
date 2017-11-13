
import {assert} from "/src/rbl.js";

export function iframeFilter(doc) {
  assert(doc instanceof Document);
  if(!doc.body) {
    return;
  }

  const iframes = doc.body.querySelectorAll('iframe');
  for(const iframe of iframes) {
    iframe.remove();
  }
}
