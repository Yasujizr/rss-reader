// Copyright 2014 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

/**
 * Provides the calamine.transform(HTMLDocument) function that guesses at the
 * content of a document. In other words, applying lotion to soothe NLP
 * shingles.
 */
(function (exports) {
'use strict';

var INTRINSIC_BIAS = new Map([
  ['main', 100],
  ['section', 50],
  ['blockquote', 10],
  ['code', 10],
  ['content', 200],
  ['div', 10],
  ['figcaption', 10],
  ['figure', 10],
  ['ilayer', 10],
  ['layer', 10],
  ['p', 10],
  ['pre', 10],
  ['ruby', 10],
  ['summary', 10],
  ['a', -5],
  ['address', -5],
  ['dd', -5],
  ['dt', -5],
  ['h1', -5],
  ['h2', -5],
  ['h3', -5],
  ['h4', -5],
  ['h5', -5],
  ['h6', -5],
  ['small', -5],
  ['sub', -5],
  ['sup', -5],
  ['th', -5],
  ['form', -20],
  ['li', -50],
  ['ol', -50],
  ['ul', -50],
  ['font', -100],
  ['aside', -100],
  ['header', -100],
  ['footer', -100],
  ['table', -100],
  ['tbody', -100],
  ['thead', -100],
  ['tfoot', -100],
  ['nav', -100],
  ['tr', -500]
]);

var DESCENDANT_BIAS = new Map([
  ['a', -5],
  ['blockquote', 10],
  ['div', -20],
  ['h1', 10],
  ['h2', 10],
  ['h3', 10],
  ['h4', 10],
  ['h5', 10],
  ['h6', 10],
  ['li', -5],
  ['ol', -20],
  ['p', 15],
  ['pre', 10],
  ['ul', -20]
]);

var ATTRIBUTE_BIAS = new Map([
  ['about', -35],
  ['ad', -100],
  ['ads', -50],
  ['advert', -200],
  ['artext1',100],
  ['article', 200],

  ['articlecontent', 1000],
  ['articlecontentbox', 200],
  ['articleheadings', -50],
  ['attachment', 20],
  ['author', 20],
  ['block', -5],
  ['blog', 20],
  ['body', 100],
  ['bodytd', 50],
  ['bookmarking', -100],
  ['bottom', -100],
  ['brand', -50],
  ['breadcrumbs', -20],
  ['button', -100],
  ['byline', 20],
  ['caption', 10],
  ['carousel', 30],
  ['cmt', -100],
  ['cmmt', -100],
  ['colophon', -100],
  ['column', 10],
  ['combx', -20],
  ['comic', 75],
  ['comment', -500],
  ['comments', -300],
  ['commercial', -500],
  ['community', -100],
  ['component', -50],
  ['contact', -50],
  ['content', 100],
  ['contenttools', -50],
  ['contributors', -50],
  ['credit', -50],
  ['date', -50],
  ['dcsimg', -100],
  ['dropdown', -100],
  ['email', -100],
  ['entry', 100],
  ['excerpt', 20],
  ['facebook', -100],
  ['featured', 20],
  ['fn', -30],
  ['foot', -100],
  ['footer', -200],
  ['footnote', -150],
  ['ftr', -100],
  ['ftrpanel', -100],
  ['google', -50],
  ['gutter', -300],
  ['guttered', -100],
  ['head', -50],
  ['heading', -50],
  ['hentry', 150],
  ['inset', -50],
  ['insta', -100],
  ['left', -75],
  ['legende', -50],
  ['license', -100],
  ['like', -100],
  ['link', -100],
  ['links', -100],
  ['logo', -50],
  ['main', 50],
  ['mainbodyarea', 100],
  ['maincolumn', 50],
  ['masthead', -30],
  ['media', -100],
  ['mediaarticlerelated', -50],
  ['menu', -200],
  ['menucontainer', -300],
  ['meta', -50],
  ['most', -50],
  ['nav', -200],
  ['navbar', -100],
  ['navigation', -100],
  ['navimg', -100],
  ['newsletter', -100],
  ['page', 50],
  ['pagetools', -50],
  ['parse', -50],
  ['pinnion', 50],
  ['popular', -50],
  ['popup', -100],
  ['post', 100],
  ['power', -100],
  ['print', -50],
  ['promo', -200],
  ['promotions', -200],
  ['ranked', -100],
  ['reading', 100],
  ['recap', -100],
  ['recreading', -100],
  ['rel', -50],
  ['relate', -300],
  ['related', -300],
  ['relposts', -300],
  ['replies', -100],
  ['reply', -50],
  ['retweet', -50],
  ['right', -100],
  ['rightcolumn', -100],
  ['rightrail', -100],
  ['scroll', -50],
  ['share', -200],
  ['sharebar', -200],
  ['shop', -200],
  ['shout', -200],
  ['shoutbox', -200],
  ['side', -200],
  ['sig', -50],
  ['signup', -100],
  ['snippet', 50],
  ['social', -200],
  ['socialnetworking', -250],
  ['source',-50],
  ['sponsor', -200],
  ['story', 100],
  ['storydiv',100],
  ['storynav',-100],
  ['storytext', 200],
  ['storytopbar', -50],
  ['storywrap', 50],
  ['strycaptiontxt', -50],
  ['stryhghlght', -50],
  ['strylftcntnt', -50],
  ['stryspcvbx', -50],
  ['subscribe', -50],
  ['summary',50],
  ['tabs', -100],
  ['tag', -100],
  ['tagcloud', -100],
  ['tags', -100],
  ['teaser', -100],
  ['text', 20],
  ['this', -50],
  ['time', -30],
  ['timestamp', -50],
  ['title', -50],
  ['tool', -200],
  ['toptabs', -200],
  ['twitter', -200],
  ['txt', 50],
  ['utility', -50],
  ['vcard', -50],
  ['week', -100],
  ['welcome', -50],
  ['widg', -200],
  ['widget', -200],
  ['zone', -50]
]);

var forEach = Array.prototype.forEach;
var reduce = Array.prototype.reduce;
var filter = Array.prototype.filter;
var push = Array.prototype.push;

var RE_TOKEN_DELIMITER = /[\s\-_0-9]+/g;

/**
 * Applies an attribute bias to each element's score.
 * Written this way due to perf issues.
 */
function applyAttributeBias(elements, scores) {

  // TODO: support itemtype attribute values like
  // "http://schema.org/Article", "http://schema.org/NewsArticle"
  // http://schema.org/BlogPosting


  for(var i = 0, bias=0, element, length = elements.length,
    tokens = new Set(); i < length; bias = 0, tokens.clear(), i++) {
    element = elements[i];
    appendTokens(element.getAttribute('id'), tokens);
    appendTokens(element.getAttribute('name'), tokens);
    appendTokens(element.getAttribute('class'), tokens);
    appendTokens(element.getAttribute('itemprop'), tokens);
    appendTokens(element.getAttribute('role'), tokens);
    for(var it = tokens.values(), val = it.next().value; val;
      val = it.next().value) {
      bias += ATTRIBUTE_BIAS.get(val) || 0;
    }
    scores.set(element, scores.get(element) + bias);
  }
}

function appendTokens(str, set) {
  if(!str) return;
  str = str.trim();
  if(!str) return;
  str = str.toLowerCase();

  var tokens = str.split(RE_TOKEN_DELIMITER);
  for(var i = 0; i < tokens.length; i++) {
    set.add(tokens[i]);
  }
}

/**
 * Returns the best element of the document. Does some mutation
 * to the document.
 */
function transformDocument(doc, options) {
  options = options || {};

  // Pre-filter
  forEach.call(doc.body.querySelectorAll('nav, header, footer'),
    function (n) { n.remove(); });

  var elements = doc.body.getElementsByTagName('*');

  // Initialize scores
  var scores = new Map();
  scores.set(doc.documentElement, -Infinity);
  scores.set(doc.body, -Infinity);
  forEach.call(elements, function (e) { scores.set(e, 0); });

  // Count text lengths per element. The bottom up text nodes approach is
  // faster than the top down element.textContent approach.
  var charCounts = new Map();
  for(var it = doc.createNodeIterator(doc.body, NodeFilter.SHOW_TEXT),
    node = it.nextNode(), count = 0; node; node = it.nextNode()) {
    for(count = node.nodeValue.length, node = node.parentNode; node;
      node = node.parentNode) {
      charCounts.set(node, (charCounts.get(node) || 0) + count);
    }
  }

  // Derive non-nominal link-text-length from the bottom up
  var anchorChars = new Map();
  forEach.call(doc.body.querySelectorAll('a[href]'), function (anchor) {
    for(var n = charCounts.get(anchor), el = n && anchor; el;
      el = el.parentElement) {
      anchorChars.set(el, (anchorChars.get(el) || 0) + n);
    }
  });

  // Apply a bias based the number of characters and the number of characters
  // within anchors to each element's score. This "magical" formula is an
  // adaptation of a simple regression using some empirical weights.
  // Nodes with large amounts of text, that is not anchor text, get the most
  // positive bias. Adapted from "Boilerplate Detection using Shallow Text
  // Features" http://www.l3s.de/~kohlschuetter/boilerplate
  forEach.call(elements, function (e) {
    var bias = Math.min(4000, 0.25 * (charCounts.get(e) || 0) - 0.7 *
      (anchorChars.get(e) || 0));
    scores.set(e, scores.get(e) + bias);
  });



  // Special case intrinsic bias for <article> elements due to some
  // sites (e.g. Miami Herald) using it for related articles in addition
  // to the main article
  var articles = doc.body.getElementsByTagName('article');
  if(articles.length == 1) {
    scores.set(articles[0], scores.get(articles[0]) + 1000);
  } else {
    // either 0 or N
    forEach.call(articles,
      function(e) { scores.set(e, scores.get(e) + 100); });
  }

  // Apply intrinsic bias (based on the type of element itself). Certain
  // elements, such as the <article> element, have a better chance of
  // containing content.
  forEach.call(elements, function (e) {
    scores.set(e, scores.get(e) + (INTRINSIC_BIAS.get(e.localName) || 0));
  });

  // Penalize descendants of list elements. Lists are generally used for
  // boilerplate.

  forEach.call(doc.body.querySelectorAll('li *,ol *,ul *'),
    function (element) { scores.set(element, scores.get(element) - 20); });

  // Penalize descendants of navigational elements. Due to pre-filtering this
  // is largely a no-op, but pre-filtering may be disabled in the future
  forEach.call(doc.body.querySelectorAll('aside *, header *, footer *, nav *'),
    function (element) { scores.set(element, scores.get(element) - 50); });

  // Score images and image parents
  forEach.call(doc.body.getElementsByTagName('img'),
    function (image) {
    var parent = image.parentElement;
    // Avoid over-promotion of slideshow-container elements by demoting them.
    var carouselBias = reduce.call(parent.childNodes, function (bias, node) {
      return 'img' === node.localName && node !== image ? bias - 50 : bias;
    }, 0);
    // Give a bump to images that the author bothered to describe.
    // Many boilerplate images tend not to have alternative or accessibility
    // text, but many main-article images have supporting text.
    var descBias = image.getAttribute('alt') ||
      image.getAttribute('title') || (parent.localName == 'figure' &&
      parent.querySelector('figcaption')) ? 30 : 0;
    // Calculate a positive bias based on area. Larger images tend to be
    // part of the main article, particularly in the case of infographics.
    // Smaller images tend to be part of navigation and boilerplate.
    var area = image.width ? image.width * image.height : 0;
    var areaBias = 0.0015 * Math.min(100000, area);
    scores.set(image, scores.get(image) + descBias + areaBias);
    scores.set(parent, scores.get(parent) + carouselBias + descBias +
      areaBias);
  });


  // Bias the parents of certain elements. Unlike the downward
  // propagation, this only goes one level up. For example, reward
  // a div that contains the twenty p elements by a large amount.
  forEach.call(elements, function biasParent(element) {
    var bias = DESCENDANT_BIAS.get(element.localName);
    if(!bias) return;
    var parent = element.parentElement;
    scores.set(parent, scores.get(parent) + bias);
  });

  applyAttributeBias(elements, scores);

  //  ['articlebody', 1000],
  // Special case for articlebody attribute bias because ABC News uses it for
  // every element
  var articleBodies = doc.body.querySelectorAll(['id','class','name',
    'itemprop','role'].map(function(s) { return '[id*="' + s + '"]';
  }).join(','));
  if(articleBodies.length == 1) {
    //console.debug('single element with articlebody attribute value');
    scores.set(articleBodies[0], scores.get(articleBodies[0]) + 1000);
  } else {
    // console.debug('0 or multiple elements with articlebody attribute value');
    forEach.call(articleBodies,
      function(e) { scores.set(e, scores.get(e) + 100); });
  }


  // Expose attributes for debugging
  if(options.EXPOSE_ATTRIBUTES) {
    var docElements = doc.documentElement.getElementsByTagName('*');
    forEach.call(docElements, function expose(element) {
      var cc = options.SHOW_CHAR_COUNT && charCounts.get(element);
      cc && element.setAttribute('cc', cc);
      var acc = options.SHOW_ANCHOR_CHAR_COUNT && anchorChars.get(element);
      acc && element.setAttribute('acc', acc);
      var score = options.SHOW_SCORE && scores.get(element);
      score && element.setAttribute('score', score);
    });
  }

  // Find and return the highest scoring element, defaulting to body
  return reduce.call(elements, function compareScore(max, current) {
    return scores.get(current) > scores.get(max) ? current : max;
  }, doc.body);
}

// Public API
exports.calamine = {
  // todo: rename public function to 'rub'?
  transform: transformDocument
};

}(this));
