import {rdr_fetch_html} from '/src/operations/rdr-fetch-html.js';

async function test(url_string, timeout) {
  const request_url = new URL(url_string);
  const response = await rdr_fetch_html(request_url, timeout);
  console.dir(response);
  const response_text = await response.text();
  console.log(response_text);
  return response;
}

window.test = test;
