import {element_is_hidden_inline, fetch_image_element, url_string_is_valid} from '/src/content-filters/utils.js';
import {attribute_is_boolean} from '/src/lib/attribute.js';
import {is_external_url} from '/src/lib/cross-site.js';
import {element_unwrap} from '/src/lib/element-unwrap.js';
import * as imagemod from '/src/lib/image.js';
import * as string from '/src/lib/string.js';

// @param whitelist {Object} each property is element name, each value is array
// of retainable attribute names
export function cf_filter_non_whitelisted_attributes(document, whitelist) {
  assert(typeof whitelist === 'object');
  const elements = document.getElementsByTagName('*');
  for (const element of elements) {
    cf_element_filter_non_whitelisted_attributes(element, whitelist);
  }
}

function cf_element_filter_non_whitelisted_attributes(element, whitelist) {
  const attr_names = element.getAttributeNames();
  if (attr_names.length) {
    const whitelisted_names = whitelist[element.localName] || [];
    for (const attribute_name of attr_names) {
      if (!whitelisted_names.includes(attribute_name)) {
        element.removeAttribute(attribute_name);
      }
    }
  }
}

export function cf_filter_misnested_elements(document) {
  if (!document.body) {
    return;
  }

  const nested_hr_elements =
      document.body.querySelectorAll('ul > hr, ol > hr, dl > hr');
  for (const hr of nested_hr_elements) {
    hr.remove();
  }

  const descendant_anchors_of_anchors = document.body.querySelectorAll('a a');
  for (const descendant_anchor of descendant_anchors_of_anchors) {
    element_unwrap(descendant_anchor);
  }

  const captions = document.body.querySelectorAll('figcaption');
  for (const caption of captions) {
    if (!caption.parentNode.closest('figure')) {
      caption.remove();
    }
  }

  const sources = document.body.querySelectorAll('source');
  for (const source of sources) {
    if (!source.parentNode.closest('audio, picture, video')) {
      source.remove();
    }
  }

  const block_selector = 'blockquote, h1, h2, h3, h4, h5, h6, p';
  const inline_selector = 'a, span, b, strong, i';

  const blocks = document.body.querySelectorAll(block_selector);
  for (const block of blocks) {
    const ancestor = block.closest(inline_selector);
    if (ancestor && ancestor.parentNode) {
      ancestor.parentNode.insertBefore(block, ancestor);
      for (let node = block.firstChild; node; node = block.firstChild) {
        ancestor.appendChild(node);
      }
      block.appendChild(ancestor);
    }
  }
}

export function cf_filter_br_elements(document) {
  if (document.body) {
    const brs = document.body.querySelectorAll('br + br');
    for (const br of brs) {
      br.remove();
    }
  }
}

export function filter_container_elements(document) {
  if (document.body) {
    const elements = document.body.querySelectorAll('div, ilayer, layer');
    for (const element of elements) {
      element_unwrap(element);
    }
  }
}



export function cf_filter_figures(document) {
  if (document.body) {
    const figures = document.body.querySelectorAll('figure');
    for (const figure of figures) {
      const child_count = figure.childElementCount;
      if (child_count === 1) {
        if (figure.firstElementChild.localName === 'figcaption') {
          figure.remove();
        } else {
          element_unwrap(figure);
        }
      } else if (child_count === 0) {
        element_unwrap(figure);
      }
    }
  }
}


export function document_filter_empty_attributes(document) {
  if (document.body) {
    const elements = document.body.getElementsByTagName('*');
    for (const element of elements) {
      element_filter_empty_attributes(element);
    }
  }
}

export function element_filter_empty_attributes(element) {
  const names = element.getAttributeNames();
  for (const name of names) {
    if (!attribute_is_boolean(element, name)) {
      const value = element.getAttribute(name);
      if (typeof value !== 'string' || !value.trim()) {
        element.removeAttribute(name);
      }
    }
  }
}

// Filters or transforms certain form elements and form-related elements from
// document content
export function filter_form_elements(document) {
  if (!document.body) {
    return;
  }

  const forms = document.body.querySelectorAll('form');
  for (const form of forms) {
    element_unwrap(form);
  }

  const labels = document.body.querySelectorAll('label');
  for (const label of labels) {
    element_unwrap(label);
  }

  const selector =
      'button, fieldset, input, optgroup, option, select, textarea';
  const inputs = document.body.querySelectorAll(selector);
  const body = document.body;
  for (const input of inputs) {
    if (body.contains(input)) {
      input.remove();
    }
  }
}

export function filter_formatting_anchors(document) {
  if (document.body) {
    const anchors = document.body.querySelectorAll('a');
    for (const anchor of anchors) {
      if (!anchor.hasAttribute('href')) {
        element_unwrap(anchor);
      }
    }
  }
}

const formatting_elements_selector = [
  'abbr', 'acronym', 'center', 'data', 'details', 'help', 'insert', 'legend',
  'mark', 'marquee', 'meter', 'nobr', 'span', 'big', 'blink', 'font',
  'plaintext', 'small', 'tt'
].join(',');

export function filter_formatting_elements(document) {
  if (document.body) {
    const elements =
        document.body.querySelectorAll(formatting_elements_selector);
    for (const element of elements) {
      element_unwrap(element);
    }
  }
}

// Filters certain horizontal rule elements from document content
// Look for all <hr><hr> sequences and remove the second one. Naive in that it
// does not fully account for new document state as hrs removed.
export function filter_hr_elements(document) {
  if (document.body) {
    const hrs = document.body.querySelectorAll('hr + hr');
    for (const hr of hrs) {
      hr.remove();
    }
  }
}

// Scans the images of a document and ensures the width and height attributes
// are set. If images are missing dimensions then this fetches the dimensions
// and modifies each image element's attributes.
// Assumes that if an image has a src attribute value that is a url, that the
// url is absolute.
// @param document {Document}
// @param allowedProtocols {Array} optional, if not provided then defaults
// data/http/https
// @param timeout {Number} optional, if undefined or 0 then no timeout
// @returns {Number} the number of images modified
export async function document_set_image_sizes(document, base_url, timeout) {
  assert(
      base_url === null || typeof base_url === 'undefined' ||
      base_url instanceof URL);
  if (!document.body) {
    return;
  }

  const images = document.body.getElementsByTagName('img');
  if (!images.length) {
    return;
  }

  // Concurrently get dimensions for each image then wait for all to complete
  const promises = [];
  for (const image of images) {
    promises.push(image_get_dimensions(image, base_url, timeout));
  }
  const results = await Promise.all(promises);

  // Update the DOM for images that need state change
  for (const result of results) {
    if ('width' in result) {
      result.image.setAttribute('width', result.width);
      result.image.setAttribute('height', result.height);
    }
  }
}

async function image_get_dimensions(image, base_url, timeout) {
  if (image.hasAttribute('width') && image.hasAttribute('height')) {
    return {image: image, reason: 'has-attributes'};
  }

  let dims = element_get_inline_style_dimensions(image);
  if (dims) {
    return {
      image: image,
      reason: 'inline-style',
      width: dims.width,
      height: dims.height
    };
  }

  const image_source = image.getAttribute('src');
  if (!image_source) {
    return {image: image, reason: 'missing-src'};
  }

  // Parsing the url can throw an error. image_get_dimensions should not throw
  // except in the case of a programming error.
  let source_url;
  try {
    source_url = new URL(image_source, base_url);
  } catch (error) {
    // If we cannot parse the url, then we cannot reliably inspect
    // the url for dimensions, nor fetch the image, so we're done.
    return {image: image, reason: 'invalid-src'};
  }

  dims = url_sniff_dimensions(source_url);
  if (dims) {
    return {
      image: image,
      reason: 'url-sniff',
      width: dims.width,
      height: dims.height
    };
  }

  // Failure to fetch should be trapped, because image_get_dimensions should
  // only throw in case of a programming error, so that it can be used together
  // with Promise.all
  try {
    dims = await fetch_image_element(source_url, timeout);
  } catch (error) {
    return {image: image, reason: 'fetch-error'};
  }

  return {
    image: image,
    reason: 'fetch',
    width: dims.width,
    height: dims.height
  };
}

// Try and find image dimensions from the characters of its url
function url_sniff_dimensions(source_url) {
  // Ignore data urls (will be handled later by fetching)
  if (source_url.protocol === 'data:') {
    return;
  }

  const named_attr_pairs =
      [{width: 'w', height: 'h'}, {width: 'width', height: 'height'}];

  // Infer from url parameters
  const params = source_url.searchParams;
  for (const pair of named_attr_pairs) {
    const width_string = params.get(pair.width);
    if (width_string) {
      const width_int = parseInt(width_string, 10);
      if (!isNaN(width_int)) {
        const height_string = params.get(pair.height);
        if (height_string) {
          const height_int = parseInt(height_string, 10);
          if (!isNaN(height_int)) {
            const dimensions = {};
            dimensions.width = width_int;
            dimensions.height = height_int;
            return dimensions;
          }
        }
      }
    }
  }
}

function element_get_inline_style_dimensions(element) {
  if (element.hasAttribute('style') && element.style) {
    const width = parseInt(element.style.width, 10);
    if (!isNaN(width)) {
      const height = parseInt(element.style.height, 10);
      if (!isNaN(height)) {
        return {width: width, height: height};
      }
    }
  }
}

export function filter_invalid_anchors(document) {
  if (document.body) {
    const anchors = document.body.querySelectorAll('a');
    for (const anchor of anchors) {
      if (anchor_is_invalid(anchor)) {
        anchor.remove();
      }
    }
  }
}

function anchor_is_invalid(anchor) {
  const hrefValue = anchor.getAttribute('href');
  return hrefValue && /^\s*https?:\/\/#/i.test(hrefValue);
}

export function filter_large_image_attributes(document) {
  if (document.body) {
    const images = document.body.querySelectorAll('img');
    for (const image of images) {
      if (image_is_large(image)) {
        image.removeAttribute('width');
        image.removeAttribute('height');
      }
    }
  }
}

function image_is_large(image) {
  const width_string = image.getAttribute('width');
  if (!width_string) {
    return false;
  }

  const height_string = image.getAttribute('height');
  if (!height_string) {
    return false;
  }

  const width_int = parseInt(width_string, 10);
  if (isNaN(width_int)) {
    return false;
  } else if (width_int > 1000) {
    return true;
  }

  const height_int = parseInt(height_string, 10);
  if (isNaN(height_int)) {
    return false;
  } else if (height_int > 1000) {
    return true;
  }

  return false;
}

const lazy_image_attribute_names = [
  'load-src', 'data-src', 'data-src-full16x9', 'data-src-large',
  'data-original-desktop', 'data-baseurl', 'data-flickity-lazyload',
  'data-lazy', 'data-path', 'data-image-src', 'data-original',
  'data-adaptive-image', 'data-imgsrc', 'data-default-src', 'data-hi-res-src'
];

export function filter_lazy_images(document) {
  if (document.body) {
    const images = document.body.getElementsByTagName('img');
    for (const image of images) {
      if (!imagemod.has_source(image)) {
        const attr_names = image.getAttributeNames();
        for (const attr_name of lazy_image_attribute_names) {
          if (attr_names.includes(attr_name)) {
            const lazy_attr_value = image.getAttribute(attr_name);
            if (url_string_is_valid(lazy_attr_value)) {
              image.removeAttribute(attr_name);
              image.setAttribute('src', lazy_attr_value);
              break;
            }
          }
        }
      }
    }
  }
}

export function filter_leaf_nodes(document) {
  if (document.body) {
    const root = document.documentElement;
    const elements = document.body.querySelectorAll('*');
    for (const element of elements) {
      if (root.contains(element) && node_is_leaf(element)) {
        element.remove();
      }
    }
  }
}

function node_is_leaf(node) {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE: {
      if (element_is_leaf_exception(node)) {
        return false;
      }

      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (!node_is_leaf(child)) {
          return false;
        }
      }

      break;
    }
    case Node.TEXT_NODE:
      return !node.nodeValue.trim();
    case Node.COMMENT_NODE:
      return true;
    default:
      return false;
  }

  return true;
}


const leaf_exception_element_names = [
  'area', 'audio',  'base', 'col',      'command', 'br',    'canvas', 'col',
  'hr',   'iframe', 'img',  'input',    'keygen',  'meta',  'nobr',   'param',
  'path', 'source', 'sbg',  'textarea', 'track',   'video', 'wbr'
];

export function element_is_leaf_exception(element) {
  return leaf_exception_element_names.includes(element.localName);
}

// Filters certain list elements from document content
// TODO: restrict children of list to proper child type. E.g. only allow li or
// form within ul/ol, and dd/dt/form within dl. Do some type of transform like
// move such items to within a new child
export function filter_list_elements(document) {
  if (!document.body) {
    return;
  }

  const ancestor = document.body;
  const lists = ancestor.querySelectorAll('ul, ol, dl');

  // TODO: maybe this empty checking should be moved into the node_is_leaf
  // logic as a special case for list elements. That way it will be recursive.
  // But this does a moving of children where as the leaf code just removes. So
  // that would also entail changing the meaning of leaf filtering from filter
  // to transform.
  for (const list of lists) {
    if (list_element_is_empty(list)) {
      list_element_remove(list);
    }
  }

  for (const list of lists) {
    list_element_unwrap_single_item(list);
  }
}

// Return true if list is 'empty'
function list_element_is_empty(list) {
  // Return true if the list has no child nodes. This is redundant with leaf
  // filtering but I think it is ok and prefer to not make assumptions about
  // composition with other filters
  if (!list.firstChild) {
    return true;
  }

  const item = list.firstElementChild;

  // If the list has no elements, only nodes, then return true.
  if (!item) {
    return true;
  }

  // TODO: this check is too simple, because it ignores tolerable intermediate
  // elements, such as <ul><form><li/><li/></form></ul>. That is not empty. And
  // I believe it is still well-formed.

  // If this is the only element in the list, then check if it is empty.
  // NOTE: the first child check is admittedly simplistic and easily defeated
  // even just by a whitespace text node. But the goal I think is not to be
  // perfect and just grab low hanging fruit.
  if (!item.nextElementSibling && !item.firstChild) {
    return true;
  }

  // The list is not empty
  return false;
}

function list_element_remove(list) {
  const document = list.ownerDocument;

  // Add leading padding
  if (list.previousSibling &&
      list.previousSibling.nodeType === Node.TEXT_NODE) {
    list.parentNode.insertBefore(document.createTextNode(' '), list);
  }

  const first_child = list.firstChild;

  // Move any child nodes (there may be none). As each first child is moved,
  // the next child becomes the first child.
  for (let node = first_child; node; node = list.firstChild) {
    list.parentNode.insertBefore(node, list);
  }

  // Add trailing padding if needed. Also check if there were children, so as
  // to not add padding on top of the leading padding when there is no need.
  if (first_child && list.nextSibling &&
      list.nextSibling.nodeType === Node.TEXT_NODE) {
    list.parentNode.insertBefore(document.createTextNode(' '), list);
  }

  list.remove();
}

// Unwraps single item or empty list elements
function list_element_unwrap_single_item(list) {
  const list_parent = list.parentNode;
  if (!list_parent) {
    return;
  }

  const document = list.ownerDocument;
  const item = list.firstElementChild;

  // If the list has no child elements then just remove. This is overly simple
  // and could lead to data loss, but it is based on the assumption that empty
  // lists are properly handled in the first place earlier. Basically, this
  // should never happen and should almost be an assert?
  if (!item) {
    list.remove();
    return;
  }

  // If the list has more than one child element then leave the list as is
  if (item.nextElementSibling) {
    return;
  }

  // If the list's only child element isn't one of the correct types, ignore it
  // TODO: use array and .includes
  const list_item_names = {li: 0, dt: 0, dd: 0};
  if (!(item.localName in list_item_names)) {
    return;
  }

  // If the list has one child element of the correct type, and that child
  // element has no inner content, then remove the list. This will also remove
  // any non-element nodes within the list outside of the child element.
  if (!item.firstChild) {
    // If removing the list, avoid the possible merging of adjacent text nodes
    if (list.previousSibling &&
        list.previousSibling.nodeType === Node.TEXT_NODE && list.nextSibling &&
        list.nextSibling.nodeType === Node.TEXT_NODE) {
      list_parent.replaceChild(document.createTextNode(' '), list);

    } else {
      list.remove();
    }

    return;
  }

  // The list has one child element with one or more child nodes. Move the
  // child nodes to before the list and then remove iterator.

  // Add leading padding
  if (list.previousSibling &&
      list.previousSibling.nodeType === Node.TEXT_NODE && item.firstChild &&
      item.firstChild.nodeType === Node.TEXT_NODE) {
    list_parent.insertBefore(document.createTextNode(' '), list);
  }

  // Move the children of the item to before the list, maintainin order
  for (let node = item.firstChild; node; node = item.firstChild) {
    list_parent.insertBefore(node, list);
  }

  // Add trailing padding
  if (list.nextSibling && list.nextSibling.nodeType === Node.TEXT_NODE &&
      list.previousSibling &&
      list.previousSibling.nodeType === Node.TEXT_NODE) {
    list_parent.insertBefore(document.createTextNode(' '), list);
  }

  list.remove();
}


// Filters certain whitespace from a document. This scans the text nodes of a
// document and modifies certain text nodes.
export function filter_node_whitespace(document) {
  if (!document.body) {
    return;
  }

  // Ignore node values shorter than this length
  const node_value_length_min = 3;

  const it = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);
  for (let node = it.nextNode(); node; node = it.nextNode()) {
    const value = node.nodeValue;
    if (value.length > node_value_length_min && !node_is_ws_sensitive(node)) {
      const new_value = string.condense_whitespace(value);
      if (new_value.length !== value.length) {
        node.nodeValue = new_value;
      }
    }
  }
}

// TODO: inline
function node_is_ws_sensitive(node) {
  return node.parentNode.closest(
      'code, pre, ruby, script, style, textarea, xmp');
}


// Specifies that all links are noreferrer
// TODO: this function's behavior conflicts with attribute filter. Need to
// whitelist this attribute (and this value) for this element.
export function add_noreferrer_to_anchors(document) {
  if (document.body) {
    const anchors = document.body.getElementsByTagName('a');
    for (const anchor of anchors) {
      anchor.setAttribute('rel', 'noreferrer');
    }
  }
}


// Removes ping attributes from anchor elements in document content
export function remove_ping_attribute_from_all_anchors(document) {
  if (document.body) {
    const anchors = document.body.querySelectorAll('a[ping]');
    for (const anchor of anchors) {
      anchor.removeAttribute('ping');
    }
  }
}



export function filter_small_images(document) {
  if (document.body) {
    const images = document.body.querySelectorAll('img');
    for (const image of images) {
      if (image_is_small(image)) {
        imagemod.remove(image);
      }
    }
  }
}

// TODO: merge this with image_is_large, make a function that does something
// like image_bin_size, and returns small or large or other. Then deprecate
// image_is_small and image_is_large
// TODO: furthermore, consider merging filter_small_images and
// filter_large_image into a single filter filter_image_by_size
function image_is_small(image) {
  const width_string = image.getAttribute('width');
  if (!width_string) {
    return false;
  }

  const height_string = image.getAttribute('height');
  if (!height_string) {
    return false;
  }

  const width_int = parseInt(width_string, 10);
  if (isNaN(width_int)) {
    return false;
  }

  const height_int = parseInt(height_string, 10);
  if (isNaN(height_int)) {
    return false;
  }

  if (width_int < 3) {
    return false;
  }

  if (height_int < 3) {
    return false;
  }

  if (width_int < 33 && height_int < 33) {
    return true;
  }

  return false;
}


// Filter semantic web elements from document content
export function filter_semantic_elements(document) {
  if (document.body) {
    const selector = 'article, aside, footer, header, main, section';
    const elements = document.body.querySelectorAll(selector);
    for (const element of elements) {
      element_unwrap(element);
    }
  }
}

// Removes images without src attribute
export function filter_sourceless_images(document) {
  if (document.body) {
    const images = document.body.querySelectorAll('img');
    for (const image of images) {
      if (!imagemod.has_source(image)) {
        imagemod.remove(image);
      }
    }
  }
}

// Remove whitespace and whitespace-like content from the start and end of a
// document's body.
export function document_trim(document) {
  if (document.body) {
    const first_child = document.body.firstChild;
    if (first_child) {
      trim_document_step(first_child, 'nextSibling');
      const last_child = document.body.lastChild;
      if (last_child && last_child !== first_child) {
        trim_document_step(last_child, 'previousSibling');
      }
    }
  }
}

function trim_document_step(start_node, edge_name) {
  let node = start_node;
  while (node && node_is_trimmable(node)) {
    const sibling = node[edge_name];
    node.remove();
    node = sibling;
  }
}

function node_is_trimmable(node) {
  return node.nodeType === Node.TEXT_NODE ?
      !node.nodeValue.trim() :
      ['br', 'hr', 'nobr'].includes(node.localName);
}

// Filters certain table elements from document content
export function filter_table_elements(document, table_row_scan_max) {
  if (document.body) {
    const elements = document.body.querySelectorAll(
        'colgroup, hgroup, multicol, tbody, tfoot, thead');
    for (const element of elements) {
      element_unwrap(element);
    }

    const tables = document.body.querySelectorAll('table');
    for (const table of tables) {
      if (table_element_is_single_column(table, table_row_scan_max)) {
        table_element_unwrap(table);
      }
    }
  }
}

function table_element_is_single_column(table, table_row_scan_max) {
  const rows = table.rows;
  const safe_limit = Math.min(rows.length, table_row_scan_max);
  for (let i = 0; i < safe_limit; i++) {
    if (!row_is_single_column(rows[i])) {
      return false;
    }
  }
  return true;
}

function row_is_single_column(row) {
  const cells = row.cells;
  let filled_cell_count = 0;

  // TODO: review the logic here. Is pre-dec op correct?

  for (let i = 0, len = cells.length; i < len; i++) {
    if (!node_is_leaf(cells[i]) && ++filled_cell_count > 1) {
      return false;
    }
  }

  return true;
}

function table_element_unwrap(table) {
  const rows = table.rows;
  const row_count = rows.length;
  const parent = table.parentNode;
  const document = table.ownerDocument;

  parent.insertBefore(document.createTextNode(' '), table);

  for (let i = 0; i < row_count; i++) {
    const row = rows[i];
    for (let j = 0, clen = row.cells.length; j < clen; j++) {
      const cell = row.cells[j];

      // Move the children of the cell to before the table
      for (let node = cell.firstChild; node; node = cell.firstChild) {
        parent.insertBefore(node, table);
      }
    }

    parent.insertBefore(document.createElement('p'), table);
  }

  parent.insertBefore(document.createTextNode(' '), table);
  table.remove();
}

const telemetry_host_patterns = [
  /\/\/.*2o7\.net\//i,
  /\/\/ad\.doubleclick\.net\//i,
  /\/\/ad\.linksynergy\.com\//i,
  /\/\/analytics\.twitter\.com\//i,
  /\/\/anon-stats\.eff\.org\//i,
  /\/\/bat\.bing\.com\//i,
  /\/\/b\.scorecardresearch\.com\//i,
  /\/\/beacon\.gu-web\.net\//i,
  /\/\/.*cloudfront\.net\//,
  /\/\/googleads\.g\.doubleclick\.net\//i,
  /\/\/in\.getclicky\.com\//i,
  /\/\/insight\.adsrvr\.org\//i,
  /\/\/me\.effectivemeasure\.net\//i,
  /\/\/metrics\.foxnews\.com\//i,
  /\/\/.*moatads\.com\//i,
  /\/\/pagead2\.googlesyndication\.com\//i,
  /\/\/pixel\.quantserve\.com\//i,
  /\/\/pixel\.wp\.com\//i,
  /\/\/pubads\.g\.doubleclick\.net\//i,
  /\/\/sb\.scorecardresearch\.com\//i,
  /\/\/stats\.bbc\.co\.uk\//i,
  /\/\/statse\.webtrendslive\.com\//i,
  /\/\/pixel\.wp\.com\//i,
  /\/\/t\.co\//i,
  /\/\/www\.facebook\.com\/tr/i
];

// Removes some telemetry data from a document.
// @param document {Document}
// @param document_url {URL} canonical document url
export function filter_telemetry_elements(document, document_url) {
  assert(document_url instanceof URL);

  // Analysis is limited to descendants of body
  if (!document.body) {
    return;
  }


  // Telemetry images are usually hidden, so treat visibility as an indicator.
  // False positives are probably not too harmful. Removing images based on
  // visibility overlaps with sanitization, but this is intentionally naive
  // regarding what other filters are applied to the document.
  const images = document.body.querySelectorAll('img');
  for (const image of images) {
    if (element_is_hidden_inline(image) || image_is_pixel(image) ||
        image_has_telemetry_source(image, document_url)) {
      imagemod.remove(image);
    }
  }
}

// Returns true if an image is a pixel-sized image
function image_is_pixel(image) {
  return image.hasAttribute('src') && image.hasAttribute('width') &&
      image.width < 2 && image.hasAttribute('height') && image.height < 2;
}

// This test only considers the src attribute. Using srcset or picture source
// is exceedingly rare mechanism for telemetry so ignore those channels.
// @param image {Image}
// @param document_url {URL}
function image_has_telemetry_source(image, document_url) {
  if (!image.hasAttribute('src')) {
    return false;
  }

  const src = image.getAttribute('src').trim();
  if (!src) {
    return false;
  }

  // TODO: all these attempts to avoid parsing are probably silly when it
  // isn't even clear that this is slow. Just parse the url. It is simpler. This
  // was premature optimization

  // Prior to parsing the url, try and exclude some of the url strings to avoid
  // the parsing cost.

  // Very short urls are probably not telemetry
  const MIN_IMAGE_URL_LENGTH = 's.gif'.length;
  if (src.length < MIN_IMAGE_URL_LENGTH) {
    return false;
  }

  // Ignore urls that appear invalid. Invalid urls are not a telemetry concern
  // because requests will presumably fail.
  if (src.includes(' ')) {
    return false;
  }

  // For protocol-relative urls, allow them and continue.
  // TODO: but that just fails in the URL parser ....? Need to revisit this.
  // Basically I want to be able to match and reject protocol relative urls.
  // But I want to work with a URL object. Perhaps I should substitute in http
  // automatically? Or require base url here when constructing the url?

  // Relative urls are generally not telemetry urls.
  // Urls using the 'data:' protocol are generally not telemetry
  // urls because no networking is involved. Basically only look at http and
  // https
  // TODO: make non-capturing regex
  const URL_START_PATTERN = /^(http:\/\/|https:\/\/|\/\/)/i;
  if (!URL_START_PATTERN.test(src)) {
    return false;
  }

  let imageURL;
  try {
    imageURL = new URL(src);
  } catch (error) {
    // It is a relative url, or an invalid url of some kind. It is probably not
    // telemetry, or at least, not a telemetry concern.
    return false;
  }

  // Ignore 'internal' urls.
  if (!is_external_url(document_url, imageURL)) {
    return false;
  }

  for (const pattern of telemetry_host_patterns) {
    if (pattern.test(src)) {
      return true;
    }
  }

  return false;
}

function assert(value, message) {
  if (!value) throw new Error(message || 'Assertion error');
}
