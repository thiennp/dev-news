import { parseFeed } from './feed.js';
import { markdownToText, toISO } from '../text.js';

const versionTitle = (source, title) =>
  /^v?\d/.test(title.trim()) ? `${source.product} ${title.trim()}` : title.trim();

// Stable releases come from the public REST API (no token; it marks pre-releases).
// If that is rate-limited, the public Atom feed is the fallback.
export async function collectGithubReleases(source, fetchText, fetchJson) {
  if (fetchJson) {
    try {
      const list = await fetchJson(`https://api.github.com/repos/${source.repo}/releases?per_page=50`);
      if (Array.isArray(list)) {
        return list
          .filter((r) => !r.draft && !r.prerelease)
          .map((r) => ({
            title: versionTitle(source, r.name || r.tag_name),
            url: r.html_url,
            date: toISO(r.published_at || r.created_at),
            body: markdownToText(r.body || ''),
          }));
      }
    } catch {
      // fall through to the Atom feed
    }
  }
  const url = `https://github.com/${source.repo}/releases.atom`;
  const xml = await fetchText(url, { accept: 'application/atom+xml' });
  return parseFeed(xml, url).map((e) => ({ ...e, title: versionTitle(source, e.title) }));
}
