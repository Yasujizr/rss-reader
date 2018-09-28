import '/src/base-uri/base-uri-test.js';
import '/src/color-contrast-filter/color-contrast-filter-test.js';
import '/src/condense-tagnames-filter/coerce-element-test.js';
import '/src/db/op/activate-feed-test.js';
import '/src/db/op/archive-entries-test.js';
import '/src/db/op/count-unread-entries-test.js';
import '/src/db/op/create-entry-test.js';
import '/src/db/op/create-feed-test.js';
import '/src/db/op/create-feeds.js';
import '/src/empty-attrs-filter/filter-empty-attrs-test.js';
import '/src/slideshow-page/article-title/article-title-test.js';
import '/src/poll-feeds/sniff-test.js';
import '/src/poll-feeds/rewrite-url-test.js';
import '/src/db/idb-model-test.js';
import '/src/subscribe/subscribe-test.js';
import '/src/color/color-test.js';
import '/src/db/entry-utils-test.js';
import '/src/db/feed-utils-test.js';
import '/src/db/sanity/model-sanity-test.js';
import '/src/iconsvc/favicon-service-test.js';
import '/src/lazy-image-filter/filter-lazy-images-test.js';
import '/src/image-size-filter/image-size-filter-test.js';
import '/src/html/html-truncate-test.js';
import '/src/indexeddb/indexeddb-test.js';
import '/src/db/sanity/filter-unprintables-test.js';
import '/src/fetch-feed/fetch-feed-test.js';
import '/src/fetch-html/fetch-html-test.js';
import '/src/fetch2/fetch2-test.js';
import '/src/mime/mime-test.js';
import '/src/import-opml/import-opml-test.js';
import '/src/parse-feed/parse-feed-test.js';
import '/src/unwrap-element/unwrap-element-test.js';
import {get_registry} from '/test/test-registry.js';

// Wrap a call to a test function with some extra log messages. Impose an
// optional deadline for the test to complete by specifying a timeout.
async function run_timed_test(test_function, timeout = 0) {
  console.log('%s: started', test_function.name);

  // The test will fail either immediately when creating the promise, or later
  // when awaiting the promise when the test has rejected, or after the timeout
  // occurred. We throw an error in all 3 cases. Note that in the timeout case
  // we ignore the test result (pass or error) and throw a timeout error
  // instead.

  // In the case of a timeout, we do not abort the test, because promises are
  // not cancelable.

  if (timeout) {
    const test_promise = test_function();
    const timeout_promise = deferred_rejection(test_function, timeout);
    await Promise.race([test_promise, timeout_promise]);
  } else {
    await test_function();
  }

  console.log('%s: completed', test_function.name);
}

function deferred_rejection(test_function, time_ms) {
  const test_name = test_function.name.replace(/_/g, '-');
  const error = new Error('Test "' + test_name + '" timed out');
  return new Promise((_, reject) => setTimeout(reject, time_ms, error));
}

// Lookup a test function by the function's name
function find_test_by_name(name) {
  // Allow for either - or _ as separator and mixed case
  let normal_test_name = name.replace(/-/g, '_').toLowerCase();

  const tests = get_registry();
  for (const test_function of tests) {
    if (test_function.name === normal_test_name) {
      return test_function;
    }
  }
}

// Run one or more tests either all at once or one after the other. In either
// case, if any test fails, the function exits (but tests may still run
// indefinitely).
// @param name {String} optional, name of test to run, if not specified then all
// tests run
// @param timeout {Number} optional, ms, per-test timeout value
// @param parallel {Boolean} optional, whether to run tests in parallel or
// serial, defaults to false (serial)
async function cli_run(name, timeout = 10000, parallel = true) {
  // Either run one test, run the named tests, or run all tests

  let tests;
  if (typeof name === 'string') {
    const test = find_test_by_name(name);
    if (!test) {
      console.warn('Test not found', name);
      return;
    }
    tests = [test];
  } else if (Array.isArray(name)) {
    tests = [];
    for (const n of name) {
      const test = find_test_by_name(n);
      if (test) {
        tests.push(test);
      } else {
        console.warn('Test not found', name);
      }
    }
  } else {
    tests = get_registry();
  }

  console.log('Spawning %d tests', tests.length);
  const start_time = new Date();

  if (parallel) {
    const promises = [];
    for (const test of tests) {
      promises.push(run_timed_test(test, timeout));
    }
    await Promise.all(promises);
  } else {
    for (const test of tests) {
      await run_timed_test(test, timeout);
    }
  }

  const end_time = new Date();
  console.log('Completed in %d ms', end_time - start_time);
}

function cli_print_tests() {
  const tests = get_registry();
  tests.forEach(test => console.log(test.name));
}

function populate_test_menu() {
  const tests = get_registry();
  const menu = document.getElementById('tests');
  for (const test of tests) {
    const option = document.createElement('option');
    option.value = test.name;
    option.textContent = test.name.replace(/_/g, '-').toLowerCase();
    menu.appendChild(option);
  }
}

// On module load, expose console commands
window.run = cli_run;
window.print_tests = cli_print_tests;

// On module load, populate the tests menu
populate_test_menu();
