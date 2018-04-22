import {console_stub} from '/src/lib/console-stub.js';
import {list_empty} from '/src/lib/list.js';
import {feed_create_favicon_lookup_url} from '/src/objects/feed.js';
import {for_each_active_feed} from '/src/ops/for-each-active-feed.js';
import {lookup_icon} from '/src/ops/lookup-icon.js';
import {update_feed} from '/src/ops/update-feed.js';

export async function refresh_feed_icons(
    rconn, iconn, channel, console = console_stub) {
  const promises = [];
  await for_each_active_feed(
      rconn,
      feed =>
          promises.push(refresh_feed(rconn, iconn, channel, console, feed)));
  await Promise.all(promises);
}

async function refresh_feed(rconn, iconn, channel, console, feed) {
  if (list_empty(feed.urls)) {
    return;
  }

  const lookup_url = feed_create_favicon_lookup_url(feed);
  if (!lookup_url) {
    return;
  }

  let doc, fetch_flag = true;
  const op = {conn: iconn, console: console, lookup: lookup_icon};
  const icon_url_string = op.lookup(lookup_url, doc, fetch_flag);

  if (feed.faviconURLString !== icon_url_string) {
    if (icon_url_string) {
      feed.faviconURLString = icon_url_string;
    } else {
      delete feed.faviconURLString;
    }

    const update_context = {};
    update_context.conn = rconn;
    update_context.channel = channel;
    update_context.console = console;

    const update_options = {};
    update_options.validate = false;
    update_options.sanitize = false;
    update_options.set_date_updated = true;

    await update_feed.call(update_context, feed, update_options);
  }
}
