import assert from "/src/common/assert.js";
import * as Status from "/src/common/status.js";
import updateBadgeText from "/src/feed-ops/update-badge-text.js";
import FeedStore from "/src/feed-store/feed-store.js";
import * as Feed from "/src/feed-store/feed.js";

// TODO: return status instead of throw

// Remove a feed and its entries from the database and notify the UI
// @param feedId {Number} id of feed to unsubscribe
// @param store {FeedStore} an open FeedStore instance
// @param channel {BroadcastChannel} this dispatches feed deleted and
// entry deleted type messages to the reader channel
export default async function unsubscribe(feedId, store, channel) {
  assert(Feed.isValidId(feedId));
  assert(store instanceof FeedStore);
  assert(store.isOpen());
  assert(channel instanceof BroadcastChannel);

  let [status, entryIds] = await store.findEntryIdsByFeedId(feedId);
  if(status !== Status.OK) {
    throw new Error('Failed to find entry ids with status ' + status);
  }


  status = await store.removeFeed(feedId, entryIds);
  if(status !== Status.OK) {
    throw new Error('Failed to remove feed and entries with status ' + status);
  }

  channel.postMessage({type: 'feed-deleted', id: feedId, reason: 'unsubscribe'});
  for(const entryId of entryIds) {
    channel.postMessage({type: 'entry-deleted', id: entryId, reason: 'unsubscribe'});
  }

  updateBadgeText();
}
