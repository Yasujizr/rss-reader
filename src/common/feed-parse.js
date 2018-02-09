import {html_decode_entities} from '/src/common/html-utils.js';

// TODO: review proper base url determination for entry link resolution. There
// is a chance I am ignoring something like a base-url element that trumps feed
// link as base url.
// TODO: right now find_feed_link returns a string, which I then parse back into
// a url. I would like to avoid this double parsing. maybe it is ok to parse
// urls into actual urls?

// Parses the input string into a feed object. The feed object will always have
// a defined entries array, although it may be zero length. Returns a feed
// object or throws
// @param xml_string {String}
// @param skip_entries {Boolean} if true, entries are not processed, and an
// empty entries array is included in the result
// @param resolve_entry_urls {Boolean} if true, entry urls are canonicalized
// using feed.link as the base url. Only done if entries not skipped. Only done
// if feed link is a valid url.
export default function feed_parse(
    xml_string, skip_entries, resolve_entry_urls) {
  // Sanity checking xml_string delegated to xml_parse
  // Rethrow parse xml errors
  const document = xml_parse(xml_string);
  return unmarshall_xml(document, skip_entries, resolve_entry_urls);
}

function xml_parse(xml_string) {
  if (typeof xml_string !== 'string') {
    throw new Error('xml_string is not a string');
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(xml_string, 'application/xml');
  const error = document.querySelector('parsererror');
  if (error) {
    throw new Error(error.textContent);
  }
  return document;
}

// @param document {Document} an XML document representing a feed
// @param skip_entries {Boolean}
// @returns {Object} a feed object
function unmarshall_xml(document, skip_entries, resolve_entry_urls) {
  const document_element = document.documentElement;
  const document_element_name = element_get_local_name(document_element);

  const supported_feed_names = ['feed', 'rdf', 'rss'];
  if (!supported_feed_names.includes(document_element_name)) {
    throw new Error('Unsupported document element ' + document_element_name);
  }

  const channel_element = find_channel_element(document_element);
  if (!channel_element) {
    throw new Error('Missing channel element');
  }

  const feed = {};
  feed.type = find_feed_type(document_element);
  feed.title = find_feed_title(channel_element);
  feed.description = find_feed_description(document, channel_element);
  feed.link = find_feed_link(channel_element);
  feed.datePublished = find_feed_date(channel_element);

  if (skip_entries) {
    feed.entries = [];
  } else {
    const entry_elements = find_entry_elements(channel_element);
    feed.entries = entry_elements.map(create_entry);

    if (resolve_entry_urls) {
      feed_resolve_entry_urls(feed.entries, feed.link);
    }
  }

  return feed;
}

function find_feed_title(channel_element) {
  return find_child_element_text(channel_element, 'title');
}

function find_feed_description(document, channel_element) {
  const document_element = document.documentElement;
  const document_element_name = document_element.localName.toLowerCase();
  const element_name =
      document_element_name === 'feed' ? 'subtitle' : 'description';
  return find_child_element_text(channel_element, element_name);
}

function find_channel_element(document_element) {
  if (document_element.localName.toLowerCase() === 'feed') {
    return document_element;
  } else {
    return find_child_element_by_name(document_element, 'channel');
  }
}

function find_entry_elements(channel_element) {
  const document_element = channel_element.ownerDocument.documentElement;
  const document_element_name = element_get_local_name(document_element);

  let parent_node, entry_element_name;
  if (document_element_name === 'feed') {
    parent_node = document_element;
    entry_element_name = 'entry';
  } else if (document_element_name === 'rdf') {
    parent_node = document_element;
    entry_element_name = 'item';
  } else if (document_element_name === 'rss') {
    parent_node = channel_element;
    entry_element_name = 'item';
  } else {
    throw new Error('Reached unreachable');
  }

  const entries = [];
  for (let c = parent_node.firstElementChild; c; c = c.nextElementSibling) {
    if (element_get_local_name(c) === entry_element_name) {
      entries.push(c);
    }
  }
  return entries;
}

function find_feed_type(document_element) {
  // TODO: just use element_get_local_name?
  return document_element.localName.toLowerCase();
}

function find_feed_date(channel_element) {
  const document_element = channel_element.ownerDocument.documentElement;
  const feed_type = find_feed_type(document_element);

  let date_text;
  if (feed_type === 'feed') {
    date_text = find_child_element_text(channel_element, 'updated');
  } else {
    date_text = find_child_element_text(channel_element, 'pubdate');
    date_text =
        date_text || find_child_element_text(channel_element, 'lastbuilddate');
    date_text = date_text || find_child_element_text(channel_element, 'date');
  }

  if (!date_text) {
    return;
  }

  let feed_date;
  try {
    feed_date = new Date(date_text);
  } catch (error) {
  }

  return feed_date;
}

function find_atom_link_element(channel_element) {
  let link_element =
      find_child_element(channel_element, element_is_link_rel_alt);
  if (link_element) {
    return link_element;
  }

  link_element = find_child_element(channel_element, element_is_link_rel_self);
  if (link_element) {
    return link_element;
  }

  link_element = find_child_element(channel_element, element_is_link_with_href);
  return link_element;
}

function find_feed_link(channel_element) {
  const document_element = channel_element.ownerDocument.documentElement;
  const document_element_name = element_get_local_name(document_element);
  let link_text, link_element;
  if (document_element_name === 'feed') {
    link_element = find_atom_link_element(channel_element);
    if (link_element) {
      link_text = link_element.getAttribute('href');
    }
  } else {
    link_element =
        find_child_element(channel_element, element_is_link_without_href);
    if (link_element) {
      link_text = link_element.textContent;
    } else {
      link_element =
          find_child_element(channel_element, element_is_link_with_href);
      if (link_element) {
        link_text = link_element.getAttribute('href');
      }
    }
  }

  return link_text;
}

function element_is_link_rel_alt(element) {
  return element.matches('link[rel="alternate"]');
}

function element_is_link_rel_self(element) {
  return element.matches('link[rel="self"]');
}

function element_is_link_with_href(element) {
  return element.matches('link[href]');
}

function element_is_link_without_href(element) {
  return element.localName === 'link' && !element.hasAttribute('href');
}

function create_entry(entry_element) {
  return {
    title: find_entry_title(entry_element),
    author: find_entry_author(entry_element),
    link: find_entry_link(entry_element),
    datePublished: find_entry_date(entry_element),
    content: find_entry_content(entry_element),
    enclosure: find_entry_enclosure(entry_element)
  };
}

function find_entry_title(entry_element) {
  return find_child_element_text(entry_element, 'title');
}

function find_entry_enclosure(entry_element) {
  const enclosure_element =
      find_child_element_by_name(entry_element, 'enclosure');

  if (enclosure_element) {
    const enclosure = {};
    enclosure.url = enclosure_element.getAttribute('url');
    enclosure.enclosureLength = enclosure_element.getAttribute('length');
    enclosure.type = enclosure_element.getAttribute('type');
    return enclosure;
  }
}

function find_entry_author(entry_element) {
  const author_element = find_child_element_by_name(entry_element, 'author');
  if (author_element) {
    const author_name = find_child_element_text(author_element, 'name');
    if (author_name) {
      return author_name;
    }
  }

  const creator = find_child_element_text(entry_element, 'creator');
  if (creator) {
    return creator;
  }
  return find_child_element_text(entry_element, 'publisher');
}

function find_entry_link(entry_element) {
  const document_element = entry_element.ownerDocument.documentElement;
  const document_element_name = element_get_local_name(document_element);
  let link_text;
  if (document_element_name === 'feed') {
    let link = find_child_element(entry_element, element_is_link_rel_alt);
    link = link || find_child_element(entry_element, element_is_link_rel_self);
    link = link || find_child_element(entry_element, element_is_link_with_href);
    link_text = link ? link.getAttribute('href') : undefined;
  } else {
    link_text = find_child_element_text(entry_element, 'origlink');
    link_text = link_text || find_child_element_text(entry_element, 'link');
  }
  return link_text;
}

function find_entry_date(entry_element) {
  const document_element = entry_element.ownerDocument.documentElement;
  const document_element_name = element_get_local_name(document_element);
  let date_string;
  if (document_element_name === 'feed') {
    date_string = find_child_element_text(entry_element, 'published') ||
        find_child_element_text(entry_element, 'updated');
  } else {
    date_string = find_child_element_text(entry_element, 'pubdate') ||
        find_child_element_text(entry_element, 'date');
  }
  if (!date_string) {
    return;
  }

  let entry_date;
  try {
    entry_date = new Date(date_string);
  } catch (error) {
    console.debug(error);
  }
  return entry_date;
}

function find_entry_content(entry_element) {
  const document_element = entry_element.ownerDocument.documentElement;
  const document_element_name = element_get_local_name(document_element);
  let result;
  if (document_element_name === 'feed') {
    const content = find_child_element_by_name(entry_element, 'content');

    if (!content) {
      return;
    }

    // NOTE: so I think I handle cdata content correctly, but note the issue
    // with title still having raw entities. Or, rather, should content be not
    // encoded in any situation?

    const nodes = content.childNodes;
    const texts = [];
    for (let node of nodes) {
      if (node.nodeType === Node.CDATA_SECTION_NODE) {
        let node_value = node.nodeValue;
        node_value = html_decode_entities(node_value);
        texts.push(node_value);
      } else if (node.nodeType === Node.TEXT_NODE) {
        const node_text = node.textContent;
        texts.push(node_text);
      } else {
        console.warn('Unknown node type, next message is dir inspection');
        console.dir(node);
      }
    }

    result = texts.join('').trim();
  } else {
    result = find_child_element_text(entry_element, 'encoded');
    result = result || find_child_element_text(entry_element, 'description');
    result = result || find_child_element_text(entry_element, 'summary');
  }
  return result;
}

function feed_resolve_entry_urls(entries, feed_link_url_string) {
  if (!feed_link_url_string) {
    return;
  }

  // Parse the base url, bail on failure
  // TODO: if a feed has a link, and the link is invalid, should that actually
  // be considered a parse error? In other words, this should not catch this
  // error here?
  let base_url;
  try {
    base_url = new URL(feed_link_url_string);
  } catch (error) {
    console.debug('Invalid base url', feed_link_url_string);
    return;
  }

  for (const entry of entries) {
    if (entry.link) {
      try {
        const url = new URL(entry.link, base_url);
        entry.link = url.href;
        // TEMP: debugging new functionality
        console.debug('entry.link:', entry.link);

      } catch (error) {
        // TODO: unset entry.link?
        console.debug(error);
      }
    }
  }
}

function find_child_element(parent_element, predicate) {
  for (let e = parent_element.firstElementChild; e; e = e.nextElementSibling) {
    if (predicate(e)) {
      return e;
    }
  }
}

function find_child_element_by_name(parent, name) {
  if (!(parent instanceof Element)) {
    throw new Error('Expected element, got ' + typeof Element);
  }

  if (typeof name !== 'string') {
    throw new Error('Expected string, got ' + typeof name);
  }

  const normal_name = name.toLowerCase();
  for (let c = parent.firstElementChild; c; c = c.nextElementSibling) {
    if (c.localName.toLowerCase() === normal_name) {
      return c;
    }
  }
}

function find_child_element_text(parentElement, element_name) {
  const child_element = find_child_element_by_name(parentElement, element_name);
  if (child_element) {
    const text = child_element.textContent;
    if (text) {
      return text.trim();
    }
  }
}

// In xml-flagged documents, element.localName is case-sensitive. This
// normalizes the name to lowercase
function element_get_local_name(element) {
  return element.localName.toLowerCase();
}
