// Decides what is worth a developer's attention.
//
//   noise      dropped everywhere (marketing, events, certifications, model listings)
//   kind       major | minor | patch | post   (from the version in the title)
//   highlight  shown in the default "Highlights" view
//
// Everything here works from fields every stored item already has (title, version,
// tags, highlights), so it also applies to items collected before it existed.

const NOISE = new RegExp([
  String.raw`ISO\/IEC`, String.raw`\bSOC ?2\b`, String.raw`\bcertif(?:ied|ication)\b`,
  String.raw`\bwebinars?\b`, String.raw`\bmeetups?\b`, String.raw`\bconference\b`, String.raw`\bsummit\b`,
  String.raw`\bcall for (?:papers|proposals|speakers)\b`, String.raw`\bsponsor(?:s|ship)?\b`,
  String.raw`\bcase stud(?:y|ies)\b`, String.raw`\bcustomer stor(?:y|ies)\b`, String.raw`\bhiring\b`,
  String.raw`\bawards?\b`, String.raw`\brecap\b`, String.raw`\bwrapped\b`, String.raw`\byear in review\b`,
  String.raw`\bnewsletter\b`, String.raw`\bthis (?:week|month) in\b`, String.raw`\bpodcast\b`,
  String.raw`\blivestream\b`, String.raw`\bon AI Gateway\b`, String.raw`\bnow available in AI Gateway\b`,
].join('|'), 'i');

const LAUNCH = /\b(introducing|announcing|launch(?:es|ed)?|generally available|is (?:now )?GA|now GA|now available|is here|released?)\b/i;
const FEATURE_LINE = /^(add(?:ed|s)?|new|introduc|support(?:s|ed)? for|now |enable[ds]?|allow|improv)/i;
const NEW_LINE = /^(add(?:ed|s)?|new|introduc|support(?:s|ed)? for)/i;
const FIX_LINE = /^(fix(?:ed|es)?|resolv|correct)/i;
const VERSION = /\bv?(\d+)\.(\d+)(?:\.(\d+))?(?![\w.-]*-(?:alpha|beta|rc))/;

export function isNoise(item) {
  return NOISE.test(item.title);
}

export function versionOf(item) {
  const m = String(item.version ?? item.title).match(VERSION);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: m[3] == null ? 0 : Number(m[3]), raw: `${m[1]}.${m[2]}${m[3] == null ? '' : '.' + m[3]}` };
}

export function kindOf(item) {
  const v = versionOf(item);
  if (!v || !(item.tags ?? []).includes('release')) return 'post';
  if (v.patch > 0) return 'patch';
  if (v.minor === 0 && v.major > 0) return 'major';
  return 'minor';
}

export function rankHighlights(lines) {
  const weight = (l) => (/breaking|deprecat|security|removed/i.test(l) ? 0 : NEW_LINE.test(l) ? 1 : FIX_LINE.test(l) ? 3 : 2);
  return [...lines].map((l, i) => [l, i]).sort((a, b) => weight(a[0]) - weight(b[0]) || a[1] - b[1]).map(([l]) => l);
}

export function countFeatures(lines) {
  return lines.filter((l) => FEATURE_LINE.test(l)).length;
}

export function isHighlight(item) {
  const tags = item.tags ?? [];
  if (tags.some((t) => ['breaking', 'security', 'deprecation', 'major'].includes(t))) return true;
  if (item.digest) return item.digest.features > 0;
  const kind = item.kind ?? kindOf(item);
  if (kind === 'major' || kind === 'minor') return true;
  if (kind === 'patch') return false;
  return LAUNCH.test(item.title);
}

// Monday of the item's week (UTC), used to bucket patch releases.
function weekKey(iso) {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

// Rolls patch releases of the same product and minor line within one week into a single
// digest entry, so a tool that ships daily shows up once a week with its best changes.
export function digestPatches(items) {
  const groups = new Map();
  const out = [];
  for (const item of items) {
    const kind = kindOf(item);
    if (kind !== 'patch') { out.push({ ...item, kind }); continue; }
    const v = versionOf(item);
    const key = `${item.product}|${v.major}.${v.minor}|${weekKey(item.date ?? item.firstSeen)}`;
    let g = groups.get(key);
    if (!g) {
      g = { items: [], slot: out.length };
      groups.set(key, g);
      out.push(null);
    }
    g.items.push({ ...item, kind, v });
  }
  for (const g of groups.values()) {
    const list = g.items;
    if (list.length === 1) { out[g.slot] = list[0]; continue; }
    const byVersion = [...list].sort((a, b) => a.v.patch - b.v.patch);
    const newest = byVersion[byVersion.length - 1];
    const oldest = byVersion[0];
    const lines = [...new Set(byVersion.slice().reverse().flatMap((i) => i.highlights ?? []))];
    const ranked = rankHighlights(lines);
    const tags = [...new Set(list.flatMap((i) => i.tags ?? []))];
    const headlines = [...new Set(byVersion.slice().reverse()
      .sort((a, b) => countFeatures(b.highlights ?? []) - countFeatures(a.highlights ?? []))
      .map((i) => i.headline).filter(Boolean))];
    out[g.slot] = {
      ...newest,
      id: `digest-${newest.id}`,
      title: `${newest.product} ${oldest.v.raw} → ${newest.v.raw}`,
      headline: headlines.slice(0, 2).join('; ') || null,
      details: list.map((i) => i.details).filter(Boolean).slice(0, 3).join(' '),
      action: list.map((i) => i.action).filter(Boolean)[0] || '',
      kind: 'digest',
      tags,
      importance: Math.max(...list.map((i) => i.importance ?? 0)),
      highlights: ranked.slice(0, 8),
      moreHighlights: Math.max(ranked.length - 8, 0),
      summary: newest.summary,
      digest: {
        releases: list.length,
        features: countFeatures(lines),
        fixes: lines.filter((l) => FIX_LINE.test(l)).length,
        versions: byVersion.map((i) => ({ version: i.v.raw, url: i.url, date: i.date ?? i.firstSeen })),
      },
    };
  }
  return out.filter(Boolean);
}
