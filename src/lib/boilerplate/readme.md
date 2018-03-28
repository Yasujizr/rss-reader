# About the boilerplate module

The boilerplate module classifies some of the contents of an [html document](https://developer.mozilla.org/en-US/docs/Web/API/Document) as boilerplate.

The principal exported function is `annotate`, a void function which accepts a document object as input. The function is so named because it basically just marks up the document with additional information.

For performance, the input document is modified. The `annotate` function is not a pure function. Cloning the document is too expensive given the goal of maintaining a small memory overhead and avoiding allocation.

For performance, rather than produce some type of data structure that contains references to the document's contents, tagged content is stored as attributes of elements within the document.

The boilerplate module also provides a `deannotate` helper function that clears all of the markup introduced by `annotate`.

### About the markup

***
TODO write me
***

### Regarding other document transformations

`annotate` is naive regarding several aspects of html document state, and what other transformations may apply before or after annotation. For example, it is not aware that text may be hidden, or barely visible.

### TODOS

***
This is also a type of filter, or transformation. In this case, instead of the concern of removing, the concern is tagging. I wonder if I should recognize this fundamental similarity and make it more pronounced. For example, maybe have a transforms folder, and this should be a subfolder within that?
***

***
Document the algorithm. Unfortunately I did not keep much of the original implementation.
***

***
Add a references section. Maybe I can find some of the original literature I was reading that inspired this approach.
***