// See license.md

'use strict';

/*
Debug line printed as result of calling fetch_html: Response not ok
http://daringfireball.net/linked/2016/10/31/intel-mbp-ram 406 Not Acceptable.
This also occurred in line 345 in favicon.js

This messages shows up in the console when visiting the page:

A Parser-blocking, cross-origin script,
http://connect.decknetwork.net/deckDF_js.php?1477969301611, is invoked via
document.write. This may be blocked by the browser if the device has poor
network connectivity. See https://www.chromestatus.com/feature/5718547946799104
for more details.
(anonymous) @ intel-mbp-ram:112

This is on Chrome 55, which I believe just mentioned something about this
happening.
*/

// TODO: i don't love how this returns an event, maybe break up the function
// into separate parts? maybe require the caller to handle the text

// TODO: break up into composible promises and functions?
// fetch_html returns the response
// --- maybe it also checks response.ok to conflate net errors with 404s
// is_html_response returns whether the response is the correct content type
// or maybe is merged with fetch_html

// get_response_as_html reads the text of the response and returns a doc
// But all this really does is make the caller use more boilerplate, that they
// must always use...


function fetch_html(url, log = SilentConsole) {
  return new Promise(async function fetch_html_impl(resolve, reject) {
    log.log('Fetching html', url.href);
    const opts = {};
    opts.credentials = 'omit';
    opts.method = 'GET';
    opts.headers = {'Accept': 'text/html'};
    opts.mode = 'cors';
    opts.cache = 'default';
    opts.redirect = 'follow';
    opts.referrer = 'no-referrer';

    try {
      let response = await fetch(url.href, opts);
      log.debug('Fetched html', url.href);

      if(!response.ok) {
        log.debug('Response not ok', url.href, response.status,
          response.statusText);
        reject(new Error(response.status));
        return;
      }

      // Using an accept header isn't enough. At least avoid the case where the
      // mime type is known
      let content_type = response.headers.get('Content-Type');
      if(content_type) {
        content_type = content_type.toLowerCase();
        if(!content_type.includes('text/html')) {
          log.debug('Invalid mime type', url.href, content_type);
          reject(new Error('invalid mime type ' + content_type));
          return;
        }
      }

      const text = await response.text();
      log.debug('Read response text', url.href, text.length);
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      if(!doc || !doc.documentElement ||
        doc.documentElement.localName !== 'html') {
        log.debug('Text is not valid html', url.href, text.substring(0, 100));
        reject(new Error('not html'));
        return;
      }

      resolve({'document': doc, 'response_url_str': response.url});
    } catch(error) {
      log.debug(error);
      reject(error);
    }
  });
}
