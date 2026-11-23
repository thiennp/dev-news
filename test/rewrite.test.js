import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanHighlights, rewriteItems, contentKey } from '../src/rewrite.js';
import { upsert } from '../src/store.js';
import { filterItems } from '../src/query.js';

test('cleans GitHub references and housekeeping lines', () => {
  assert.deepEqual(cleanHighlights([
    'Changelog for v0.69.0 by @gemini-cli-robot in #30222',
    'feat(cli): add --remote flag by @alice in https://github.com/x/y/pull/1',
    'fix: crash on start (#12)',
    'chore(release): bump version',
    'test: add coverage',
    'Added a Snap package (#38369, thanks @dan)',
  ]), ['Add --remote flag', 'Fixed crash on start', 'Added a Snap package']);
});

const item = (id, extra = {}) => ({
  id, title: `Node.js ${id}`, product: 'Node.js', category: 'languages', sourceIds: ['nodejs'],
  tags: ['release'], highlights: ['Fixes CVE-2026-1234'], summary: '', date: new Date().toISOString(), ...extra,
});

test('stores Claude rewrites and skips unchanged items next time', async () => {
  const store = { items: { a: item('24.3.0'), b: item('Vercel certification') } };
  store.items['24.3.0'] = store.items.a; delete store.items.a;
  store.items['Vercel certification'] = store.items.b; delete store.items.b;
  let calls = 0;
  const client = { beta: { messages: { create: async (req) => {
    calls++;
    assert.equal(req.model, 'claude-opus-5-5');
    assert.match(req.messages[0].content, /<item id="24.3.0">/);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ items: [
      { id: '24.3.0', headline: 'Fixes a crash from malformed HTTP/2 headers', points: ['Upgrade if you serve HTTP/2'], details: 'A crafted request could crash the server.', action: 'Upgrade to 24.3.0', relevant: true },
      { id: 'Vercel certification', headline: 'Certification', points: [], details: '', action: '', relevant: false },
    ] }) }] };
  } } } };
  const log = { info() {}, warn() {} };
  assert.equal((await rewriteItems(store, { client, log })).rewritten, 2);
  assert.equal(store.items['24.3.0'].rewrite.key, contentKey(store.items['24.3.0']));
  await rewriteItems(store, { client, log });
  assert.equal(calls, 1);

  // A fresh collection run keeps the rewrite.
  upsert(store, [item('24.3.0')]);
  assert.equal(store.items['24.3.0'].rewrite.headline, 'Fixes a crash from malformed HTTP/2 headers');

  const out = filterItems(Object.values(store.items), new URLSearchParams('view=all'));
  assert.deepEqual(out.items.map((i) => i.id), ['24.3.0']);
  assert.equal(out.items[0].headline, 'Fixes a crash from malformed HTTP/2 headers');
  assert.equal(out.items[0].action, 'Upgrade to 24.3.0');
});
