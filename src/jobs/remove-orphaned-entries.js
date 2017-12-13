import assert from "/src/assert/assert.js";
import FeedStore from "/src/feed-store/feed-store.js";
import * as Feed from "/src/reader-db/feed.js";
import findEntriesInDb from "/src/reader-db/find-entries.js";
import getFeedIdsInDb from "/src/reader-db/get-feed-ids.js";
import removeEntriesFromDb from "/src/reader-db/remove-entries.js";

const CHANNEL_NAME = 'reader';

// Removes entries not linked to a feed from the database
// @param store {FeedStore} an open FeedStore instance
// @param limit {Number}
export default async function removeOrphanedEntries(store, limit) {
  assert(store.isOpen());

  // For orphan determination we want all feeds, we don't care whether feeds are inactive
  const feedIds = await getFeedIdsInDb(store.conn);

  function isOrphan(entry) {
    const id = entry.feed;
    return !Feed.isValidId(id) || !feedIds.includes(id);
  }

  const entries = await findEntriesInDb(store.conn, isOrphan, limit);
  console.debug('Found %s orphans', entries.length);
  if(entries.length === 0) {
    return;
  }

  const orphanIds = [];
  for(const entry of entries) {
    orphanIds.push(entry.id);
  }

  // Exit early when no orphans found. This avoids some substantial processing.
  if(orphanIds.length < 1) {
    return;
  }

  await removeEntriesFromDb(store.conn, orphanIds);

  const channel = new BroadcastChannel(CHANNEL_NAME);
  const message = {type: 'entry-deleted', id: undefined, reason: 'orphan'};
  for(const id of orphanIds) {
    message.id = id;
    channel.postMessage(message);
  }
  channel.close();
}
