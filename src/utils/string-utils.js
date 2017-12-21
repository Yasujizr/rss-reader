// Returns a new string object where sequences of whitespace characters in the input string are
// replaced with a single space character.
//
// @param {String} an input string
// @throws {Error} if input is not an object with a replace method
// @returns {String} a condensed string
export function condenseWhitespace(string) {
  return string.replace(/\s{2,}/g, ' ');
}

// Returns a new string where Unicode Cc-class characters have been removed. Throws an error if
// string is not a defined string. Adapted from these stack overflow questions:
// http://stackoverflow.com/questions/4324790
// http://stackoverflow.com/questions/21284228
// http://stackoverflow.com/questions/24229262
export function filterControls(string) {
  return string.replace(/[\x00-\x1F\x7F-\x9F]+/g, '');
}

// If the input is a string then the function returns a new string that is approximately a copy of
// the input less certain 'unprintable' characters. In the case of bad input the input itself is
// returned. To test if characters were replaced, check if the output string length is less than the
// input string length.
// Basically this removes those characters in the range of [0..31] except for the following four
// characters:
// \t is \u0009 which is base10 9
// \n is \u000a which is base10 10
// \f is \u000c which is base10 12
// \r is \u000d which is base10 13
// TODO: look into how much this overlaps with filterControls

const unPrintablePattern = /[\u0000-\u0008\u000b\u000e-\u001F]+/g;
export function filterUnprintableCharacters(value) {
  // The length check is done because given that replace will be a no-op when the length is 0 it is
  // faster to perform the length check than it is to call replace. I do not know the distribution
  // of inputs but I expect that empty strings are not rare.
  return typeof value === 'string' && value.length ? value.replace(unPrintablePattern, '') : value;
}