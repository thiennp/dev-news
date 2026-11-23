import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from './categories.js';
import { SOURCES } from './sources.js';
import { loadStore } from './store.js';
import { runAgent } from './agent.js';
import { filterItems, toRss } from './query.js';
import { parseTimes, scheduleDaily } from './schedule.js';

const PORT = Number(process.env.PORT) || 3000;
const SITE_URL = process.env.SITE_URL || 'https://news.agentwitch.com';
// Collection runs on start-up and then at fixed times each day. Setting
// REFRESH_MINUTES switches to a simple interval instead.
const COLLECT_TIMES = parseTimes(process.env.COLLECT_TIMES || '07:00,13:00');
const COLLECT_TZ = process.env.COLLECT_TZ || 'Europe/Berlin';
const REFRESH_MINUTES = process.env.REFRESH_MINUTES ? Math.max(15, Number(process.env.REFRESH_MINUTES) || 120) : null;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

let store = await loadStore();
let running = null;

async function refresh() {
  if (running) return running;
  running = runAgent()
    .then((s) => { store = s; })
    .catch((e) => console.error('[agent] run failed', e))
    .finally(() => { running = null; });
  return running;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 404, { error: 'not found' });
  try {
    const body = await fs.readFile(file);
    send(res, 200, body, MIME[path.extname(file)] ?? 'application/octet-stream', { 'cache-control': 'public, max-age=300' });
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
  const items = Object.values(store.items ?? {});
  switch (url.pathname) {
    case '/healthz':
      return send(res, 200, { ok: true, items: items.length, updatedAt: store.updatedAt });
    case '/api/meta':
      return send(res, 200, {
        updatedAt: store.updatedAt,
        categories: CATEGORIES,
        sources: SOURCES.map((s) => ({
          id: s.id, product: s.product, category: s.category, type: s.type,
          url: s.url ?? `https://github.com/${s.repo}/releases`, health: store.sources?.[s.id] ?? null,
        })),
      }, undefined, { 'cache-control': 'public, max-age=60' });
    case '/api/items': {
      const result = filterItems(items, url.searchParams);
      return send(res, 200, { updatedAt: store.updatedAt, ...result }, undefined, { 'cache-control': 'public, max-age=60' });
    }
    case '/feed.xml': {
      const { items: list } = filterItems(items, url.searchParams);
      return send(res, 200, toRss(list, { siteUrl: SITE_URL, query: url.search }), 'application/rss+xml; charset=utf-8', { 'cache-control': 'public, max-age=300' });
    }
    default:
      return serveStatic(res, url.pathname);
  }
});

server.listen(PORT, () => {
  if (REFRESH_MINUTES) {
    console.log(`[server] listening on :${PORT}, collecting every ${REFRESH_MINUTES} min`);
    setInterval(refresh, REFRESH_MINUTES * 60 * 1000).unref();
  } else {
    console.log(`[server] listening on :${PORT}, collecting daily at ${COLLECT_TIMES.join(', ')} (${COLLECT_TZ})`);
    scheduleDaily(COLLECT_TIMES, COLLECT_TZ, refresh);
  }
  refresh();
});
