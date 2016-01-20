// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file


// Handles frame, noframes, frameset, and iframe elements
// TODO: this may need to be a more general transform that is async
// and automatically identifies the core content frame, fetches its content,
// and then incorporates it into the document
// TODO: i want to consider inlining iframe content
// TODO: i think i want to make the reliance on DOMUtils explicit, using
// some form of dependency injection

// TODO: iframes are frame-like, but in the end, i think iframe filtering
// or handling should be done in its own transformational function, and not
// mixed-in here.

function filterFrameElements(document) {
  'use strict';
  const removeElementsBySelector = DOMModule.prototype.removeElementsBySelector;

  // Look for the presence of a frameset and lack of a body
  // element, and then remove the frameset and generate a body
  // consisting of either noframes content or an error message.

  // TODO: the replacement text should eventually be localized

  // TODO: what if noframes contains an iframe?

  let body = document.querySelector('body');
  const frameset = document.querySelector('frameset');
  if(!body && frameset) {
    const noframes = frameset.querySelector('noframes');
    body = document.createElement('body');
    if(noframes) {
      body.innerHTML = noframes.innerHTML;
    } else {
      body.textContent = 'Unable to display document due to frames.';
    }

    document.documentElement.appendChild(body);
    frameset.remove();
    return;
  }

  removeElementsBySelector(document, 'frameset, frame, iframe');
}
