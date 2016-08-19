// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

{ // Begin file block scope

const SELECTOR = [
  'hr + hr', // consecutive hrs
  'ul > hr', // hierarchy error
  'ol > hr' // hierarchy error
].join(',');

this.filter_hr_elements = function(document) {
  const elements = document.querySelectorAll(SELECTOR);
  for(let i = 0, len = elements.length; i < len; i++) {
    elements[i].remove();
  }
};

} // End file block scope
