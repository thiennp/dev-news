// The collector agent: visits every public source, extracts entries, reconciles
// duplicates across sources and stores the result.
import { SOURCES } from './sources.js';
import { fetchText, fetchJson } from './http.js';
import { collectFeed } from './adapters/feed.js';
import { collectGithubReleases } from './adapters/githubReleases.js';
import { collectMarkdownChangelog } from './adapters/markdownChangelog.js';
import { collectHtmlLinks } from './adapters/htmlLinks.js';
import { normalize, reconcile } from './reconcile.js';
import { loadStore, saveStore, upsert } from './store.js';

const ADAPTERS = {
  feed: collectFeed,
  'github-releases': collectGithubReleases,
  'markdown-changelog': collectMarkdownChangelog,
  'html-links': collectHtmlLinks,
};

async function pool(list, size, fn) {
  const results = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < list.length) {
      const i = next++;
      results[i] = await fn(list[i], i);
    }
  }));
  return results;
}

export async function runAgent({ sources = SOURCES, log = console } = {}) {
  const started = Date.now();
  const store = await loadStore();
  const health = {};
  const batches = await pool(sources, 6, async (source, rank) => {
    const adapter = ADAPTERS[source.type];
    try {
      if (!adapter) throw new Error(`unknown source type ${source.type}`);
      let entries;
      try {
        entries = await adapter(source, fetchText, fetchJson);
        if (!entries.length && source.fallback) throw new Error('no entries');
      } catch (err) {
        if (!source.fallback) throw err;
        const alt = { ...source, ...source.fallback };
        entries = await ADAPTERS[alt.type](alt, fetchText, fetchJson);
      }
      const items = normalize(entries, source, rank);
      health[source.id] = { ok: true, count: items.length, checkedAt: new Date().toISOString() };
      return items;
    } catch (err) {
      health[source.id] = { ok: false, error: String(err.message || err), checkedAt: new Date().toISOString() };
      log.warn?.(`[agent] ${source.id}: ${err.message || err}`);
      return [];
    }
  });
  const merged = reconcile(batches.flat());
  upsert(store, merged);
  store.sources = { ...store.sources, ...health };
  await saveStore(store);
  const ok = Object.values(health).filter((h) => h.ok).length;
  log.info?.(`[agent] ${ok}/${sources.length} sources ok, ${merged.length} items, ${Date.now() - started}ms`);
  return store;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAgent().catch((e) => { console.error(e); process.exit(1); });
}
