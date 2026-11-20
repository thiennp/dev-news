import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../src/adapters/feed.js';
import { parseMarkdownChangelog } from '../src/adapters/markdownChangelog.js';
import { parseHtmlLinks } from '../src/adapters/htmlLinks.js';

test('parses RSS 2.0', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
    <item><title>Node v24.1.0 (Current)</title><link>https://nodejs.org/en/blog/release/v24.1.0</link>
    <pubDate>Tue, 10 Nov 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Hello <b>world</b></p>]]></description></item>
  </channel></rss>`;
  const [e] = parseFeed(xml, 'https://nodejs.org/feed');
  assert.equal(e.title, 'Node v24.1.0 (Current)');
  assert.equal(e.url, 'https://nodejs.org/en/blog/release/v24.1.0');
  assert.equal(e.date, '2026-11-10T12:00:00.000Z');
  assert.match(e.body, /Hello world/);
});

test('parses Atom with relative links and list items', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v1.2.0</title>
    <link rel="alternate" href="/owner/repo/releases/tag/v1.2.0"/><updated>2026-11-01T00:00:00Z</updated>
    <content type="html">&lt;ul&gt;&lt;li&gt;Added a&lt;/li&gt;&lt;li&gt;Fixed b&lt;/li&gt;&lt;/ul&gt;</content></entry></feed>`;
  const [e] = parseFeed(xml, 'https://github.com/owner/repo/releases.atom');
  assert.equal(e.url, 'https://github.com/owner/repo/releases/tag/v1.2.0');
  assert.match(e.body, /• Added a/);
  assert.match(e.body, /• Fixed b/);
});

test('splits a CHANGELOG.md by version heading', () => {
  const md = '# Changelog\n\n## 2.1.3\n\n- Added x\n- Fixed y\n\n## 2.1.2 - 2026-11-01\n\n- Old\n';
  const out = parseMarkdownChangelog(md, { product: 'Claude Code', link: 'https://e.x/CHANGELOG.md' });
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Claude Code 2.1.3');
  assert.equal(out[0].url, 'https://e.x/CHANGELOG.md#213');
  assert.equal(out[0].body, '• Added x\n• Fixed y');
  assert.equal(out[1].date, '2026-11-01T00:00:00.000Z');
});

test('reads entries from an HTML page by link pattern', () => {
  const html = `<main>
    <article><a href="/changelog/2-1"><h2>Background agents</h2></a><time datetime="2026-11-12">Nov 12</time><p>Agents run in the cloud.</p></article>
    <article><a href="/changelog/2-0">Read more</a><h3>Tab model v2</h3></article>
    <a href="/pricing">Pricing</a>
  </main>`;
  const out = parseHtmlLinks(html, { url: 'https://cursor.com/changelog', linkPattern: '^/changelog/[^/]+$' });
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { title: 'Background agents', url: 'https://cursor.com/changelog/2-1', date: '2026-11-12T00:00:00.000Z', body: 'Agents run in the cloud.' });
  assert.equal(out[1].title, 'Tab model v2');
});
