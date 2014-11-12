// Copyright 2014 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

/**
 * Provides the calamine.transform(HTMLDocument) function that guesses at the
 * content of a document. In other words, applying lotion to soothe NLP
 * shingles.
 *
 * TODO: express everything as probability. Use a scale of 0 to 100
 * to represent each element's likelihood of being useful content, where
 * 100 is most likely. Every blcok gets its own probability score. Then
 * iteratively backfrom from a threshold of something like 50%. Or instead
 * of blocks weight the elements and use the best element approach again,
 * where probability means the likelihood of any given element being the
 * best element, not whether it is content or boilerplate.
 *
 * TODO: maybe use a single bias function and just extract features prior to that
 */
(function (exports) {
'use strict';

var forEach = Array.prototype.forEach;
var reduce = Array.prototype.reduce;

/**
 * Returns the best element of the document. Does some mutation to the
 * document.
 */
function transform(doc, options) {
  options = options || {};

  if(options.FILTER_NAMED_AXES) {
    BLACKLIST_SELECTORS.forEach(function detachSelector(selector) {

      // Note: Ideally, a block-based approach would avoid the need
      // for this step but the current best element approach effectively requires
      // it. These selectors target boilerplate typically found in the best
      // element, after processing, but are applied before processing to reduce the
      // amount of elements considered and reduce error. Most of the selectors are
      // conservative to avoid filtering non-boilerplate
      // Currently consumes approximately 50-70% of the processing time,
      // 100% of which is the nested call to querySelector
      // TODO: try a form of visitor pattern instead of querySelector, benchmark
      // TODO: try querySelectorAll+contains instead of querySelector loop

      // querySelector is used instead of querySelectorAll this avoids the need
      // to check doc.contains(element) per iteration
      var root = doc.body;
      var element = root.querySelector(selector);
      while(element) {
        element.remove();
        element = root.querySelector(selector);
      }
    });
  }

  var elements = doc.body.getElementsByTagName('*');
  var scores = initScores(doc, elements);
  applyTextLengthBias(doc, elements, scores, options.ANNOTATE);
  applyIntrinsicBias(doc, elements, scores, options.ANNOTATE);
  applyDownwardBias(doc, scores, options.ANNOTATE);
  applyUpwardBias(elements, scores, options.ANNOTATE);
  applyImageBias(doc, scores, options.ANNOTATE);
  applyAttributeBias(doc, scores);
  maybeExposeAttributes(doc, scores, options.ANNOTATE);
  return findBestElement(doc, elements, scores);
}

function initScores(doc, elements) {
  var scores = new Map();
  scores.set(doc.documentElement, 0);
  scores.set(doc.body, 0);
  forEach.call(elements, function (element) { scores.set(element, 0); });
  return scores;
}

function collectTextNodeLengths(doc) {
  var lengths = new Map(), length = 0, node = null;
  var it = doc.createNodeIterator(doc.body, NodeFilter.SHOW_TEXT);
  while(node = it.nextNode()) {
    length = node.nodeValue.trim().length;
    if(!length) continue;
    while(node = node.parentNode) {
      lengths.set(node, (lengths.get(node) || 0) + length);
    }
  }

  return lengths;
}

/**
 * Aggregate the count of text within non-nominal anchors within ancestors.
 */
function collectAnchorElementTextLengths(doc, charCounts) {
  var anchors = doc.body.querySelectorAll('a[href]');
  return reduce.call(anchors, function (map, anchor) {
    var count = charCounts.get(anchor);
    return count ? [anchor].concat(getAncestors(anchor)).reduce(function(map,
      element) {
      return map.set(element, (map.get(element) || 0) + count);
    }, map) : map;
  }, new Map());
}

/**
 * Apply a bias based the number of characters and the number of characters
 * within anchors to each element's score.
 *
 * Adapted from "Boilerplate Detection using Shallow Text Features"
 * http://www.l3s.de/~kohlschuetter/boilerplate
 */
function applyTextLengthBias(doc, elements, scores, annotate) {

  var charCounts = collectTextNodeLengths(doc);
  var anchorChars = collectAnchorElementTextLengths(doc, charCounts);

  forEach.call(elements, function handleElement(element) {
    var cc = charCounts.get(element);
    if(!cc) return;
    var acc = anchorChars.get(element) || 0;
    var bias = (0.25 * cc) - (0.7 * acc);
    // Tentative
    bias = Math.min(4000, bias);
    scores.set(element, scores.get(element) + bias);

    if(annotate) {
      element.dataset.textChars = cc;
      if(acc) element.dataset.anchorChars = acc;
      element.dataset.textBias = bias.toFixed(2);
    }
  });
}

/**
 * Apply an intrinsic bias (based on the type of element itself)
 */
function applyIntrinsicBias(doc, elements, scores, annotate) {
  forEach.call(elements, function (element) {
    var bias = INTRINSIC_BIAS.get(element.localName);
    if(!bias) return;
    scores.set(element, scores.get(element) + bias);
    if(annotate) element.dataset.intrinsicBias = bias;
  });

  // Pathological case for article element
  var articles = doc.body.getElementsByTagName('article');
  if(articles.length == 1) {
    var article = articles[0];
    if(annotate) article.dataset.intrinsicBias = 1000;
    scores.set(article, scores.get(article) + 1000);
  } else {
    // There are either 0 or multiple article elements. Since divs get
    // +200 intrinsic, we have to give the article elements a competitive
    // baseline, so inflate them all here. Otherwise child divs of the main
    // article sometimes mistakenly beat out the actual article element.
    // NOTE: we could simply shove article back into INTRINSIC BIAS map
    forEach.call(articles, function(article) {
      if(annotate) article.dataset.intrinsicBias = 200;
      scores.set(article, scores.get(article) + 200);
    });
  }
}

function applyDownwardBias(doc, scores, annotate) {
  // Penalize list and list-like descendants
  var SELECTOR_LIST = 'li *, ol *, ul *, dd *, dl *, dt *';
  var listDescendants = doc.body.querySelectorAll(SELECTOR_LIST);

  forEach.call(listDescendants, function (element) {
    if(annotate) element.dataset.inListPenaltyBias = -100;
    scores.set(element, scores.get(element) - 100);
  });

  // Penalize descendants of navigational elements
  var SELECTOR_NAV = 'aside *, header *, footer *, nav *';
  var navDescendants = doc.body.querySelectorAll(SELECTOR_NAV);
  forEach.call(navDescendants, function (element) {
    if(annotate) element.dataset.inNavPenaltyBias = -50;
    scores.set(element, scores.get(element) - 50);
  });
}

// Bias the parent of certain elements
function applyUpwardBias(elements, scores, annotate) {

  // NOTE: http://www.thestate.com/2014/10/24/3765557/udalls-effort-to-woo-women-voters.html
  // Because we only bias immediate parent, the typical case is that a child div that is
  // not the target div gets the highest score.
  // But if we go up to far we end up matching too much and may as well just consider the body
  // element to be the best element.
  // This doesnt actually solve it because the negatives also propagate and the target does
  // not become actual in the above test url
  // Maybe the leading image needs to propagate to parent also?
  forEach.call(elements, function (element) {
    var bias = DESCENDANT_BIAS.get(element.localName);
    if(!bias) return;
    var parent = element.parentElement;
    // note the subtlety here, we are annotating parent, not element
    if(annotate) parent.dataset.descendantBias = bias;
    scores.set(parent, scores.get(parent) + bias);
    // Testing
    //var grandParent = parent.parentElement;
    //var grandParentScore = scores.get(grandParent);
    //var gpBias = bias * 0.8;
    //console.log('Increasing grand parent bias by %s', gpBias);
    //scores.set(grandParent, grandParentScore + gpBias);
  });
}

// Score images and image parents
function applyImageBias(doc, scores, annotate) {
  var images = doc.body.getElementsByTagName('img');
  forEach.call(images, function (image) {
    var parent = image.parentElement;
    // Avoid over-promotion of slideshow-container elements
    var carouselBias = reduce.call(parent.childNodes, function (bias, node) {
      return 'img' === node.localName && node !== image ? bias - 50 : bias;
    }, 0);
    // TODO: this should probably also check data-alt and data-title as many
    // sites use this alternate syntax
    var descBias = image.getAttribute('alt') ||  image.getAttribute('title') ||
      getImageCaption(image) ? 30 : 0;
    var area = image.width ? image.width * image.height : 0;
    var areaBias = 0.0015 * Math.min(100000, area);
    var imageBias = carouselBias + descBias + areaBias;
    if(!imageBias) return;
    if(annotate) {
      parent.dataset.imageBias = imageBias;
    }
    scores.set(parent, scores.get(parent) + imageBias);
  });
}

// Conditionally expose attributes for debugging
function maybeExposeAttributes(doc, scores, annotate) {
  if(!annotate) return;

  forEach.call(doc.documentElement.getElementsByTagName('*'), function (element) {
    var score = scores.get(element);
    if(!score) return;
    element.dataset.score = score.toFixed(2);
  });
}

function findBestElement(doc, elements, scores) {
  var maxElement = doc.body;
  var maxScore = scores.get(maxElement);
  var numElements = elements.length;
  var currentElement = null;
  var currentScore = 0;

  for(var i = 0; i < numElements; i++) {
    currentElement = elements[i];
    currentScore = scores.get(currentElement);

    if(currentScore > maxScore) {
      maxScore = currentScore;
      maxElement = currentElement;
    }
  }

  return maxElement;
}

function arrayFind(array, predicate) {
  for(var i = 0, length = array.length, value; i < length; i++) {
    if(predicate(array[i]))
      return array[i];
  }
}

function isFigure(element) {
  return element.localName == 'figure';
}

function getImageCaption(image) {
  // NOTE: figcaption may contain other elements, not
  // just text. So this just checks for whether there is
  // a figcaption element, not whether it has any content
  var parents = getAncestors(image);
  var figure = arrayFind(parents, isFigure);
  if(figure) {
    return figure.querySelector('figcaption');
  }
}

// Walks upward
function getAncestors(element) {
  var parents = [], parent = element;
  while(parent = parent.parentElement) {
    parents.push(parent);
  }
  return parents;
}

/**
 * Splits attribute value into tokens
 * TODO: split on case-transition (lower2upper,upper2lower)
 */
function tokenize(string) {
  var tokens = string.toLowerCase().split(/[\s\-_0-9]+/g).filter(identity);
  var set = new Set(tokens);
  return setToArray(set);
}

function identity(value) {
  return value;
}

function setToArray(set) {

  // Chrome does not support Array.from
  // The Moz polyfill example does something I don't
  // understand, something baout
  // var obj = Object(set);
  // then iterate over ks and vs

  var array = [];
  set.forEach(function(v) {
    array.push(v);
  });
  return array;
}

var SCORABLE_ATTRIBUTES = ['id', 'name', 'class', 'itemprop', 'itemtype', 'role'];

function getAttributeBias(element) {
  var values = SCORABLE_ATTRIBUTES.map(function asValue(name) {
    return name == 'itemtype' ? getItemTypePath(element) :
      element.getAttribute(name);
  }).filter(identity);
  var tokens = tokenize(values.join(' '));
  return tokens.reduce(function add(sum, value) {
    return sum + ATTRIBUTE_BIAS.get(value) || 0;
  }, 0);
}

/**
 * Applies an attribute bias to each element's score.
 *
 * TODO: itemscope
 * TODO: itemtype 'article' id/class issue
 */
function applyAttributeBias(doc, scores) {
  var SCORABLE_SELECTOR = 'a, aside, div, dl, figure, h1, h2, h3, h4,'+
    ' ol, p, section, span, ul';
  var elements = doc.body.querySelectorAll(SCORABLE_SELECTOR);
  forEach.call(elements, function (element) {
    scores.set(element, scores.get(element) + getAttributeBias(element));
  });

  // Pathological cases
  // TODO: article_body (E-Week)
  // TODO: the tests for a single 'article' element should not be
  // exclusive. We want 'one' possible way of promoting greatly. If there
  // is an article element, and a single div class='article' element,
  // then only one element should get promoted? For now it is not too
  // important.
  var articleClass = doc.body.getElementsByClassName('article');
  if(articleClass.length == 1) {
    scores.set(articleClass[0], scores.get(articleClass[0]) + 1000);
  }

  var articleAttributes =  ['id', 'class', 'name', 'itemprop', 'role'].map(
    function(s) { return '['+s+'*="articlebody"]'; });
  articleAttributes.push('[role="article"]'); // Google Plus
  articleAttributes.push('[itemtype="http://schema.org/Article"]');

  var SELECT_ARTICLE = articleAttributes.join(',');
  var articles = doc.body.querySelectorAll(SELECT_ARTICLE);
  if(articles.length == 1) {
    scores.set(articles[0], scores.get(articles[0]) + 1000);
  } else {
    // TODO: why promote any of these? Because maybe one of them
    // is the actual article?
    forEach.call(articles, updateScore.bind(null, scores, 100));
  }
}

// Returns the path part of itemtype attribute values
function getItemTypePath(element) {
  // http://schema.org/Article
  // http://schema.org/NewsArticle
  // http://schema.org/BlogPosting
  // http://schema.org/Blog
  // http://schema.org/WebPage
  // http://schema.org/TechArticle
  // http://schema.org/ScholarlyArticle
  var value = element.getAttribute('itemtype');
  if(!value) return;
  value = value.trim();
  if(!value) return;
  var lastSlashIndex = value.lastIndexOf('/');
  if(lastSlashIndex == -1) return;
  var path = value.substring(lastSlashIndex + 1);
  return path;
}

/**
 * Updates the score of an element by adding in delta
 */
function updateScore(scores, delta, element) {
  var score = scores.get(element);
  scores.set(element, score + delta);
}

function findArticleTitle(doc) {

  // Check head-title
  // Check meta? Like OGP?
  // Check H1s and such in body
  // Promote earlier elements

  // As an aside, in-article titles are often within or preceding the same
  // element as the best element. If the title is outside the best element
  // then maybe it is a sign the best element should be expanded
}

/**
 * Tries to clean up a title string by removing publisher info
 *
 * TODO: support publisher as prefix
 */
function stripTitlePublisher(title) {

  if(!title) return;
  // The extra spaces are key to avoiding truncation of hyphenated terms
  var delimiterPosition = title.lastIndexOf(' - ');
  if(delimiterPosition == -1)
    delimiterPosition = title.lastIndexOf(' | ');
  if(delimiterPosition == -1)
    delimiterPosition = title.lastIndexOf(' : ');
  if(delimiterPosition == -1)
    return title;
  var trailingText = title.substring(delimiterPosition + 1);
  var terms = trailingText.split(/\s+/).filter(identity);
  if(terms.length < 5) {
    var newTitle = title.substring(0, delimiterPosition).trim();
    return newTitle;
  }
  return title;
}

function identity(value) {
  return value;
}

/**
 * An element's score is biased according to the type of the element. Certain
 * elements are more or less likely to contain boilerplate. The focus here
 * is not assessing whether each element contains boilerplate or not, but how
 * likely could the elementy type serve as the target element.
 *
 * TODO: if the focus is on best element I have no idea what I was thinking
 * here. There are only maybe 5-6 likely elements and everything else
 * is very unlikely. <div> is the most likely. I think this is just remnant
 * of the block-based scoring approach
 */
var INTRINSIC_BIAS = new Map([
  ['main', 100],
  ['section', 50],
  ['blockquote', 10],
  ['code', 10],
  ['content', 200],
  ['div', 200],
  ['figcaption', 10],
  ['figure', 10],
  ['ilayer', 10],
  ['layer', 10],
  ['p', 10],
  ['pre', 10],
  ['ruby', 10],
  ['summary', 10],
  ['a', -500],
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

/**
 * Immediate parents of these elements receive a bias. For example, a <div>
 * that contains several <p>s receives a very positive bias, because that
 * <div> is more likely to be the target
 */
var DESCENDANT_BIAS = new Map([
  ['a', -5],
  ['blockquote', 20],
  ['div', -50],
  ['figure', 20],
  ['h1', 10],
  ['h2', 10],
  ['h3', 10],
  ['h4', 10],
  ['h5', 10],
  ['h6', 10],
  ['li', -5],
  ['ol', -20],
  ['p', 30],
  ['pre', 10],
  ['ul', -20]
]);

/**
 * Each element receives a bias according to the values of its attributes, such
 * as its id, class, name, itemtype, itemprop, and role. These are individual,
 * lowercase tokens that are generally found in the attribute values. They
 * are written to match up to the tokens generated by splitting using
 * RE_TOKEN_DELIMITER.
 */
var ATTRIBUTE_BIAS = new Map([
  ['about', -35],
  ['ad', -100],
  ['ads', -50],
  ['advert', -200],
  ['artext1',100],
  ['articles', 100],
  ['articlecontent', 1000],
  ['articlecontentbox', 200],
  ['articleheadings', -50],
  ['articlesection', 200],
  ['articlesections', 200],
  ['attachment', 20],
  ['author', 20],
  ['block', -5],
  ['blog', 20],
  ['blogpost', 500], // Seen as itemprop value
  ['blogposting', 500],
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
  ['complementary', -100], // Seen as role
  ['component', -50],
  ['contact', -50],
  ['content', 100],
  ['contentpane', 200], // Google Plus
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
  ['header', -100],
  ['heading', -50],
  ['hentry', 150], // Common wordpress class, and microformat
  ['hnews', 200], // Common wordpress class
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
  ['mainnav', -500],
  ['mainnavigation', -500],
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
  ['newsarticle', 500],
  ['newscontent', 500],
  ['newsletter', -100],
  ['next', -300],
  ['page', 50],
  ['pagetools', -50],
  ['parse', -50],
  ['pinnion', 50],
  ['popular', -50],
  ['popup', -100],
  ['post', 150],
  ['power', -100],
  ['prev', -300],
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
  ['socialtools', -200],
  ['source',-50],
  ['sponsor', -200],
  ['story', 100],
  ['storycontent', 500],
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
  ['topheader', -300],
  ['toptabs', -200],
  ['twitter', -200],
  ['txt', 50],
  ['utility', -50],
  ['vcard', -50],
  ['week', -100],
  ['welcome', -50],
  ['widg', -200],
  ['widget', -200],
  ['wnstorybody', 1000],
  ['zone', -50]
]);

/**
 * Hardcoded template-based selectors that are very likely to contain
 * boilerplate. Empirically collected.
 * TODO: BLACKLIST_SELECTORS should be a Set to demonstrate and enforce
 * uniqueness of keys
 * NOTE: cannot use 'div.share'
 */
var BLACKLIST_SELECTORS = [
  'a.aggregated-rel-link', // // The Oklahoman
  'a.carousel-control', // The Miami Herald
  'a.commentLink', // Salt Lake Tribune
  'a.comments', // Good Magazine
  'a.dsq-brlink', // USA Today
  'a.enlargebtn', // NPR
  'a.hdn-analytics', // SF Gate
  'a[href^="http://ad.doubleclick"]', // Medium
  'a[href*="socialtwist"]', // The Jewish Press
  'a.meta-comments', // Windows Central
  'a.modal-trigger', // NY Post
  'a.more-tab', // The Oklahoman
  'a.nextPageLink', // Salt Lake Tribune
  'a.post_cmt1', // Times of India
  'a.readmore-link', // Topix
  'a[rel="tag"]', // // The Oklahoman
  'a.twitter-follow-button', // Ha'Aretz
  'a.twitter-share-button', // The Jewish Press
  'a.synved-social-button', // Viral Global News
  'a.skip-to-text-link', // NYTimes
  'article div.extra', // Washington Post
  'article ul.listing', // Good Magazine
  'aside.itemAsideInfo', // The Guardian
  'aside#asset-related', // St. Louis Today
  'aside.bg-related', // The Boston Globe
  'aside#bpage_ad_bottom', // BuzzFeed
  'aside[data-panelmod-type="relatedContent"]', // LA Times
  'aside.callout', // The Atlantic
  'aside.entry-sidebar', // The Globe
  'aside.livefyre-comments', // Vanity Fair
  'aside.meta_extras', // Japan Times
  'aside.marginalia', // NY Times
  'aside.mashsb-container', // cryptocoinsnews.com
  'aside#post_launch_success', // BuzzFeed
  'aside.prev-next', // The Economist
  'aside.related-articles', // BBC
  'aside.related-content', // // The Oklahoman
  'aside#related-content-xs', // The Miami Herald
  'aside.related-side', // NY Magazine
  'aside.right-rail-module', // Time
  'aside#secondary-rail', // Dispatch.com
  'aside.see-also', // The Root
  'aside#sidebar', // TechSpot
  'aside#sidebar-read-more', // USA Today
  'aside#story-related-topics', // AV Web
  'aside.story-right-rail', // USA Today
  'aside.tools', // The Boston Globe
  'aside.vestpocket', // Forbes
  'aside.views-tags', // BuzzFeed
  'aside.widget-area', // thedomains.com
  'b.toggle-caption', // NPR
  'div#a-all-related', // New York Daily News
  'div.about-the-author', // SysCon Media
  'div.actions-panel', // SysCon Media
  'div.ad', // Reuters
  'div.adAlone300', // The Daily Herald
  'div.adarea', // Telegraph
  'div.ad-cluster-container', // TechCrunch
  'div.ad-container', // Fox News
  'div.additional-stories', // Vanity Fair
  'div.addthis_toolbox', // NobelPrize.org
  'div.adCentred', // The Sydney Morning Herald
  'div.adjacent-entry-pagination', // thedomains.com
  'div#addshare', // The Hindu
  'div.admpu', // Telegraph UK
  'div.adsense', // Renew Economy
  'div.ad-unit', // TechCrunch
  'div.advertisementPanel', // TV New Zealand
  'div.am-ctrls', // Investors.com
  'div[aria-label="+1 this post"]', // Google Plus
  'div.artbody > div.share', // China Topix
  'div.art_tabbed_nav', // The Wall Street Journal (blog)
  'div.articleAutoFooter', // NECN
  'div.article div.columnsplitter', // CTV News
  'div#article div.share', // timeslive.co.za
  'div.article div.short-url', // Politico
  'div.article div.tags', // Politico
  'div.article div#media', // Newsday
  'div.article_actions', // Forbes
  'div.article-actions', // Ottawa Citizen
  'div.article_cat', // Collegian
  'div#article_comments', // Fort Worth Star Telegram
  'div.article_comments', // Voice of America
  'div.article-comments', // Times of India
  'div.articleComments', // Reuters
  'div#articleIconLinksContainer', // The Daily Mail
  'div.article-social', // Fortune Magazine
  'div.articleEmbeddedAdBox', // Mercury News
  'div.article-extra', // TechCrunch
  'div.article-footer', // Windows Central
  'div.article_footer', // Bloomberg
  'div.article_interaction', // Bloomberg
  'div[data-vr-zone="You May Like"]', // Voice of America
  'div.article-list', // // The Oklahoman
  'div#articleKeywords', // The Hindu
  'div.articleMeta', // Tampa Bay
  'div.articleOptions', // Mercury News
  'div#articlepagerreport', // Chron.com
  'div.article-pagination', // UT San Diego
  'div.article-print-url', // USA Today
  'div.articleRelates', // Baltimore Sun
  'div.articleServices', // Ha'Aretz
  'div.articleShareBottom', // Fox Sports
  'div.article-side', // The Times
  'div.article_social', // Bloomberg
  'div.article-social-actions', // Windows Central
  'div.articleSponsor', // Telegraph Co Uk
  'div.article-tags', // entrepeneur.com
  'div.article-text div.fullArticle', // Intl Business Times UK
  'div.article-tips', // 9News
  'div.articleTools', // Reuters
  'div.article-tools', // The Atlantic
  'div.article-utilities', // Sports Illustrated
  'div.articleViewerGroup', // Mercury News
  'div.artOtherNews', // Investors.com
  'div.assetBuddy', // Reuters
  'div.at-con', // Design & Trend
  'div.at-next', // Design & Trend
  'div.at-tag', // Design & Trend
  'div.at-tool', // Design & Trend
  'div#author-byline', // NY Post
  'div.author_topics_holder', // The Irish Times
  'div.author-wrap', // Recode
  'div.author-info', // Streetwise
  'div[data-ng-controller="bestOfMSNBCController"]', // MSNBC
  'div.bio-socials', // Atomic Object
  'div.bizPagination', // Bizjournal
  'div.bk-socialbox', // Latin Post
  'div#blq-foot', // BBC
  'div#block-disqus-disqus_comments', // Foreign Affairs
  'div#block-fa-cfrlatest', // Foreign Affairs
  'div#block-fa-related', // Foreign Affairs
  'div#blog-sidebar', // Comic Book Resources
  'div#blox-breadcrumbs', // Joplin
  'div#blox-comments', // National Standard
  'div#blox-footer', // Joplin
  'div#blox-header', // Joplin
  'div#blox-right-col', // Joplin
  'di#blox-breadcrumbs', // Joplin
  'div#bottom-rail', // Vanity Fair
  'div.bookmarkify', // Kamens Blog
  'div.bpcolumnsContainer', // Western Journalism
  'div#breadcrumb', // Autonews
  'div.breadcrumb_container', // NBC News
  'div#breadcrumbs', // E-Week
  'div.breadcrumbs', // Scientific American
  'div.browse', // ABC News
  'div.bt-links', // Learning and Finance
  'div[bucket-id="most_popular_01"]', // Telegraph/Reuters
  'div[bucket-id="secondary_navigation_01"]', // Telegraph/Reuters
  'div.buying-option', // Times of India
  'div.byline', // Misc, but the only way to identify Autonews
  'div.byline_links', // Bloomberg
  'div.bylineSocialButtons', // Telegraph Co Uk
  'div.byline-wrap', // The Wall Street Journal
  'div.card-stats', // WFPL
  'div.category-nav', // Sparkfun
  'div#ce-comments', // E-Week
  'div.cmtLinks', // India Times
  'div.cnn_strybtntools', // CNN
  'div.cnn_strylftcntnt', // CNN
  'div.cnn_strycntntrgt', // CNN
  'div.cn_reactions_comments', // Vanity Fair
  'div#commentary', // Autonews
  'div#comment_bar', // Autonews
  'div#commentBar', // Newsday
  'div.comment_bug', // Forbes
  'div#comment-container', // auburnpub.com
  'div#commentblock', // Learning and Finance
  'div.commentCount', // Reuters
  'div.comment-count', // auburnpub.com
  'div.comment-count-block',// TechSpot
  'div.comment_count_affix', // // The Oklahoman
  'div.commentDisclaimer', // Reuters
  'div.comment-holder', // entrepeneur.com
  'div#commenting', // Fox News
  'div#commentLink', // // The Oklahoman
  'div#comment-list', // Bangkok Post
  'div#comment-reply-form', // Sparkfun
  'div#comments', // CBS News
  'div.comments', // TechCrunch
  'div.comments-box', // Freakonomics
  'div#commentslist', // The Jewish Press
  'div#comment_sign', // Ace Showbiz
  'div#comments-tabs', // Houston News
  'div.commentThread', // kotatv
  'div.comment-tools', // Latin post
  'div.comment_links', // Forbes
  'div.comments-overall', // Aeon Magazine
  'div.comment-policy-box', // thedomains.com
  'div#commentPromo', // Salt Lake Tribune
  'div.commentWrap', // Corcodillos
  'div.component-share', // Sports Illustrated
  'div#content-below', // SysCon Media
  'div.content_column2_2', // VOA News
  'div.content-tools', // Time Magazine
  'div.contribution-stats-box', // Knight News Challenge
  'div.control-bar', // SF Gate
  'div.controls', // NY Daily News
  'div.correspondant', // CBS News
  'div.cqFeature', // Vanity Fair
  'div.css-sharing', // Topix
  'div#ctl00_ContentPlaceHolder1_UC_UserComment1_updatePanelComments', // Ahram
  'div#dailydot-socialbar', // Daily Dot
  'div[data-module-zone="articletools_bottom"]', // The Wall Street Journal
  'div[data-ng-controller="moreLikeThisController"]', // MSNBC
  'div.dfad', // thedomains.com
  'div.dfinder_cntr', // Hewlett Packard News
  'div#dfp-ad-mosad_1-wrapper', // The Hill
  'div#digital-editions', // The New Yorker
  'div#disqus', // ABCNews
  'div#disqusAcc', // Telegraph Co Uk
  'div#disqus_thread', // Renew Economy
  'div.dmg-sharing', // Dispatch.com
  'div.editorsChoice', // Telegraph Co Uk
  'div.editorsPick', // India Times
  'div.editors-picks', // The Wall Street Journal
  'div.email-optin', // Quantstart
  'div#email-sign-up', // BBC
  'div.email-signup', // entrepeneur.com
  'div.encrypted-content', // Atlantic City Press
  'div.endslate', // WFMY News (final slide element)
  'div.entity_popular_posts', // Forbes
  'div.entity_preview', // Forbes
  'div.entity_recent_posts', // Forbes
  'div.entry-listicles', // CBS
  'div.entry-meta', // Re-code (uncertain about this one)
  'div.entry-related', // The Globe
  'div#entry-tags', // hostilefork
  'div.entry-tags', // Wired.com
  'div.entry-toolbar', // CBS
  'div.entry-unrelated', // The New Yorker
  'div#epilogue', // hostilefork
  'div.essb_links', // Beta Wired
  'div#et-sections-dropdown-list', // The Washington Post
  'div#external-source-links', // Daily Mail UK
  'div.extra-services', // ARXIV
  'div.fblike', // Ha'Aretz
  'div.feature-btns', // USA Today (assumes video not supported)
  'div.feature_nav', // E-Week
  'div#features', // BBC News
  'div.field-name-field-tags', // WFPL
  'div.first-tier-social-tools', // Time Magazine
  'div.followable_block', // Forbes
  'div.follow-authors', // Politico
  'div.follow-us', // Fox News
  'div.footer', // KMBC
  'div#footer', // Newsday
  'div.footerlinks', // VOA News
  'div#forgotPassword', // Joplin Globe
  'div#forgotPasswordSuccess', // Joplin Globe
  'div.gallery-sidebar-ad', // USA Today
  'div.gallery-overlay-outter', // SF Gate
  'div#gkSocialAPI', // The Guardian
  'div.googleads', // Telegraph UK
  'div.group-link-categories', // Symmetry Magazine
  'div.group-links', // Symmetry Magazine
  'div.gsharebar', // entrepeneur.com
  'div.hashtags', // Good Magazine
  'div.headlines', // // The Oklahoman
  'div.headlines-images', // ABC 7 News
  'div.hide-for-print', // NobelPrize.org
  'div.hst-articlefooter', // Chron.com
  'div.hst-articletools', // Chron.com
  'div.hst-blockstates', // Stamford Advocate (may be problematic)
  'div.hst-featurepromo', // Seattle Pi
  'div.hst-freeform', // Chron.com
  'div.hst-headlinelist', // Chron.com
  'div.hst-hottopics', // Chron.com
  'div.hst-modularlist', // Chron.com
  'div.hst-morestories', // Chron.com
  'div.hst-mostpopular', // Seattle Pi
  'div.hst-newsgallery', // Stamford Advocate
  'div.hst-othernews', // Stamford Advocate
  'div.hst-relatedlist', // Seattle Pi
  'div.hst-simplelist', // Chron.com
  'div.hst-siteheader', // Seattle Pi
  'div.hst-slideshowpromo', // Seattle Pi
  'div.htzTeaser', // Ha'Aretz
  'div.ib-collection', // KMBC
  'div.icons', // Brecorder
  'div.icons_inner', // Ahram
  'div#infinite-list', // The Daily Mail
  'div#inlineAdCont', // Salt Lake Tribune
  'div.inline-sharebar', // CBS News
  'div.inline-share-tools-asset', // USA Today
  'div.inline-related-links', // Gourmet.com
  'div.inner-related-article', // Recode
  'div#inset_groups', // Gizmodo
  'div.insettwocolumn', // NPR
  'div.interactive-sponsor', // USA Today
  'div.issues-topics', // MSNBC
  'div[itemprop="comment"]',// KMBC
  'div#jp-relatedposts', // IT Governance USA
  'div.j_social_set', // MSNBC (embedded share links)
  'div#latest-by-section', // Houston News
  'div.latest-stories', // Vanity Fair
  'div.LayoutSocialTools', // ecdc.europa.eu
  'div.LayoutTools', // ecdc.europa.eu
  'div#leader', // hostilefork
  'div.lhs_relatednews', // NDTV
  'div.like-share', // Bangkok Post
  'div.likeus', // Good Magazine
  'div.linearCalendarWrapper', // ABC News
  'div.link-list-inline', // Las Vegas Sun
  'div#livefyre-wrapper', // The Wall Street Journal
  'div.ljcmt_full', // LiveJournal
  'div.ljtags', // LiveJournal
  'div.load-comments', // entrepeneur.com
  'div.l-sidebar', // TechSpot
  'div.l-story-secondary', // Boston.com
  'div.main > div#rail', // Fox News
  'div#main-content > div.share', // Knight News Challenge
  'div.main_social', // Times of India
  'div#main div#secondary', // Newsday
  'div.m-article__share-buttons', // The Verge
  'div.mashsharer-box', // internetcommerce.org
  'div.m-entry__sidebar', // The Verge
  'div.menu', // CNBC
  'div#mergeAccounts', // Joplin Globe
  'div.meta_bottom', // Collegian
  'div#meta-related', // Entertainment Weekly
  'div#mc_embed_signup', // stgeorgeutah.com
  'div.m-linkset', // The Verge
  'div.middle-ads', // The Times
  'div.minipoll', // Topix
  'div.mla_cite', // NobelPrize.org
  'div.mmn-link', // ABC 7 News
  'div.mobile-button', // Ha'Aretz
  'div.modComments', // Investors.com
  'div.module__biz-pulse', // Bizjournal
  'div.mod-video-playlist', // ESPN
  'div#more-on', // NY Post
  'div.more-single', // USA Today
  'div.moreweb', // Uptown Magazine
  'div#most-popular', // BBC
  'div.most-popular', // Vanity Fair
  'div#mostPopularTab', // Reuters
  'div#most-read-news-wrapper', // The Daily Mail
  'div#mostSharedTab', // Reuters
  'div#most-watched-videos-wrapper', // The Daily Mail
  'div.mTop15', // Times of India
  'div.multiplier_story', // Christian Science Monitor
  'div.nav', // KMBC (note: may be problematic)
  'div.navigation', // Renew Economy (may be problematic)
  'div#newsletterList', // E-Week
  'div#newsletter_signup_article', // People Magazine
  'div.newsletterSignupBox', // NBC
  'div.newsreel', // The Wall Street Journal
  'div.next_on_news', // BuzzFeed
  'div#next_post', // Ace Showbiz
  'div#nlHeader', // E-Week
  'div.node-footer', // Drupal
  'div.node-metainfo', // The Boston Herald
  'div.NotifyUserBox', // Bangkok Post
  'div.npRelated', // National Post
  'div.NS_projects__project_share', // Kickstarter
  'div.Other-stories ', // Bangkok Post
  'div.overlayPostPlay', // The Sydney Morning Herald
  'div.page_label', // Hewlett Packard News
  'div#page-nav', // Uptown Magazine
  'div.page-navigation', // Misc.
  'div.page-tools', // Channel News Asia
  'div.pagination', // Investors.com
  'div.pane-explore-issues-topics', // MSNBC
  'div.par-y_rail', // Vanity Fair
  'div.pb-f-page-comments', // Washington Post
  'div.pfont', // Newsday
  'div.pin-it-btn-wrapper', // US Prison Culture
  'div.pl-most-popular', // entrepeneur.com
  'div#popular-by-section', // Houston News
  'div#popup', // Times of India
  'div.postcats', // The Wall Street Journal (blog)
  'div.postcommentpopupbox', // Times of India
  'div.post-comments', // The Sun Times
  'div.post-links', // Pro Football Talk
  'div.postmeta', // Windows Central
  'div.post-meta-category', // Comic Book Resources
  'div.post-meta-share', // Comic Book Resources
  'div.post-meta-tags', // Comic Book Resources
  'div.post-meta-taxonomy-terms', // The Sun Times
  'div.postnav', // Freakonomics
  'div.post-share-buttons', // Blogspot
  'div.post-social-iteration-wrapper', // Streetwise
  'div#post_socials', // Archeology.org
  // 'div.posts', // (CANNOT USE - wordpress copyblogger theme)
  'div.posts-stories', // Ha'Aretz
  'div.post-tags', // Teleread
  'div#powered_by_livefyre_new', // Entertainment Tonight
  'div.premium-box', // Foreign Affairs
  'div#premium-box-locked', // Foreign Affairs
  'div[previewtitle="Related NPR Stories"]', // NPR
  'div#prevnext', // hostilefork
  'div#prev_post', // Ace Showbiz
  'div.primaryContent3', // Reuters (NOTE: I dislike this one)
  'div.printad', // North Jersey
  'div#print-button', // Teleread
  'div.printHide', // Telegraph UK
  'div.printstory', // North Jersey
  'div#prologue', // hostilefork
  'div.promo-inner', // Chron.com
  'div.promo-top', // Chron.com
  'div.pull-left-tablet', // NY1 (only uses "article" for related)
  // 'div.pull-right', // CANNOT USE (oklahoman vs nccgroup blog)
  'div.raltedTopics', // India Times
  'div#reader-comments', // The Daily Mail
  'div.read_more', // Times of India
  'div.recirculation', // New Yorker
  'div.recommended-articles-wrap', // Vice.com
  'div.recommended-links', // The Appendix
  'div.region-content-embed', // The Hill
  'div.region-content-inside', // The Hill
  'div#registration-notice', // Atlantic City Press
  'div#registrationNewVerification', // Joplin Globe
  'div#relartstory', // Times of India
  'div#related', // The Boston Globe (note: wary of using this)
  'div.related', // CNBC (note: wary of using this one)
  'div.related_articles', // Ahram
  'div.related-carousel', // The Daily Mail
  'div.related-block', // auburnpub.com
  'div.related-block2', // St. Louis Today
  'div.related-column', // The Hindu
  'div.related_content', // Bizjournal
  'div.related-items', // BBC
  'div#related_items', // Business Week
  'div.related_items', // NY Books
  'div#relatedlinks', // ABC News
  'div.related-media', // Fox News
  'div.relatedNews', // Tampa Bay
  'div.related-posts', // Buzzcarl
  'div.related-posts-inner', // threatpost.com
  'div.relatedRail', // Reuters
  'div.relateds', // CS Monitor
  'div#related-services', // BBC
  'div.relatedStories', // Salt Lake Tribute
  'div#related-stories', // Daily News
  'div#related-tags', // St. Louis Today
  'div.related-tags', // CBS
  'div#relatedTopics', // Reuters
  'div.relatedTopicButtons', // Reuters
  'div.related-vertical', // The Wrap
  'div#related-videos-container', // E-Online
  'div.relatedVidTitle', // E-Online
  'div.rel-block-news', // The Hindu
  'div.rel-block-sec', // The Hindu
  'div.relposts', // TechCrunch
  'div.resizer', // KMBC
  'div#respond', // Stanford Law
  'div#returnTraditional', // Joplin Globe
  'div#returnSocial', // Joplin Globe
  'div#reveal-comments', // Aeon Magazine
  'div#right-column', // The Hindu
  'div.right_rail_cnt', // Hewlett Packard News
  'div#rn-section', // Getty
  'div[role="article"] div.DM', // Google Plus comments
  'div[role="article"] div.Qg', // Google Plus comment count
  'div[role="article"] div.QM', // Google Plus entry tags
  'div[role="article"] div.yx', // Google Plus footer
  'div[role="complementary"]', // USA Today
  'div.rtCol', // Time Magazine
  'div#rt_contact', // CNBC
  'div#rt_featured_franchise', // CNBC
  'div#rt_primary_1', // CNBC
  'div[id^="rt_promo"]', // CNBC
  'div#rt_related_0', // CNBC
  'div#savedata1', // Times of India
  'div.save-tooltip', // auburnpub
  'div.sd-social', // Re-code
  'div.second-tier-social-tools', // Time Magazine
  'div#section-comments',  // The Washington Post
  'div#section-kmt', // The Guardian
  'div.section-puffs', // Telegraph UK
  'div#share', // Teleread
  'div.share > div.right', // auburnpub.com
  'div.shareArticles', // The Daily Mail
  'div.share-bar', // Gulf News
  'div.sharebar', // NY Post
  'div#sharebarx_new', // Times of India
  'div#share-block-bottom', // Dispatch.com
  'div.share-body-bottom', // BBC
  'div.share-btn', // Christian Times
  'div#share-bottom', // Teleread
  'div.share-buttons', // Quantstart
  'div#shareComments', // Teleread (also, gigya)
  'div#shareComments-bottom', // Teleread
  'div.share-count-container', // CNBC
  'div.sharedaddy', // Fortune
  'div.share-help', // BBC
  'div.share_inline_header', // The Economist
  'div.share_inline_footer', // The Economist
  'div.share-items', // Vanity Fair
  'div.share-link-inline', // Sparkfun
  'div.shareLinks', // Reuters
  'div.sharetools-inline-article-ad', // NYTimes
  'div.shareToolsNextItem', // KMBC
  'div.sharingBox', // India Times
  'div.sharrre-container', // Concurring Opinions
  'div.shortcode-post', // ABC7 News
  'div.show-related-videos', // CBS News
  'div.sidebar', // Belfast Telegraph
  'div#sidebar', // The Appendix
  'div.sideBar', // Bangkok Post
  'div#sidebar-3', // SysCon Media
  'div#sidebar-4', // SysCon Media
  'div.sidebar-content', // Concurring opinions
  'div.sidebar-feed', // WRAL
  'div.side-news-area', // Channel News Asia
  'div#signIn', // Joplin
  'div.simpleShare', // Newsday
  'div#simple_socialmedia', // Freakonomics
  'div.single-author', // Recode
  'div.single-related', // USA Today
  'div.sitewide-footer', // NBCNews
  'div.sitewide-header-content', // NBCNews
  'div.slideshow-controls', // Vanity Fair
  'div.small-rotator', // CTV News
  'div.social', // BBC
  'div.social-action', // Pakistan Daily
  'div.social-actions', // BuzzFeed
  'div.socialbar', // Autonews
  'div.socialBar', // Chron.com
  'div.social-bar', // The Miami Herald
  'div.social-bookmarking-module', // Wired.com
  'div.social-buttons', // The Verge
  'div.social-column', // TechSpot
  'div.social-count', // Fox News
  'div.social-dd', // The Wall Street Journal
  'div.sociable', // Mint Press
  'div.social_icons', // Forbes
  'div#social-links', // Reuters
  'div.social-links ', // SF Gate
  'div.social-links-bottom', // MSNBC
  'div.social-links-top', // MSNBC
  'div.social-news-area', // Channel News Asia
  'div.socialNetworks', // NBC
  'div#socialRegistration', // Joplin Globe
  'div#social-share', // Priceonomics
  'div.social-share', // Bloomberg
  'div.social-share-top', // Priceonomics
  'div.social-share-bottom', // The Hill
  'div.social-toolbar', // News OK
  'div.social-toolbar-affix', // News OK
  'div#socialTools', // Salt Lake Tribute
  'div.social-tools-wrapper-bottom ', // Washington Post
  'div.spantab', // Times of India
  'div.SPOSTARBUST-Related-Posts', // RObservatory
  'div.sps-twitter_module', // BBC
  'div.srch_box', // Times of India
  'div.ssba', // Funker (social share button actions?)
  'div#ssba', // Clizbeats
  'div.stack-talent', // NBC News (author bio)
  'div.stack-video-nojs-overlay', // NBC News
  'div.staff_info', // Bizjournals
  'div.statements-list-container', // Topix
  'div#sticky-nav', // Christian Science Monitor
  'div.sticky-tools', // The Boston Globe
  'div#story_add_ugc', // Fort Worth Star Telegram
  'div.story-block--twitter', // 9News
  'div.story-comment', // Latin Post
  'div#storyContinuesBelow', // Salt Lake Tribune
  'div#storyControls', // Politico
  'div#story-embed-column', // Christian Science Monitor
  'div#story-footer', // The Miami Herald
  'div.story_list', // Christian Science Monitor
  'div#storyMoreOnFucntion', // Telegraph UK
  'div.storynav', // TechCrunch
  'div.story_pagination', // ABC News
  'div#story_right_column_ad', // dailyjournal.net
  'div.StoryShareBottom', // CTV News
  'div#story-share-buttons', // USA Today
  'div.story-share-buttons', // USA Today
  'div#story-share-buttons-old', // USA Today
  'div#story-shoulder', // AV Web
  'div.story-tags', // Fox Sports
  'div.story-taxonomy', // ABC Chicago
  'div.story-toolbar', // Politico
  'div.storytools', // TechCrunch
  'div.story-tools', // Latin Post
  'div.submit-button', // Knight News Challenge
  'div.subscribe', // Times of India
  'div#subscription-notice', // Atlantic City Press
  'div.supplementalPostContent', // Medium.com
  'div#tabs-732a40a7-tabPane-2', // The Miami Herald (unclear)
  'div.tag-list', // NY Post (iffy on this one)
  'div.talklinks', // LiveJournal
  'div.taxonomy', // ABC Chicago
  'div.t_callout', // ABC News
  'div#teaserMarketingCta', // The Times
  'div.textSize', // CBS
  'div#teaser-overlay', // The Times
  'div.thirdPartyRecommendedContent', // KMBC
  'div#thumb-scroller', // E-Week
  'div.three-up-list', // The Huffington Post
  'div#tmg-related-links', // Telegraph Co
  'div#tncms-region-jh-article-bottom-content', // Idaho Press
  'div.tncms-restricted-notice', // Atlantic City Press
  'div.toolbox', // ABC News
  'div.tools', // ABC News (risky, might be a content-tag)
  'div.tools1', // The Wall Street Journal (blog)
  'div.topic-category', // Bangkok Post
  'div.top-index-stories', // BBC
  'div.topkicker', // entrepreneur.com
  'div.toplinks', // VOA News
  'div.top-stories-range-module', // BBC
  'div.top-stories05', // Telegraph UK
  'div#traditionalRegistration', // Joplin Globe
  'div#traditionalAuthenticateMerge', // Joplin Globe
  'div.trb_embed_related', // LA Times
  'div.trb_panelmod_body', //  LA Times
  'div.twipsy', // St. Louis Today
  'div.upshot-social', // The New York Times
  'div.util-bar-flyout', // USA Today
  'div.utilities', // The Times
  'div#utility', // WRAL
  'div.utility-bar', // USA Today
  'div.utility-panels', // WRAL
  'div.utils', // kotatv
  'div.utilsFloat', // KMBC
  'div.video_about_ad', // Christian Science Monitor
  'div.video_disqus', // Bloomberg
  'div#video-share', // ABC News
  'div.view-comments', // auburnpub.com
  'div#vuukle_env', // The Hindu
  'div.wideheadlinelist2', // Chron.com
  'div.windows-phone-links', // Windows Central
  'div#WNCol4', // Fox (subsidary myfoxny.com)
  'div#WNStoryRelatedBox', // Fox (subsidiary myfoxal.com)
  'div.wp_rp_wrap', // BuzzCarl (wordpress related post)
  'div.xwv-related-videos-container', // The Daily Mail
  'div.x-comment-menu', // Topix
  'div.x-comments-num', // Topix
  'div.x-comment-post-wrap', // Topix
  'div.yarpp-related', // Spoon-Tamago
  'div#you-might-like', // The New Yorker
  'div#zergnet', // Comic Book Resources
  'dl.blox-social-tools-horizontal', // Joplin
  'dl#comments', // CJR
  'dl.keywords', // Vanity Fair
  'dl.related-mod', // Fox News
  'dl.tags', // NY Daily News
  'figure.ib-figure-ad', // KMBC
  'figure.kudo', // svbtle.com blogs
  'footer', // Misc.
  'form#comment_form', // Doctors Lounge
  'form.comments-form', // CJR
  'header', // Misc.
  'h1#external-links', // The Sprawl (preceds unnamed <ul>)
  'h2#comments', // WordPress lemire-theme
  'h2.hide-for-print', // NobelPrize.org
  'h2#page_header', // CNBC
  'h3#comments-header', // Knight News Challenge
  'h3.more-keywords', // Joplin
  'h3.related_title', // Teleread
  'h3#scrollingArticlesHeader', // The Oklahoman
  'h4.taboolaHeaderRight', // KMBC
  'hr', // ALL
  'img#ajax_loading_img', // E-Week
  'li.comments', // Smashing Magazine
  'li#mostPopularShared_0', // Reuters
  'li#mostPopularShared_1', // Reuters
  'li#pagingControlsPS', // neagle
  'li#sharetoolscontainer', // neagle
  'li.tags', // Smashing Magazine
  'ol[data-vr-zone="Around The Web"]', // The Oklahoman
  'ol#comment-list', // Pro Football Talk
  'ol#commentlist', // WordPress lemire-theme
  'nav', // Misc.
  'p.article-more', // The Boston Globe
  'p.authorFollow', // The Sydney Morning Herald
  'p.byline', // Newsday
  'p.category', // SysCon Media
  'p.comments', // Telegraph Co Uk
  'p.copy-rights-text', // Jerusalem Post
  'p.essay-tags', // Aeon Magazine
  'p.moreVideosTitle', // E-Online
  'p.must-log-in', // The Jewish Press
  'p.pagination', // Stamford Advocate
  'p.p_top_10', // Star Telegram
  'p.post-tags', // USA Today
  'p.section-tag', // NY Post
  'p.story-ad-txt', // Boston.com
  'p.storytag', // chinatopix.com
  'p.story-tags', // Latin Post
  'p.topics', // ABC News
  'p.trial-promo', // Newsweek
  'p#whoisviewing', // Eev blog
  'section.also-on', // Huffington Post
  'section.around-bbc-module', // BBC
  'section.article-author', // Ars Technica
  'section.bottom_shares', // BuzzFeed
  'section.breaking_news_bar', // Bloomberg
  'section#comment-module', // Dispatch.com
  'section#comments', // TechSpot
  'section.comments', // ABC Chicago
  'section#comments-area', // The Economist
  'section#follow-us', // BBC
  'section.headband', // Bloomberg
  'section.headline-list', // The Miami Herald
  'section.headlines-list', // ABC Chicago
  'section#injected-newsletter', // GigaOM
  'section.morestories', // Entertainment Tonight
  'section#more-stories-widget', // The Miami Herald
  'section#newsletter-signup', // New Yorker
  'section.pagination_controls', // Vanity Fair
  'section#promotions', // The New Yorker
  'section.related_links', // Bloomberg
  'section#related-links', // BuzzFeed
  'section.related-products', // TechSpot
  'section#responses', // BuzzFeed
  'section.section--last', // Medium
  'section.section-tertiary', // Sports Illustrated
  'section.share-section', // Sports Illustrated
  'section.signup-widget', // The Miami Herald
  'section.story-tools-mod', // Boston.com
  'section.suggested-links', // The Examiner
  'section.tagblock', // Entertainment Tonight
  'section.three-up', // The Huffington Post
  'section.topnews', // Christian Times
  'section.top-video', // ABC 7 News
  'section.youmaylike', // Entertainment Tonight
  'span.comment-count-generated', // Teleread
  'span[itemprop="inLanguage"]', // Investors.com
  'span.sharetools-label', // NY Time
  'span.moreon-tt', // Teleread
  'span.printfriendly-node', // Uncover California
  'span.text_resizer', // Fort Worth Star Telegram
  'table.hst-articleprinter', // Stamford Advocate
  'table#commentTable', // Times of India
  'table.complexListingBox', // Mercury News
  'table.storyauthor', // SysCon Media
  'ul#additionalShare', // NBC
  'ul.articleList', // The Wall Street Journal
  'ul.article-options', // TVNZ
  'ul.article-related-wrap', // Jerusalem Post
  'ul.article-share', // DNA India
  'ul#article-share-links', // The Boston Herald
  'ul.article-tags', // 9News
  'ul.article_tools', // The Wall Street Journal
  'ul#associated', // TV New Zealand
  'ul#blox-body-nav', // Houston News
  'ul.blox-recent-list', // Atlantic City Press
  'ul.breadcrumb', // The Miami Herald
  'ul.breadcrumbs', // Giga OM
  'ul#bread-crumbs', // Dispatch.com
  'ul.breaking-news-stories', // ABC 7 News
  'ul.bull-list', // Joplin
  'ul.cats', // Windows Central
  'ul.comment-list', // Sparkfun
  'ul#content_footer_menu', // Japan Times
  'ul.display-posts-listing', // Recode
  'ul.entry-extra', // Wired Magazine
  'ul.entry-header', // Wired Magazine
  'ul.entry_sharing', // Bloomberg
  'ul#flairBar', // Scientific American
  'ul.flippy', // MSNBC
  'ul.generic_tabs', // Bloomberg
  'ul.header-lnks', // Knight News Challenge
  'ul.hl-list', // Chron.com
  'ul.links--inline', // Drupal
  'ul.links-list', // BBC
  'ul.m-block__meta__links', // Tomahawk Nation
  'ul.menu', // The New York Times
  'ul.mod-page-actions', // ESPN
  'ul.navbar-nav', // Noctua Software Blog
  'ul.navigation', // USA Today
  'ul.nav-tabs', // The Miami Herald
  'ul.newslist', // Autonews
  'ul#page-actions-bottom', // ESPN
  'ul.pageBoxes', // Investors.com
  'ul.pagenav', // The Guardian
  'ul.pagination', // Politico
  'ul.pagination-story', // Time
  'ul.project-nav', // Kickstarter
  'ul.related-links', // The Boston Globe
  'ul.related_links', // Ottawa Citizen
  'ul.related-posts', // Concurring Opinions
  'ul.resize-nav', // Channel News Asia
  'ul.rssi-icons', // Pacific Standard Magazine
  'ul.services', // The Appendix
  'ul.sharebar', // CNet
  'ul.share-buttons', // Ars Technica
  'ul.share_top', // CJR
  'ul.side-news-list', // Channel News Asia
  'ul.singleshare', // freakonomics
  'ul#social', // rickeyre blog
  'ul.social', // The Sydney Morning Herald
  'ul.social-bookmarking-module', // Wired Magazine
  'ul.social-buttons', // Spoon-Tamago
  'ul.socialByline', // The Wall Street Journal (blog)
  'ul.social-icons', // Citylab
  'ul.socials', // independent.ie
  'ul.social-share-list', // TechCrunch
  'ul.social-tools', // The Washington Post
  'ul#story-font-size', // Idaho Press
  'ul#story-social', // AV Web
  'ul#story-tools', // AV Web
  'ul.story-tools-sprite', // Houston News
  'ul.tags', // BBC
  'ul.tags-listing', // Colorado Independent
  'ul.text-scale', // GigaOM
  'ul.thumbs', // NY Daily News
  'ul#toolbar-sharing', // UT San Diego
  'ul.tools', // The Syndey Morning Herald
  'ul#topics', // Yahoo News
  'ul.toplinks', // VOA News
  'ul.top-menu', // Investors.com
  'ul.utility-list'// WRAL
];

exports.calamine = {
  filterAxes: BLACKLIST_SELECTORS,
  stripTitlePublisher: stripTitlePublisher,
  transform: transform
};

}(this));
