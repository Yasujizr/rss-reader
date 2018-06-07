import {refresh_badge} from '/src/badge.js';
import {get_feed_ids, is_entry, is_valid_feed_id, iterate_entries} from '/src/reader-db.js';

// Scans the database for entries not linked to a feed and deletes them
export async function remove_orphaned_entries(conn, channel) {
  // Query for all feed ids. We load just the ids so that it is faster and more
  // scalable than actually loading all feed info.
  const feed_ids = await get_feed_ids(conn);

  // Technically we could continue and let the next transaction do nothing, but
  // it is better for performance to preemptively exit.
  if (!feed_ids.length) {
    return;
  }

  // Maintain a buffer of deleted entry ids so that it is available after the
  // transaction commits for use by operations that should not occur until
  // after the commit.
  const deleted_entry_ids = [];

  // Walk the entry store in write mode
  const txn_writable = true;
  await iterate_entries(conn, 'all', txn_writable, cursor => {
    const entry = cursor.value;

    // If the entry object type is invalid, ignore it
    if (!is_entry(entry)) {
      return;
    }

    // If the entry has a valid feed id, ignore it
    if (is_valid_feed_id(entry.feed)) {
      return;
    }

    // If the entry's feed id is a known feed id, ignore it
    if (feed_ids.includes(entry.feed)) {
      return;
    }

    // We found an entry with a bad feed id. Record that it will be deleted once
    // the transaction commits, request its deletion
    deleted_entry_ids.push(entry.id);
    cursor.delete();
  });

  // Now that txn committed, let everyone know of state changes
  for (const id of deleted_entry_ids) {
    channel.postMessage({type: 'entry-deleted', id: id, reason: 'orphan'});
  }

  if (deleted_entry_ids.length) {
    refresh_badge(conn).catch(console.error);  // non-blocking
  }
}
