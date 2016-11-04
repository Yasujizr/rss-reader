// See license.md

'use strict';

// Command line interface module. For performing operations from the console,
// with logging to console.
const cli = {};

cli.archive_entries = async function() {
  const conn = await db_connect(undefined, undefined, console);
  const num_archived = await archive_entries(conn, undefined, console);
  conn.close();
};

cli.poll_feeds = async function() {
  const num_added = await poll_feeds({
    'ignore_idle_state': 1,
    'skip_unmodified_guard': 1,
    'log': console
  });
};
