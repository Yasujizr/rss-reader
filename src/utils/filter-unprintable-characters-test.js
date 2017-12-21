import {filterUnprintableCharacters} from "/src/utils/string-utils.js";

const d = console.debug;
const f = filterUnprintableCharacters;
const a = function(s, len) {
  const result = filterUnprintableCharacters(s);
  const passed = result.length === len;
  d('input', escape(s), 'length', len, passed ? 'passed' : 'failed');
};

function run() {

  console.group('Testing [0 .. 31]');

  for(let i = 0; i < 9;i++) {
    a(String.fromCharCode(i), 0);
  }

  a('\t', 1);
  a('\n', 1);
  a(String.fromCharCode(11), 0);
  a('\f', 1);
  a('\r', 1);

  for(let i = 14; i < ' '.charCodeAt(0); i++) {
    a(String.fromCharCode(i), 0);
  }

  console.groupEnd();


  console.group('Testing [32 .. n)');
  a(' ', 1);
  a('Hello', 5);
  a('World', 5);
  a('Hello\nWorld', 11);
  a('Hello\u0000World', 10);
  a('<tag>text</t\u0005ag>', 15);
  console.groupEnd();

  console.group('Testing type');
  a('', 0);
  d('input', null, 'length', NaN, f(null) === null ? 'passed' : 'failed');
  d('input', void 0, 'length', NaN, f(void 0) === void 0 ? 'passed' : 'failed');
  d('input', true, 'length', NaN, f(true) === true ? 'passed' : 'failed');
  d('input', false, 'length', NaN, f(false) === false ? 'passed' : 'failed');
  d('input', NaN, 'length', NaN, isNaN(f(NaN)) ? 'passed' : 'failed');
  d('input', 0, 'length', NaN, f(0) === 0 ? 'passed' : 'failed');
  console.groupEnd();
}

// Run test on module load
run();

window.filterUnprintableCharacters = filterUnprintableCharacters;