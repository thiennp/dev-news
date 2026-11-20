import * as cheerio from 'cheerio';

export function htmlToText(html = '') {
  if (!html) return '';
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  $('script, style, noscript, img, svg, iframe').remove();
  $('li').each((_, el) => { $(el).prepend('\n• '); });
  $('br, p, li, h1, h2, h3, h4, h5, h6, div, tr').after('\n');
  return $('#root').text();
}

export function cleanText(text = '') {
  return String(text)
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// A short, readable excerpt that ends on a word boundary.
export function excerpt(text = '', max = 320) {
  const flat = cleanText(text).replace(/\n+/g, ' · ');
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)).replace(/[\s·,;:]+$/, '') + '…';
}

export function toISO(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function absoluteUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// Release notes written in Markdown: list items become "• " bullets, headings and
// link syntax are flattened to text.
export function markdownToText(md = '') {
  return md
    .split(/\r?\n/)
    .map((l) => l
      .replace(/^\s*[-*+]\s+/, '• ')
      .replace(/^#{1,6}\s+/, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1'))
    .join('\n');
}
