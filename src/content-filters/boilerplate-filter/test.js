import {boilerplate_filter} from '/src/content-filters/boilerplate-filter/boilerplate-filter.js';
import {cf_resolve_document_urls, document_set_image_sizes, filter_blacklisted_elements, filter_frame_elements, filter_iframe_elements, filter_script_elements} from '/src/content-filters/content-filters.js';
import {fetch_html} from '/src/fetch-utils.js';
import {html_parse} from '/src/html-utils.js';

window.test = async function(url_string) {
  const response = await fetch_html(new URL(url_string));
  const response_text = await response.text();
  const document = html_parse(response_text);

  filter_frame_elements(document);
  filter_iframe_elements(document);
  filter_script_elements(document);
  filter_blacklisted_elements(document);
  await document_set_image_sizes(document, new URL(response.url));

  boilerplate_filter(document, {annotate: true});

  const best_element = document.querySelector('[data-bp-max]');
  if (best_element) {
    best_element.style.border = '3px solid green';
  }

  const preview = window.document.getElementById('preview');
  preview.innerHTML = document.body.innerHTML;
};
