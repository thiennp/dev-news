import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DATA_DIR, 'store.json');
const MAX_ITEMS = 4000;
const MAX_AGE_DAYS = 180;

export async function loadStore() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return { items: {}, sources: {}, updatedAt: null };
  }
}

export async function saveStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store));
  await fs.rename(tmp, FILE);
}

// Merges a fresh, reconciled batch into the store while keeping the time we first saw
// each item (used as its date when a source publishes none).
export function upsert(store, items, now = new Date().toISOString()) {
  for (const item of items) {
    const prev = store.items[item.id];
    store.items[item.id] = { ...item, firstSeen: prev?.firstSeen ?? now, ...(prev?.rewrite ? { rewrite: prev.rewrite } : {}) };
  }
  const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
  const all = Object.values(store.items)
    .filter((i) => Date.parse(i.date ?? i.firstSeen) >= cutoff)
    .sort((a, b) => (b.date ?? b.firstSeen).localeCompare(a.date ?? a.firstSeen))
    .slice(0, MAX_ITEMS);
  store.items = Object.fromEntries(all.map((i) => [i.id, i]));
  store.updatedAt = now;
  return store;
}
