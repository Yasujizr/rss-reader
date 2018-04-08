import {idb_remove} from '/src/lib/idb/idb.js';
import {rdr_archive} from '/src/ops/rdr-archive-entries.js';
import {rdr_create_conn} from '/src/ops/rdr-create-conn.js';

const channel_stub = {
  name: 'channel-stub',
  postMessage: noop,
  close: noop
};

async function test() {
  let version, timeout, max_age;
  const conn =
      await rdr_create_conn('archive-entries-test', version, timeout, console);
  await rdr_archive(conn, channel_stub, console, max_age);
  conn.close;
  await idb_remove(conn.name);
}

function noop() {}

window.test = test;