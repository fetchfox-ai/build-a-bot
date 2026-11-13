import { parse } from 'node-html-parser';

const voidTags = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const inlineTags = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'button',
  'cite',
  'code',
  'data',
  'del',
  'em',
  'i',
  'iframe',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'mark',
  'meter',
  'output',
  'picture',
  'progress',
  'q',
  's',
  'samp',
  'select',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'svg',
  'time',
  'u',
  'var',
  'wbr',
]);

const rawTextTags = new Set(['code', 'pre', 'script', 'style', 'textarea']);

const isWhitespace = (node) => node.nodeType === 3 && !node.rawText.trim();

const tagName = (node) => (node.rawTagName || '').toLowerCase();

const openingTag = (node) => {
  const attrs = node.rawAttrs ? ` ${node.rawAttrs}` : '';
  return `<${node.rawTagName}${attrs}>`;
};

const compact = (node) => {
  if (node.nodeType === 3) {
    return node.rawText.replace(/\s+/g, ' ');
  }
  if (node.nodeType === 8) {
    return `<!--${node.rawText}-->`;
  }

  const tag = tagName(node);
  if (!tag) {
    return node.rawText.trim();
  }
  if (voidTags.has(tag)) {
    return openingTag(node);
  }
  if (rawTextTags.has(tag)) {
    return node.toString();
  }
  return `${openingTag(node)}${(node.childNodes || []).map(compact).join('')}</${node.rawTagName}>`;
};

const hasOnlyInlineContent = (nodes) =>
  nodes.every((node) => {
    if (node.nodeType === 3 || node.nodeType === 8) {
      return true;
    }
    return inlineTags.has(tagName(node));
  });

const formatNode = (node, depth, indent) => {
  const prefix = indent.repeat(depth);
  if (node.nodeType === 3) {
    const text = node.rawText.trim();
    return text ? `${prefix}${text.replace(/\s+/g, ' ')}` : '';
  }
  if (node.nodeType === 8) {
    return `${prefix}<!--${node.rawText}-->`;
  }

  const tag = tagName(node);
  if (!tag) {
    return `${prefix}${node.rawText.trim()}`;
  }
  if (voidTags.has(tag)) {
    return `${prefix}${openingTag(node)}`;
  }
  if (rawTextTags.has(tag)) {
    return `${prefix}${node.toString()}`;
  }

  const children = (node.childNodes || []).filter((child) => !isWhitespace(child));
  if (!children.length) {
    return `${prefix}${openingTag(node)}</${node.rawTagName}>`;
  }
  if (hasOnlyInlineContent(children)) {
    return `${prefix}${openingTag(node)}${children.map(compact).join('').trim()}</${node.rawTagName}>`;
  }

  const lines = children
    .map((child) => formatNode(child, depth + 1, indent))
    .filter(Boolean)
    .join('\n');
  return `${prefix}${openingTag(node)}\n${lines}\n${prefix}</${node.rawTagName}>`;
};

/**
 * Format HTML for readable logs and document output without changing the
 * contents of whitespace-sensitive elements.
 */
export const beautifyHtml = (html, indentSize = 2) => {
  const indent = ' '.repeat(indentSize);
  const root = parse(html || '', { comment: true });
  return root.childNodes
    .filter((node) => !isWhitespace(node))
    .map((node) => formatNode(node, 0, indent))
    .filter(Boolean)
    .join('\n');
};
