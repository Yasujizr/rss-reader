// See license.md

'use strict';

async function refresh_feed_icons(log = SilentConsole) {
  log.log('Refreshing feed favicons...');
  let num_modified = 0;

  const feedDb = new FeedDb();
  feedDb.log = log;


  await feedDb.connect();
  const icon_conn = await Favicon.connect();
  const feeds = await feedDb.getFeeds();
  for(let feed of feeds) {
    const lookup_url = get_lookup_url(feed);
    const icon_url = await Favicon.lookup(icon_conn, lookup_url, log);
    if(!icon_url)
      continue;
    if(!feed.faviconURLString || feed.faviconURLString !== icon_url) {
      num_modified++;
      feed.faviconURLString = icon_url;
      await feedDb.putFeed(feed);
    }
  }
  log.log('Completed refreshing feed favicons. Modified %d', num_modified);

  feedDb.close();
  icon_conn.close();

  // TODO: inline
  // TODO: there is no longer a guarantee that feed.link contains a valid
  // url, need a try/catch
  function get_lookup_url(feed) {
    let url = null;
    if(feed.link) {
      url = new URL(feed.link);
    } else {
      const feed_url = Feed.getURL(feed);
      url = new URL(new URL(feed_url).origin);
    }
    return url;
  }
}
