import {feed_is_valid, feed_prepare} from '/src/objects/feed.js';
import {update_feed} from '/src/operations/update-feed.js';

export async function create_feed(conn, channel, feed) {
  if (!feed_is_valid(feed)) {
    throw new TypeError('feed is invalid: ' + feed);
  }

  const prepared_feed = feed_prepare(feed);
  prepared_feed.active = true;
  prepared_feed.dateCreated = new Date();
  delete prepared_feed.dateUpdated;

  let void_channel;
  const validate = false;
  const set_date_updated = false;
  const feed_id = await update_feed(
      conn, void_channel, prepared_feed, validate, set_date_updated);

  if (channel) {
    channel.postMessage({type: 'feed-added', id: feed_id});
  }

  prepared_feed.id = feed_id;
  return prepared_feed;
}