import assert from '/src/assert/assert.js';
import {parse_feed} from '/src/parse-feed/parse-feed.js';
import {register_test} from '/test/test-registry.js';

// TODO: implement. note that this should run by loading a local resource, or
// create a document in memory during the test

async function feed_parser_test() {
  return true;
}

register_test(feed_parser_test);
