// Removes boilerplate content from a document
// @param document {Document}
export function filter_boilerplate(document, options) {
  assert(document instanceof Document);
  if (!document.body) {
    return;
  }

  options = options || {};

  const best_element = find_high_score_element(document, options);
  assert(best_element instanceof Element);

  if (!('annotate' in options)) {
    prune(document, best_element);
  }
}

const ancestor_biases = {
  a: -5,
  aside: -50,
  blockquote: 20,
  br: 3,
  div: -50,
  figure: 20,
  h1: 10,
  h2: 10,
  h3: 10,
  h4: 10,
  h5: 10,
  h6: 10,
  nav: -100,
  ol: -20,
  p: 10,
  pre: 10,
  section: -20,
  ul: -20
};

const token_weights = {
  ad: -500,
  ads: -500,
  advert: -500,
  article: 500,
  body: 500,
  comment: -500,
  content: 500,
  contentpane: 500,
  gutter: -300,
  left: -50,
  main: 500,
  meta: -50,
  nav: -200,
  navbar: -200,
  newsarticle: 500,
  page: 200,
  post: 300,
  promo: -100,
  rail: -300,
  rel: -50,
  relate: -500,
  related: -500,
  right: -50,
  social: -200,
  story: 100,
  storytxt: 500,
  tool: -200,
  tools: -200,
  widget: -200,
  zone: -50
};

function derive_text_bias(element) {
  const text = string_condense_whitespace(element.textContent);
  const text_length = text.length;
  const anchor_length = derive_anchor_length(element);
  return 0.25 * text_length - 0.7 * anchor_length;
}

function derive_anchor_length(element) {
  const anchors = element.querySelectorAll('a[href]');
  let anchor_length = 0;
  for (const anchor of anchors) {
    const text = string_condense_whitespace(anchor.textContent);
    anchor_length += text.length;
  }
  return anchor_length;
}

function derive_ancestor_bias(element) {
  let total_bias = 0;
  for (let child = element.firstElementChild; child;
       child = child.nextElementSibling) {
    const bias = ancestor_biases[child.localName];
    if (bias) {
      total_bias = total_bias + bias;
    }
  }
  return total_bias;
}

function derive_attribute_bias(element) {
  let total_bias = 0;
  const vals = [element.id, element.name, element.className];

  // join implicitly filters undefined
  const vals_flat_string = vals.join(' ');
  if (vals_flat_string.length < 3) {
    return total_bias;
  }

  const vals_normal_string = vals_flat_string.toLowerCase();
  const tokens = vals_normal_string.split(/[\s\-_0-9]+/g);

  // TODO: revert to using an array. do not use obj as dic it just messes up v8
  const seen_tokens = {};

  for (const token of tokens) {
    if (!(token in seen_tokens)) {
      seen_tokens[token] = 1;
      total_bias += token_weights[token] || 0;
    }
  }

  return total_bias;
}

function find_high_score_element(document, options) {
  const candidate_selector =
      'article, content, div, layer, main, section, span, td';
  const list_selector = 'li, ol, ul, dd, dl, dt';
  const nav_selector = 'aside, header, footer, nav, menu, menuitem';
  let best_element = document.documentElement;
  if (!document.body) {
    return best_element;
  }

  const annotate = 'annotate' in options;

  const elements = document.body.querySelectorAll(candidate_selector);
  let high_score = 0;
  for (const element of elements) {
    if (annotate) {
      element.dataset.bpAnalyzed = 'true';
    }

    let score = 0;

    const text_bias = derive_text_bias(element);
    score += text_bias;
    if (annotate) {
      element.dataset.bpTextBias = text_bias;
    }

    if (element.closest(list_selector)) {
      score -= 200;
      if (annotate) {
        element.dataset.bpListBias = -200;
      }
    }

    if (element.closest(nav_selector)) {
      score -= 500;
      if (annotate) {
        element.dataset.bpNavBias = -500;
      }
    }

    const ancestor_bias = derive_ancestor_bias(element);
    score += ancestor_bias;
    if (annotate) {
      element.dataset.bpAncestorBias = ancestor_bias;
    }

    const image_bias = derive_image_bias(element);
    score += image_bias;
    if (annotate) {
      element.dataset.bpImageBias = image_bias;
    }

    const attribute_bias = derive_attribute_bias(element);
    score += attribute_bias;
    if (annotate) {
      element.dataset.bpAttrBias = attribute_bias;
    }

    if (annotate) {
      element.dataset.bpScore = score;
    }

    if (score > high_score) {
      best_element = element;
      high_score = score;
    }
  }

  if (annotate) {
    best_element.dataset.bpMax = 'true';
  }

  return best_element;
}

function derive_image_bias(parent_element) {
  let bias = 0;
  let image_count = 0;
  for (const node of parent_element.childNodes) {
    if (node.localName === 'img') {
      bias += image_derive_area_bias(node) + image_derive_text_bias(node);
      image_count++;
    }
  }

  // Penalize carousels
  if (image_count > 1) {
    bias += -50 * (image_count - 1);
  }

  return bias;
}

// Reward supporting text of images
function image_derive_text_bias(image) {
  let bias = 0;
  if (image.hasAttribute('alt')) {
    bias += 20;
  }

  if (image.hasAttribute('title')) {
    bias += 30;
  }

  if (image_find_caption(image)) {
    bias += 100;
  }

  return bias;
}

// Searches for and returns the corresponding figcaption element
function image_find_caption(image) {
  assert(image instanceof Element);
  const figure = image.closest('figure');
  if (figure) {
    const captions = figure.getElementsByTagName('figcaption');
    if (captions && captions.length) {
      return captions[0];
    }
  }
}

function image_derive_area_bias(image) {
  // Calculate the area of the image. For images missing a dimension, assume
  // the image is a square. Inferring the missing dimension leads to a more
  // accurate measure of image size, and lets image size contribute to bias
  // more often, which generally leads to more accurate boilerplate analysis.
  let area;
  if (image.width && image.height) {
    area = image.width * image.height;
  } else if (image.width) {
    area = image.width * image.width;
  } else if (image.height) {
    area = image.height * image.height;
  } else {
    // Leave area undefined
  }

  // Calculate the bias. Bin the area into a few labeled buckets using
  // hand-crafted boundaries, and use a hand crafted bias value. Previously this
  // calculated bias as a function of area that was then clamped and dampened.
  // After some reflection, I think basic hacky binning is just as good if not
  // better.
  let bias = 0;

  if (area > 100000) {
    // Very large image
    bias = 500;
  } else if (area > 50000) {
    // Large image
    bias = 300;
  } else if (area > 20000) {
    // Medium image
    bias = 50;
  } else if (!isNaN(area)) {
    // Penalty for very small image.
    bias = -10;
  } else {
    // Unknown area, leave bias as is, 0
  }

  return bias;
}

function prune(document, best_element) {
  assert(document.documentElement.contains(best_element));

  if (best_element === document.documentElement) {
    return;
  }

  if (best_element === document.body) {
    return;
  }

  const elements = document.body.querySelectorAll('*');
  for (const element of elements) {
    if (element.contains(best_element)) {
      continue;
    }

    if (best_element.contains(element)) {
      continue;
    }

    if (!document.documentElement.contains(element)) {
      continue;
    }

    element.remove();
  }
}

function string_condense_whitespace(string) {
  return string.replace(/\s{2,}/g, ' ');
}

function assert(value, message) {
  if (!value) throw new Error(message || 'Assertion error');
}