import {rdr_fetch_feed} from '/src/operations/rdr-fetch-feed.js';

async function test(url_string, timeout) {
  const request_url = new URL(url_string);
  const response = await rdr_fetch_feed(request_url, timeout);
  console.dir(response);

  if (!response.ok) {
    throw new Error('Failed to fetch ' + request_url.href);
  }

  const response_text = await response.text();
  console.dir(response_text);
}

window.test = test;