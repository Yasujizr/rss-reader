// The list lib is basically a utility library for arrays (not actual lists)

// Returns the value as the last index of the the list, or undefined if the list
// is empty
// @param list {Array}
// @throws {Error} if list is not a defined array
export function list_peek(list) {
  if (list.length < 1) {
    return;
  }

  return list[list.length - 1];
}