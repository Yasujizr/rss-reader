import assert from '/src/lib/assert.js';
import {filter_dead_images} from '/src/lib/filters/filter-dead-images.js';
import {filter_lazy_images} from '/src/lib/filters/filter-lazy-images.js';
import {parse_html} from '/src/lib/html/parse-html.js';
import {fetch_html} from '/src/lib/net/fetch-html.js';
import {register_test} from '/src/test/test-registry.js';

// TODO: rewrite in new test format
// TODO: rewrite without input, load a local file internally

async function lazy_image_filter_test(url_string) {
  /*
    const request_url = new URL(url_string);
    const response = await fetch_html(request_url);
    const response_text = await response.text();
    const document = parse_html(response_text);
    filter_lazy_images(document);

    // Call this subsequently because it prints out missing images
    // filter_dead_images(document);
  */
}

register_test(lazy_image_filter_test);