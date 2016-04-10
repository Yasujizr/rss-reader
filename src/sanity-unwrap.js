// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

// Requires: /src/dom.js

/*
Provides basic unwrap function and a sanitize html function that unwraps
various elements. To unwrap an element means to replace the element with
its children, effectively removing the element.

When ignoring most of the attributes of an element, and removing most
styling information, several elements become meaningless wrappers of other
elements, and therefore extraneous. Removing the extraneous elements helps
compress the size of the document, which reduces storage, and speeds up
traversal.

Unwrap introduces sentinel text nodes because unwrapping an element
can result in adjacent text. For example, <p>a<inline>b<inline></p>
can result in rendering ab. With the inline, the browser would implicitly
generate a space to separate the text.

Unwrap is not optimized for live document modification. It is designed
to work on an inert document such as one generated by XMLHttpRequest or
document.implementation.createHTMLDocument. An earlier implementation
removed the parent of the node entirely before moving each of the child
nodes individually, and then re-attached the parent. For some unclear reason
this is slow, so I did away with the parent manipulation.

TODO: I am focusing on optimizing this function. It is primarily called by
sanitizeDocument, and profiling shows that it is usually the slowest part of
that function. The primary performance seems to be that unwrap is slow, because
unwrap makes several calls to insertBefore.

I have not found a way to efficiently move a node's child nodes using a single
operation. The closest I got was using
parentNode.insertAdjacentHTML(childNode.innerHTML, childNode). Profiling showed
this was slower than moving individual nodes with insertBefore. I suppose this
is due to all the marshalling, and the implicit XSS checks and all that. I am
still looking for some way to do a batch op.

I also experimented with recreation of an entire virtual dom. I made it as
efficient as possible. It turns out to be terribly slow.

Therefore, instead of optimizing unwrap, I am trying to reduce the number of
calls to unwrap. There are several situations where this is possible:

<p><inline><inline>text</inline></inline></p>
<p><inline>whitespace<inline>text</inline>whitespace</p>
<p><inline><inline>text</inline><inline>text</inline></inline></p>

So far I have two implementations, a naive version that unwraps everything, and
a crappy more complex version that attempts to reduce the number of calls.
Unfortunaely, the naive is still currently better performance. I think part of
the problem is that the attempt doubles some of its logic, and involves
recursion. For example, I am seeing in a profile that I drop the total time
spent calling unwrap, because of the reduced number of calls, but the overhead
of the filterUnwrappables function itself increases.

Another problem is due to the recently added support for detecting nesting
of multiple inlines. For example, situation 3 above. I can now detect the
nesting here,
but now the call to unwrap with a 2nd argument works incorrectly. When it
unwraps inline2 into p, it detaches inline2. However, it also detaches
inline1 because that implicitly detaches inline2. And that is the source of
the problem, because detaching inline1 implicitly detaches inline3, when
inline3 should in fact still exist at that point. I am still working this
out. Another thought is that maybe this isn't a problem. inline3 is still
yet to be visited in the iteration of unwrapple elements. It will eventually
be visited, and it will still have a parent. The problem is that the parent
at that point is no longer attached.

I do not like that sanity_is_unwrappable_parent makes a call to match. It feels
somehow redundant. match is also slow. one idea is to keep a set (or basic
array) of the inline elements initially found, and just check set membership
instead of calling matches

I do not like how I am calling sanity_is_unwrappable_parent multiple times. First
in the iteration in order to skip, and second when finding the shallowest
ancestor.

I do not like how I am repeatedly trimming several text nodes. This feels
sluggish.
*/

const UNWRAPPABLE_SELECTOR = [
  'ABBR', 'ACRONYM', 'ARTICLE', 'ASIDE', 'CENTER', 'COLGROUP', 'DATA',
  'DETAILS', 'DIV', 'FOOTER', 'HEADER', 'HELP', 'HGROUP', 'ILAYER',
  'INSERT', 'LAYER', 'LEGEND', 'MAIN', 'MARK', 'MARQUEE', 'METER',
  'MULTICOL', 'NOBR', 'SECTION', 'SPAN', 'TBODY', 'TFOOT', 'THEAD', 'FORM',
  'LABEL', 'BIG', 'BLINK', 'FONT', 'PLAINTEXT', 'SMALL', 'TT'
].join(',');

function sanity_filter_unwrappables(document) {
  'use strict';

  return sanity_filter_unwrappables_naive(document);
}

function sanity_filter_unwrappables_naive(document) {
  'use strict';

  // Require body. Only examine elements beneath body.
  const bodyElement = document.body;
  if(!bodyElement) {
    return;
  }

  const elements = bodyElement.querySelectorAll(UNWRAPPABLE_SELECTOR);
  const numElements = elements.length;
  for(let i = 0; i < numElements; i++) {
    dom_unwrap(elements[i], null);
  }
}

function sanity_filter_unwrappables_complex(document) {
  'use strict';

  const elements = document.querySelectorAll(UNWRAPPABLE_SELECTOR);
  for(let i = 0, len = elements.length, element, shallowest; i < len; i++) {
    element = elements[i];
    if(!sanity_is_unwrappable_parent(element)) {
      shallowest = sanity_find_shallowest_unwrappable_ancestor(element);
      dom_unwrap(element, shallowest);
    }
  }
}

function sanity_is_unwrappable_parent(element) {
  'use strict';

  let result = element.matches(UNWRAPPABLE_SELECTOR);
  for(let node = element.firstChild; result && node; node = node.nextSibling) {
    if(node.nodeType === Node.ELEMENT_NODE) {
      if(!sanity_is_unwrappable_parent(node)) {
        result = false;
      }
    } else if(node.nodeType === Node.TEXT_NODE) {
      if(node.nodeValue.trim()) {
        result = false;
      }
    }
  }

  return result;
}

function sanity_find_shallowest_unwrappable_ancestor(element) {
  'use strict';

  // TODO: do not iterate past body

  let shallowest = null;
  for(let node = element.parentNode;
    node && sanity_is_unwrappable_parent(node);
    node = node.parentNode) {

    shallowest = node;
  }
  return shallowest;
}
