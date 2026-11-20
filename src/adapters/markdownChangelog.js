// Splits a CHANGELOG.md into one entry per "## <version>" heading.
export function parseMarkdownChangelog(md, { product, link, maxItems = 30 } = {}) {
  const entries = [];
  let current = null;
  for (const line of md.split(/\r?\n/)) {
    const heading = line.match(/^##\s+\[?v?([0-9][^\]\s]*)\]?(?:\s*[-–(]\s*(\d{4}-\d{2}-\d{2}))?/);
    if (heading) {
      if (current) entries.push(current);
      if (entries.length >= maxItems) { current = null; break; }
      current = { version: heading[1], date: heading[2] ? new Date(heading[2]).toISOString() : null, lines: [] };
      continue;
    }
    if (current && line.trim()) current.lines.push(line.replace(/^\s*[-*]\s+/, '• ').trim());
  }
  if (current && entries.length < maxItems) entries.push(current);
  return entries.map((e) => ({
    title: `${product} ${e.version}`,
    version: e.version,
    url: link ? `${link}#${e.version.replace(/\./g, '')}` : null,
    date: e.date,
    body: e.lines.join('\n'),
  }));
}

export async function collectMarkdownChangelog(source, fetchText, fetchJson) {
  const md = await fetchText(source.url);
  const entries = parseMarkdownChangelog(md, { product: source.product, link: source.link, maxItems: source.maxItems });
  if (source.npmPackage) {
    try {
      const meta = await fetchJson(`https://registry.npmjs.org/${source.npmPackage.replace('/', '%2F')}`);
      for (const e of entries) e.date ??= meta.time?.[e.version] ?? null;
    } catch {
      // Dates are a nice-to-have; the agent falls back to first-seen time.
    }
  }
  return entries;
}
