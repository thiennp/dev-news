import { isNoise, isHighlight, digestPatches, rankHighlights, kindOf } from './signal.js';
import { SOURCES } from './sources.js';
import { cleanHighlights } from './rewrite.js';

// Applies a source's title rules to items stored before those rules existed.
const SOURCE_RULES = new Map(SOURCES.map((s) => [s.id, {
  skip: s.skipTitle ? new RegExp(s.skipTitle, 'i') : null,
  only: s.onlyTitle ? new RegExp(s.onlyTitle, 'i') : null,
}]));
// Fields the page shows: the plain-language rewrite when there is one, otherwise the
// cleaned-up original.
function present(item) {
  const r = item.rewrite;
  const { rewrite, context, ...rest } = item;
  const points = r?.points?.length ? r.points : cleanHighlights(item.highlights ?? []);
  return {
    ...rest,
    headline: r?.headline || null,
    highlights: points,
    details: r?.details || '',
    action: r?.action || '',
    relevant: r ? r.relevant !== false : true,
  };
}

function passesSource(item) {
  return item.sourceIds.some((id) => {
    const r = SOURCE_RULES.get(id);
    return !r || (!(r.skip && r.skip.test(item.title)) && !(r.only && !r.only.test(item.title)));
  });
}

const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const itemDate = (i) => i.date ?? i.firstSeen;

// Filters shared by the JSON API and the RSS feed:
//   include=cat1,cat2    only these categories (default: all)
//   exclude=cat3         drop these categories
//   products=claude-code,cursor   only these source ids
//   hide=docker          drop these source ids
//   q=text   tag=breaking   important=1   days=30   limit=50   offset=0
//   view=highlights (default: only what most developers should not miss) | all
//   group=0      do not roll patch releases into weekly digests
export function filterItems(items, params) {
  const include = new Set(list(params.get('include')));
  const exclude = new Set(list(params.get('exclude')));
  const products = new Set(list(params.get('products')));
  const hide = new Set(list(params.get('hide')));
  const tag = params.get('tag');
  const q = (params.get('q') || '').toLowerCase().trim();
  const days = Number(params.get('days')) || 0;
  const since = days ? Date.now() - days * 864e5 : 0;
  const limit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), 200);
  const offset = Math.max(Number(params.get('offset')) || 0, 0);

  const view = params.get('view') === 'all' ? 'all' : 'highlights';
  const filtered = items
    .filter((i) => !isNoise(i) && passesSource(i))
    .map(present)
    .filter((i) => i.relevant)
    .filter((i) => (!include.size || include.has(i.category)) && !exclude.has(i.category))
    .filter((i) => (!products.size || i.sourceIds.some((s) => products.has(s))) && !i.sourceIds.every((s) => hide.has(s)))
    .filter((i) => !tag || i.tags.includes(tag))
    .filter((i) => params.get('important') !== '1' || i.importance > 0)
    .filter((i) => !since || Date.parse(itemDate(i)) >= since)
    .filter((i) => !q || `${i.title} ${i.product} ${i.summary} ${i.highlights.join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => itemDate(b).localeCompare(itemDate(a)));

  const grouped = params.get('group') === '0'
    ? filtered.map((i) => ({ ...i, kind: kindOf(i) }))
    : digestPatches(filtered);
  const shown = grouped
    .filter((i) => view === 'all' || isHighlight(i))
    .map((i) => (i.digest ? i : { ...i, highlights: rankHighlights(i.highlights ?? []) }));

  return { total: shown.length, view, offset, limit, items: shown.slice(offset, offset + limit) };
}

const esc = (s = '') => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

export function toRss(items, { siteUrl, query = '' }) {
  const entries = items.map((i) => `
    <item>
      <title>${esc(`[${i.product}] ${i.headline || i.title}`)}</title>
      <link>${esc(i.url)}</link>
      <guid isPermaLink="false">${esc(i.id)}</guid>
      <pubDate>${new Date(itemDate(i)).toUTCString()}</pubDate>
      <category>${esc(i.category)}</category>
      <description>${esc([
        i.headline ? i.title : '',
        i.details,
        i.action ? `What to do: ${i.action}` : '',
        i.highlights.length ? i.highlights.map((h) => `• ${h}`).join('\n') : i.summary,
      ].filter(Boolean).join('\n\n'))}</description>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Dev News</title>
    <link>${esc(siteUrl)}</link>
    <atom:link href="${esc(siteUrl + '/feed.xml' + query)}" rel="self" type="application/rss+xml"/>
    <description>Developer tool updates from public changelogs, release notes and blogs</description>${entries}
  </channel>
</rss>`;
}
