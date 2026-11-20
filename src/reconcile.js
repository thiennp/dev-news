import crypto from 'node:crypto';
import { cleanText, excerpt } from './text.js';

const TAG_RULES = [
  ['breaking', /\bbreaking change|\bbreaking\b|\bno longer supported|\bremoved support/i],
  ['security', /\bsecurity\b|\bvulnerab|\bCVE-\d{4}-\d+/i],
  ['deprecation', /\bdeprecat|\bend[- ]of[- ]life\b|\bsunset/i],
];

const VERSION_RE = /\bv?(\d+\.\d+(?:\.\d+)?(?:[-.][0-9A-Za-z.]+)?)\b/;

export function canonicalUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.hash = '';
    for (const p of [...u.searchParams.keys()]) if (/^(utm_|ref$|source$)/.test(p)) u.searchParams.delete(p);
    u.hostname = u.hostname.replace(/^www\./, '');
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

function tokens(title) {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9.+# ]+/g, ' ').split(/\s+/).filter((t) => t.length > 1),
  );
}

function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function detectTags(item) {
  const hay = `${item.title}\n${item.body ?? ''}`;
  const tags = TAG_RULES.filter(([, re]) => re.test(hay)).map(([t]) => t);
  const v = item.version ?? item.title.match(VERSION_RE)?.[1];
  if (v && /^\d+\.0(\.0)?$/.test(v) && v !== '0.0') tags.push('major');
  if (v) tags.push('release');
  return tags;
}

// Importance helps the UI highlight what most developers should not miss.
function score(tags) {
  return (tags.includes('breaking') ? 3 : 0) + (tags.includes('security') ? 3 : 0)
    + (tags.includes('major') ? 2 : 0) + (tags.includes('deprecation') ? 1 : 0);
}

export function hashId(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

// Turns raw entries from one source into normalized items.
export function normalize(entries, source, sourceRank) {
  const skip = source.skipTitle ? new RegExp(source.skipTitle, 'i') : null;
  return entries
    .filter((e) => e.title && !(skip && skip.test(e.title)))
    .slice(0, source.maxItems ?? 30)
    .map((e) => {
      const title = cleanText(e.title).replace(/\s+/g, ' ');
      const body = cleanText(e.body ?? '');
      const version = e.version ?? null;
      // Changelog anchors point at one version, so keep them; elsewhere the hash is noise.
      const url = (version && e.url) || canonicalUrl(e.url) || source.link || source.url;
      const key = version
        ? `${source.product.toLowerCase()}@${version}`
        : e.url ? url : `${source.id}:${title.toLowerCase()}`;
      const bullets = body.split('\n').filter((l) => l.startsWith('• ')).map((l) => l.slice(2));
      // Only the top of long release notes counts, so one PR title deep in a list of
      // hundreds does not mark the whole release as breaking or security.
      const tags = detectTags({ title, body: body.slice(0, 1200), version });
      return {
        id: hashId(key),
        key,
        title,
        url,
        date: e.date ?? null,
        product: source.product,
        category: source.category,
        sourceIds: [source.id],
        links: [{ label: source.product, url }],
        summary: excerpt(bullets.length ? bullets.slice(0, 3).join('; ') : body),
        highlights: bullets.slice(0, 8).map((b) => excerpt(b, 200)),
        moreHighlights: Math.max(bullets.length - 8, 0),
        tags,
        importance: score(tags),
        rank: sourceRank,
      };
    });
}

function mergeInto(a, b) {
  // The more specific source (listed earlier in SOURCES) owns product and category.
  const [primary, other] = a.rank <= b.rank ? [a, b] : [b, a];
  const links = [...primary.links];
  for (const l of other.links) if (!links.some((x) => canonicalUrl(x.url) === canonicalUrl(l.url))) links.push(l);
  const tags = [...new Set([...a.tags, ...b.tags])];
  const dates = [a.date, b.date].filter(Boolean).sort();
  return {
    ...primary,
    date: dates[0] ?? null,
    sourceIds: [...new Set([...primary.sourceIds, ...other.sourceIds])],
    links,
    summary: primary.summary.length >= other.summary.length ? primary.summary : other.summary,
    highlights: primary.highlights.length ? primary.highlights : other.highlights,
    tags,
    importance: score(tags),
  };
}

const FOUR_DAYS = 4 * 24 * 3600 * 1000;

// Reconciles items from every source: the same story reported by several sources
// (for example a GitHub release and the vendor's changelog post) becomes one item with
// several links.
export function reconcile(items) {
  const byKey = new Map();
  const byUrl = new Map();
  for (const item of items) {
    const existing = byKey.get(item.key) ?? (item.key === item.url ? byUrl.get(item.url) : undefined);
    const merged = existing ? mergeInto(existing, item) : item;
    if (existing) {
      byKey.delete(existing.key);
      byUrl.delete(existing.url);
    }
    byKey.set(merged.key, merged);
    byUrl.set(merged.url, merged);
  }
  const out = [];
  const sorted = [...byKey.values()].sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''));
  for (const item of sorted) {
    const t = item.date ? Date.parse(item.date) : null;
    const twin = out.find((o) => {
      if (o.sourceIds.some((s) => item.sourceIds.includes(s))) return false;
      const ot = o.date ? Date.parse(o.date) : null;
      if (t && ot && Math.abs(t - ot) > FOUR_DAYS) return false;
      return similarity(o.title, item.title) >= 0.75;
    });
    if (twin) out[out.indexOf(twin)] = mergeInto(twin, item);
    else out.push(item);
  }
  return out;
}
