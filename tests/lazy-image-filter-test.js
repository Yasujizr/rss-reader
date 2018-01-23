import filterLazyImages from "/src/feed-poll/filters/lazy-image-filter.js";
import filterSourcelessImages from "/src/feed-poll/filters/sourceless-image-filter.js";
import * as FetchUtils from "/src/common/fetch-utils.js";
import {parseHTML} from "/src/common/html-utils.js";

window.test = async function(urlString) {
  const urlObject = new URL(urlString);
  const response = await FetchUtils.fetchHTML(urlObject);
  const responseText = await response.text();
  const document = parseHTML(responseText);
  filterLazyImages(document);
  // Call this subsequently because it prints out missing images
  filterSourcelessImages(document);
};
