import * as cheerio from 'cheerio';
import { absoluteUrl, cleanText, toISO } from '../text.js';

// For pages with no feed: reads the public page like a browser would and treats every
// link whose path matches `linkPattern` as an entry. Title comes from the nearest heading,
// date from the nearest <time> element.
export function parseHtmlLinks(html, source) {
  const $ = cheerio.load(html);
  const pattern = new RegExp(source.linkPattern);
  const seen = new Map();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    const url = absoluteUrl(href, source.url);
    if (!url) return;
    const u = new URL(url);
    if (u.origin !== new URL(source.url).origin || !pattern.test(u.pathname)) return;
    const key = u.origin + u.pathname;
    const container = $(a).closest('article, li, section, div');
    const heading = cleanText($(a).find('h1,h2,h3,h4').first().text())
      || cleanText(container.find('h1,h2,h3,h4').first().text());
    const title = heading || cleanText($(a).text());
    const time = container.find('time').first();
    const date = toISO(time.attr('datetime') || time.text());
    const body = cleanText(container.find('p').first().text());
    const prev = seen.get(key);
    if (!prev || (!prev.title && title) || (!prev.date && date)) {
      seen.set(key, {
        title: prev?.title || title,
        url: key,
        date: prev?.date || date,
        body: prev?.body || (body !== title ? body : ''),
      });
    }
  });
  return [...seen.values()].filter((e) => e.title && e.title.length > 2);
}

export async function collectHtmlLinks(source, fetchText) {
  const html = await fetchText(source.url, { accept: 'text/html' });
  return parseHtmlLinks(html, source);
}
