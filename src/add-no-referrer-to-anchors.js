// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

// TODO: use for..of
// TODO: doc why this is done or refer to some documentation url
// because attrs are stripped from the doc this has to be called after that
// or it otherwise is a waste

function add_no_referrer_to_anchors(document) {
  const anchors = document.querySelectorAll('a');
  for(let i = 0, len = anchors.length; i < len; i++) {
    let anchor = anchors[i];
    anchor.setAttribute('rel', 'noreferrer');
  }
}
