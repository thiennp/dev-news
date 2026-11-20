import { XMLParser } from 'fast-xml-parser';
import { htmlToText, toISO, absoluteUrl } from '../text.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  processEntities: true,
  htmlEntities: true,
});

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function text(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return text(node[0]);
  return text(node['#cdata'] ?? node['#text'] ?? '');
}

function atomLink(links, base) {
  const all = asArray(links);
  const pick = all.find((l) => typeof l === 'object' && (!l['@rel'] || l['@rel'] === 'alternate')) ?? all[0];
  const href = typeof pick === 'string' ? pick : pick?.['@href'];
  return href ? absoluteUrl(href, base) : null;
}

// Parses RSS 2.0, RSS 1.0 (RDF) and Atom into plain entries.
export function parseFeed(xml, baseUrl) {
  const doc = parser.parse(xml);
  if (doc.feed) {
    return asArray(doc.feed.entry).map((e) => ({
      title: text(e.title),
      url: atomLink(e.link, baseUrl),
      date: toISO(text(e.published) || text(e.updated)),
      body: htmlToText(text(e.content) || text(e.summary)),
    }));
  }
  const channel = doc.rss?.channel ?? doc['rdf:RDF'];
  const items = asArray(channel?.item ?? doc['rdf:RDF']?.item);
  return items.map((i) => ({
    title: text(i.title),
    url: absoluteUrl(text(i.link) || text(i.guid), baseUrl),
    date: toISO(text(i.pubDate) || text(i['dc:date']) || text(i.published)),
    body: htmlToText(text(i['content:encoded']) || text(i.description)),
  }));
}

export async function collectFeed(source, fetchText) {
  const xml = await fetchText(source.url, { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' });
  return parseFeed(xml, source.url);
}
