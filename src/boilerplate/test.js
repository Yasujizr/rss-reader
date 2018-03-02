import {annotate} from '/src/boilerplate/boilerplate.js';
import * as filters from '/src/content-filters/content-filters.js';
import {fetch_html} from '/src/fetch/fetch.js';
import {html_parse} from '/src/html/html.js';

window.test = async function(url_string) {
  const request_url = new URL(url_string);
  const response = await fetch_html(request_url);
  const response_url = new URL(response.url);
  const response_text = await response.text();
  const document = html_parse(response_text);

  filters.filter_frame_elements(document);
  filters.filter_iframe_elements(document);
  filters.filter_script_elements(document);
  filters.filter_blacklisted_elements(document);
  await filters.document_set_image_sizes(document, response_url);
  annotate(document);

  const best_element = document.querySelector('[data-bp-max]');
  if (best_element) {
    best_element.style.border = '3px solid green';
  }

  const preview = window.document.getElementById('preview');
  preview.innerHTML = document.body.innerHTML;
};