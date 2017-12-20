import assert from "/src/assert/assert.js";
import * as CSSUtils from "/src/utils/dom/css-utils.js";
import parseInt10 from "/src/utils/parse-int-10.js";

// Get the current settings from local storage and then modify the css rules in the default style
// sheet
export function pageStyleSettingsOnchange(event) {
  const sheet = CSSUtils.getDefaultStylesheet();
  assert(sheet);
  entryCSSUpdateRule(sheet);
  entryCSSUpdateTitleRule(sheet);
  entryCSSUpdateContentRule(sheet);
}

// Get the current settings from local storage and then create css rules and append them to the
// default style sheet.
export function pageStyleSettingsOnload() {
  const sheet = CSSUtils.getDefaultStylesheet();

  // TODO: use instanceof here with the proper type, which I forgot at the moment
  assert(typeof sheet !== 'undefined');

  sheet.addRule('article.entry', entryCSSCreateEntryRuleText());

  // TODO: convert these two to be like above pattern where I get the text and then add the rule
  entryCSSAddTitleRule(sheet);
  entryCSSAddContentRule(sheet);
}

function entryCSSCreateEntryRuleText() {
  const buffer = [];

  buffer.push('margin: 0px;');

  const path = localStorage.BG_IMAGE;
  const color = localStorage.BG_COLOR;

  if(path) {
    buffer.push(`background: url("${path}");`);
  } else if(color) {
    buffer.push(`background: ${color};`);
  }

  const padding = localStorage.PADDING;
  if(padding) {
    buffer.push(`padding: ${padding}px;`);
  }

  return buffer.join('');
}

function entryCSSAddTitleRule(sheet) {
  let buffer = [];
  const headerFontSize = parseInt10(localStorage.HEADER_FONT_SIZE || '0');
  if(headerFontSize) {
    buffer.push(`font-size: ${(headerFontSize / 10).toFixed(2)}em;`);
  }

  const headerFontFamily = localStorage.HEADER_FONT_FAMILY;
  if(headerFontFamily) {
    buffer.push(`font-family:${headerFontFamily};`);
  }

  sheet.addRule('article.entry a.entry-title', buffer.join(''));
}

function entryCSSAddContentRule(sheet) {
  let buffer = [];
  const bodyFontSize = parseInt10(localStorage.BODY_FONT_SIZE || '0');
  if(bodyFontSize) {
    buffer.push(`font-size: ${(bodyFontSize / 10).toFixed(2)}em;`);
  }

  const bodyJustifyText = localStorage.JUSTIFY_TEXT === '1';
  if(bodyJustifyText) {
    buffer.push('text-align: justify;');
  }

  const bodyFontFamily = localStorage.BODY_FONT_FAMILY;
  if(bodyFontFamily) {
    buffer.push(`font-family:${bodyFontFamily};`);
  }

  let bodyLineHeightString = localStorage.BODY_LINE_HEIGHT;
  if(bodyLineHeightString) {
    const bodyLineHeight = parseInt10(bodyLineHeightString);

    // TODO: units?
    if(bodyLineHeight) {
      buffer.push(`line-height: ${(bodyLineHeight / 10).toFixed(2)};`);
    }
  }

  buffer.push('vertical-align: text-top;');
  buffer.push('display: block;');
  buffer.push('word-wrap: break-word;');
  buffer.push('padding-top: 20px;');
  buffer.push('padding-right: 0px;');
  buffer.push('padding-left: 0px;');
  buffer.push('padding-bottom: 20px;');
  buffer.push('margin: 0px;');

  const columnCountString = localStorage.COLUMN_COUNT;
  if(columnCountString === '2' || columnCountString === '3') {
    buffer.push(`-webkit-column-count: ${columnCountString};`);
    buffer.push('-webkit-column-gap: 30px;');
    buffer.push('-webkit-column-rule: 1px outset #AAAAAA;');
  }

  sheet.addRule('article.entry span.entry-content', buffer.join(''));
}

function entryCSSUpdateRule(sheet) {
  assert(sheet);
  const rule = CSSUtils.findRule(sheet, 'article.entry');
  assert(rule);
  const style = rule.style;

  const path = localStorage.BG_IMAGE;
  const color = localStorage.BG_COLOR;

  if(path) {
    style.backgroundColor = '';
    style.backgroundImage = `url("${path}")`;
  } else if(color) {
    style.backgroundColor = color;
    style.backgroundImage = '';
  } else {
    style.backgroundColor = '';
    style.backgroundImage = '';
  }

  const padding = localStorage.PADDING || '0';
  style.padding = `${padding}px`;
}

function entryCSSUpdateTitleRule(sheet) {
  assert(sheet);
  const rule = CSSUtils.findRule(sheet, 'article.entry a.entry-title');
  assert(rule);
  const style = rule.style;

  style.background = '';
  style.fontFamily = localStorage.HEADER_FONT_FAMILY;

  const size = parseInt10(localStorage.HEADER_FONT_SIZE);
  if(!isNaN(size)) {
    style.fontSize = (size / 10).toFixed(2) + 'em';
  }
}

function entryCSSUpdateContentRule(sheet) {
  assert(sheet);
  const rule = CSSUtils.findRule(sheet, 'article.entry span.entry-content');
  assert(rule);

  rule.style.background = '';

  const bodyFontFamily = localStorage.BODY_FONT_FAMILY;
  if(bodyFontFamily) {
    rule.style.fontFamily = bodyFontFamily;
  } else {
    rule.style.fontFamily = 'initial';
  }

  const bodyFontSizeString = localStorage.BODY_FONT_SIZE;
  if(bodyFontSizeString) {
    const bodyFontSizeNumber = parseInt10(bodyFontSizeString);

    // TODO:
    // Why am I dividing by 10 here??
    // Why am I using em?
    // What is the base font?
    if(bodyFontSizeNumber) {
      rule.style.fontSize = (bodyFontSizeNumber / 10).toFixed(2) + 'em';
    }
  }

  rule.style.textAlign = (localStorage.JUSTIFY_TEXT === '1') ? 'justify' : 'left';

  const bodyLineHeight = parseInt10(localStorage.BODY_LINE_HEIGHT) || 10;
  rule.style.lineHeight = (bodyLineHeight / 10).toFixed(2);
  let columnCountString = localStorage.COLUMN_COUNT;
  const validColumnCounts = { '1': 1, '2': 1, '3': 1 };
  if(!(columnCountString in validColumnCounts)) {
    columnCountString = '1';
  }

  rule.style.webkitColumnCount = columnCountString;
}
