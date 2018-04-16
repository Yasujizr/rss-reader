import {FaviconService} from '/src/lib/favicon-service/favicon-service.js';

// Lookup the favicon url for a url. Returns a promise that resolves to the
// url (string).
// @param url {URL} the location to investigate
// @param skip_fetch {Boolean} whether to attempt to fetch the full text of the
// resource, and if it is html, search for a url within the html, before
// continuing to check other places.

// TODO: support pre-fetched document parameter

export function rdr_lookup_icon(url, fetch = true) {
  const fs = new FaviconService();
  fs.conn = this.conn;
  fs.console = this.console;
  fs.skip_fetch = !fetch;
  return fs.lookup(url);
}
