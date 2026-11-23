import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, reconcile, canonicalUrl, detectTags } from '../src/reconcile.js';
import { filterItems } from '../src/query.js';

const copilot = { id: 'copilot', product: 'GitHub Copilot', category: 'ai-assistants' };
const github = { id: 'github', product: 'GitHub', category: 'devops' };

test('canonicalUrl drops tracking params, www and trailing slash', () => {
  assert.equal(canonicalUrl('https://www.x.com/a/?utm_source=rss&id=2#top'), 'https://x.com/a/?id=2');
});

test('the same post from two feeds becomes one item owned by the more specific source', () => {
  const post = { title: 'Copilot agent mode is GA', url: 'https://github.blog/changelog/2026-11-10-agent-mode/', date: '2026-11-10T00:00:00Z', body: 'Now GA.' };
  const items = [...normalize([post], copilot, 0), ...normalize([{ ...post, url: post.url + '?utm_source=feed' }], github, 5)];
  const out = reconcile(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].product, 'GitHub Copilot');
  assert.equal(out[0].category, 'ai-assistants');
  assert.deepEqual(out[0].sourceIds.sort(), ['copilot', 'github']);
});

test('near-identical titles from different sources within days are merged', () => {
  const a = normalize([{ title: 'Introducing Next.js 16', url: 'https://nextjs.org/blog/next-16', date: '2026-10-21T00:00:00Z' }], { id: 'nextjs', product: 'Next.js', category: 'frameworks' }, 0);
  const b = normalize([{ title: 'Introducing Next.js 16!', url: 'https://vercel.com/blog/next-16', date: '2026-10-22T00:00:00Z' }], { id: 'vercel', product: 'Vercel', category: 'devops' }, 3);
  const out = reconcile([...a, ...b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].links.length, 2);
  assert.equal(out[0].date, '2026-10-21T00:00:00Z');
});

test('different versions stay separate', () => {
  const src = { id: 'claude-code', product: 'Claude Code', category: 'ai-assistants' };
  const out = reconcile(normalize([
    { title: 'Claude Code 2.1.3', version: '2.1.3', url: 'https://e.x/c#213' },
    { title: 'Claude Code 2.1.2', version: '2.1.2', url: 'https://e.x/c#212' },
  ], src, 0));
  assert.equal(out.length, 2);
});

test('pre-releases are skipped with skipTitle', () => {
  const out = normalize([{ title: '0.172.0-alpha.1', url: 'https://a' }, { title: '0.171.0', url: 'https://b' }],
    { id: 'codex', product: 'Codex', category: 'ai-assistants', skipTitle: '(alpha|beta|rc)' }, 0);
  assert.deepEqual(out.map((i) => i.title), ['0.171.0']);
});

test('tags breaking, security and major releases', () => {
  assert.deepEqual(detectTags({ title: 'Vite 7.0.0', body: 'BREAKING CHANGE: drops Node 18' }).sort(), ['breaking', 'major', 'release']);
  assert.ok(detectTags({ title: 'Node.js security release', body: 'Fixes CVE-2026-1234' }).includes('security'));
});

test('filters by category include/exclude and hidden products', () => {
  const items = [
    { id: '1', title: 'a', product: 'A', category: 'ai-assistants', sourceIds: ['cursor'], tags: [], importance: 0, summary: '', highlights: [], date: '2026-11-19T00:00:00Z' },
    { id: '2', title: 'b', product: 'B', category: 'languages', sourceIds: ['go'], tags: ['breaking'], importance: 3, summary: '', highlights: [], date: '2026-11-18T00:00:00Z' },
    { id: '3', title: 'c', product: 'C', category: 'ai-assistants', sourceIds: ['cline'], tags: [], importance: 0, summary: '', highlights: [], date: '2026-11-17T00:00:00Z' },
  ];
  const ids = (q) => filterItems(items, new URLSearchParams(q)).items.map((i) => i.id);
  assert.deepEqual(ids('exclude=languages'), ['1', '3']);
  assert.deepEqual(ids('include=languages'), ['2']);
  assert.deepEqual(ids('hide=cline'), ['1', '2']);
  assert.deepEqual(ids('important=1'), ['2']);
});

test('drops empty bullets and future dates', () => {
  const [item] = normalize([{ title: 'Release 1.2.0', url: 'https://x/1', date: '2999-01-01T00:00:00Z', body: '• Added a\n•\n• \n• Fixed b' }],
    { id: 'x', product: 'X', category: 'editors' }, 0);
  assert.deepEqual(item.highlights, ['Added a', 'Fixed b']);
  assert.equal(item.date, null);
});
