import test from 'node:test';
import assert from 'node:assert/strict';
import { isNoise, kindOf, isHighlight, digestPatches, rankHighlights } from '../src/signal.js';
import { filterItems } from '../src/query.js';

const rel = (product, version, date, highlights = [], extra = {}) => ({
  id: `${product}-${version}`, title: `${product} ${version}`, version, product, category: 'ai-assistants',
  sourceIds: ['claude-code'], tags: ['release'], importance: 0, summary: '', highlights, date, url: `https://x/${version}`, ...extra,
});

test('drops marketing and event noise', () => {
  assert.ok(isNoise({ title: 'Vercel completes ISO/IEC 42001:2023 certification' }));
  assert.ok(isNoise({ title: 'GPT-Live 1.1 now available on AI Gateway' }));
  assert.ok(isNoise({ title: 'Nordic PGDay 2027 - Call for Papers & Sponsors!' }));
  assert.ok(isNoise({ title: 'VS Code Wrapped: GitHub Universe 2026' }));
  assert.ok(!isNoise({ title: 'Wait for pull request events with GitHub CLI' }));
  assert.ok(!isNoise({ title: 'Vercel Functions now support request bodies up to 20MiB' }));
});

test('classifies versions', () => {
  assert.equal(kindOf(rel('Vite', '8.0.0')), 'major');
  assert.equal(kindOf(rel('Codex', '0.171.0')), 'minor');
  assert.equal(kindOf(rel('Claude Code', '2.1.329')), 'patch');
  assert.equal(kindOf({ title: 'Pin your favorite repositories', tags: [] }), 'post');
});

test('highlights keep launches, minors and important changes, not patches or small posts', () => {
  assert.ok(isHighlight(rel('Codex', '0.171.0')));
  assert.ok(!isHighlight(rel('Zed', '1.29.3')));
  assert.ok(isHighlight(rel('Zed', '1.29.4', null, [], { tags: ['release', 'security'] })));
  assert.ok(isHighlight({ title: 'Introducing Vercel Board', tags: [] }));
  assert.ok(isHighlight({ title: 'Security advisory permissions are now generally available', tags: [] }));
  assert.ok(!isHighlight({ title: 'Pin your favorite repositories to your dashboard', tags: [] }));
});

test('rolls a week of patch releases into one digest with features first', () => {
  const items = [
    rel('Claude Code', '2.1.329', '2026-11-20T10:00:00Z', ['Fixed a crash', 'Added /tasks view']),
    rel('Claude Code', '2.1.328', '2026-11-19T10:00:00Z', ['Fixed login']),
    rel('Claude Code', '2.1.327', '2026-11-17T10:00:00Z', ['Added hooks warning']),
    rel('Claude Code', '2.1.320', '2026-11-12T10:00:00Z', ['Fixed old']),
  ];
  const out = digestPatches(items);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Claude Code 2.1.327 → 2.1.329');
  assert.equal(out[0].digest.releases, 3);
  assert.equal(out[0].digest.features, 2);
  assert.deepEqual(out[0].highlights.slice(0, 2), ['Added /tasks view', 'Added hooks warning']);
  assert.ok(isHighlight(out[0]));
  assert.equal(out[1].kind, 'patch');
});

test('ranks breaking and new features above fixes', () => {
  assert.deepEqual(rankHighlights(['Fixed a', 'Improved b', 'Added c', 'Removed d (breaking)']), ['Removed d (breaking)', 'Added c', 'Improved b', 'Fixed a']);
});

test('the highlights view is the default and hides stored items a source now skips', () => {
  const items = [
    { ...rel('Codex', '0.171.0', '2026-11-20T00:00:00Z'), sourceIds: ['codex'] },
    { id: 'pg', title: 'pgjumbo: a new free desktop client for PostgreSQL', product: 'PostgreSQL', category: 'databases', sourceIds: ['postgres'], tags: [], highlights: [], summary: '', date: '2026-11-19T00:00:00Z' },
    { id: 'gh', title: 'Pin your favorite repositories', product: 'GitHub', category: 'devops', sourceIds: ['github'], tags: [], highlights: [], summary: '', date: '2026-11-18T00:00:00Z' },
  ];
  assert.deepEqual(filterItems(items, new URLSearchParams('')).items.map((i) => i.id), ['Codex-0.171.0']);
  assert.deepEqual(filterItems(items, new URLSearchParams('view=all')).items.map((i) => i.id), ['Codex-0.171.0', 'gh']);
});
