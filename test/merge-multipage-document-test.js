function test() {

  const c = document.getElementById('c');
  const d = document.getElementById('d');
  const e = document.getElementById('e');
  const f = document.getElementById('f');

  const anchor_elements = document.body.getElementsByTagName('a');
  const sequences = pagination_find_anchor_sequences(anchor_elements, 4);
  return sequences;
}
