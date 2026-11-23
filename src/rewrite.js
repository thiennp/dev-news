// Rewrites each update in plain words a developer gets at a glance: what changed, what
// the problem was, and what to do, with no bare IDs (CVE numbers, PR numbers, issue refs).
//
// Uses Claude when ANTHROPIC_API_KEY is set in the environment (never committed). Without
// it, a lighter text cleanup still removes PR/issue references and housekeeping lines.
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.REWRITE_MODEL || 'claude-opus-5-5';
const BATCH = 12;
const MAX_PER_RUN = Number(process.env.REWRITE_MAX_PER_RUN) || 120;
const MAX_AGE_DAYS = 45;

const SYSTEM = `You rewrite developer-tool release notes and changelog posts for a news timeline read by busy software engineers.

For each item, write:
- headline: what changed, in plain words, as short as possible while still precise (aim for under 80 characters). Lead with the change, not the product name or version. Example: "Background agents can now run in the cloud" rather than "Cursor 2.1 released".
- points: up to 4 short lines with the changes that matter most to a developer using the tool. New capabilities and breaking changes first, notable fixes after. Skip internal chores, tests, docs, CI, dependency bumps and contributor credits.
- details: what someone sees after tapping the item. 1 to 3 short sentences that make the change fully understandable on their own: what it is, why it matters or what problem it fixes, and who is affected. If a term would be unfamiliar to a typical developer, explain it in a few words inline instead of linking out. Shortest text that still needs no outside knowledge.
- action: one short line saying what the reader should do, only when they need to do something (upgrade because of a security fix, migrate off something deprecated or removed, change config). Otherwise an empty string.
- relevant: false when the item is not useful to developers who use the tool (marketing, company news, events, hiring, certifications, pricing promos, customer stories, listings of third-party models or partners). Otherwise true.

Rules:
- Never write bare identifiers such as CVE numbers, GHSA IDs, PR or issue numbers, commit hashes or usernames. Say what the issue is instead, e.g. "Crafted HTTP/2 headers could crash the server (denial of service)".
- Be concrete: name the API, flag, command or setting involved, in backticks.
- No hype, no filler words, no exclamation marks. Write for someone who will read each line once.
- Use only facts in the item. If the item says too little to explain something, say less rather than guess.`;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          headline: { type: 'string' },
          points: { type: 'array', items: { type: 'string' } },
          details: { type: 'string' },
          action: { type: 'string' },
          relevant: { type: 'boolean' },
        },
        required: ['id', 'headline', 'points', 'details', 'action', 'relevant'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export function contentKey(item) {
  return crypto.createHash('sha1')
    .update([item.title, item.summary, ...(item.highlights ?? []), item.context ?? ''].join('\n'))
    .digest('hex').slice(0, 12);
}

// Removes references and housekeeping that only make sense on GitHub.
export function cleanLine(line) {
  return line
    .replace(/^(feat|fix|perf)(\([^)]*\))?!?:\s*(.)/i, (_, type, scope, first) => (type.toLowerCase() === 'fix' ? 'Fixed ' + first : first.toUpperCase()))
    .replace(/\s*\bby @[\w-]+(?:\[bot\])? in (?:https?:\/\/\S+|#\d+)/gi, '')
    .replace(/\s*\([^()]*#\d+[^()]*\)/g, '')
    .replace(/\s*\(\s*[0-9a-f]{7,40}\s*\)/gi, '')
    .replace(/\s*https:\/\/github\.com\/\S+\/(?:pull|issues|commit)\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const HOUSEKEEPING = /^(chore|test|tests|ci|build|docs?|refactor|style|deps?|bump|release|changelog for|merge (?:pull request|branch)|full changelog|new contributors|.* made their first contribution)\b[(:\s]?/i;

export function cleanHighlights(lines = []) {
  return [...new Set(lines.filter((l) => !HOUSEKEEPING.test(l)).map(cleanLine).filter((l) => l.length > 2))];
}

function needsRewrite(item, now) {
  if (item.rewrite?.key === contentKey(item)) return false;
  const when = Date.parse(item.date ?? item.firstSeen);
  return now - when < MAX_AGE_DAYS * 864e5;
}

function promptFor(batch) {
  return batch.map((i) => [
    `<item id="${i.id}">`,
    `product: ${i.product}`,
    `title: ${i.title}`,
    i.summary ? `summary: ${i.summary}` : '',
    i.highlights?.length ? `changes:\n${i.highlights.map((h) => `- ${h}`).join('\n')}` : '',
    i.context ? `details: ${i.context}` : '',
    '</item>',
  ].filter(Boolean).join('\n')).join('\n\n');
}

export async function rewriteItems(store, { log = console, client } = {}) {
  if (!process.env.ANTHROPIC_API_KEY && !client) return { rewritten: 0, skipped: 'no ANTHROPIC_API_KEY' };
  const anthropic = client ?? new Anthropic();
  const now = Date.now();
  const todo = Object.values(store.items)
    .filter((i) => needsRewrite(i, now))
    .sort((a, b) => (b.date ?? b.firstSeen).localeCompare(a.date ?? a.firstSeen))
    .slice(0, MAX_PER_RUN);
  let rewritten = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      const response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: `Rewrite these ${batch.length} items.\n\n${promptFor(batch)}` }],
      });
      if (response.stop_reason !== 'end_turn') {
        log.warn?.(`[rewrite] batch stopped: ${response.stop_reason}`);
        continue;
      }
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const { items } = JSON.parse(text);
      for (const r of items) {
        const item = store.items[r.id];
        if (!item) continue;
        item.rewrite = {
          key: contentKey(item),
          headline: r.headline.trim(),
          points: r.points.map((p) => p.trim()).filter(Boolean).slice(0, 4),
          details: r.details.trim(),
          action: r.action.trim(),
          relevant: r.relevant,
        };
        rewritten++;
      }
    } catch (err) {
      log.warn?.(`[rewrite] batch failed: ${err.message || err}`);
    }
  }
  log.info?.(`[rewrite] ${rewritten}/${todo.length} items rewritten with ${MODEL}`);
  return { rewritten };
}
