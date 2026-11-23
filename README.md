# Dev News

Developer tool updates in one place, at **[news.agentwitch.com](https://news.agentwitch.com)**.

New Claude Code release? Cursor shipped a feature? Node.js security release? Dev News collects
changelogs, release notes and engineering blogs from public sources, merges duplicates, flags what
is breaking, security-related or a major version, and lets you keep only the categories you care
about.

## How it works

```
public sources ──► collector agent ──► reconcile ──► store ──► web UI / JSON API / RSS
 (feeds, GitHub     (src/agent.js)    (dedupe,       (data/    (filters per reader,
  releases, raw                         merge, tag)   store.json) saved in the browser)
  changelogs, pages)
```

- **Sources** live in [`src/sources.js`](src/sources.js). Each one has a product, a category and a
  type: `feed` (RSS/Atom), `github-releases`, `markdown-changelog` or `html-links` (reads a public
  page the way a browser would, for products that publish no feed).
- **The collector agent** ([`src/agent.js`](src/agent.js)) visits every source on start-up and every day
  at 07:00 and 13:00 Berlin time. A source
  that fails is skipped and reported on `/api/meta`; the rest still update.
- **Reconciliation** ([`src/reconcile.js`](src/reconcile.js)) merges the same story reported by several
  sources (same URL, same product version, or near-identical titles within four days) into one item
  with several links, and tags `breaking`, `security`, `deprecation` and `major`.
- **Signal over noise**: marketing, events, certifications and model-catalogue listings are dropped.
  The default **Highlights** view keeps breaking changes, security fixes, deprecations, new major and
  minor versions and launches, and rolls each tool's patch releases into one weekly entry
  ([`src/signal.js`](src/signal.js)). **Everything** shows the rest.
- **Plain-language rewrites** ([`src/rewrite.js`](src/rewrite.js)): when `ANTHROPIC_API_KEY` is set,
  Claude rewrites each new item into a short headline, the key changes, a self-contained explanation
  and, when needed, what to do. It names the actual problem instead of CVE or PR numbers. Without the
  key, PR/issue references and housekeeping lines are still stripped.
- **Categories**: AI coding assistants, AI SDKs & protocols, Editors & IDEs, Languages & runtimes,
  Web frameworks, Cloud & DevOps, Databases. Readers include or exclude whole categories or single
  products; the choice is kept in their browser.

Only public sources are used. Nothing needs credentials to run; the optional Claude key lives only in
the hosting environment.

## API

| Endpoint | What it returns |
| --- | --- |
| `GET /api/items` | Updates, newest first |
| `GET /feed.xml` | The same, as RSS |
| `GET /api/meta` | Categories, sources and the health of each source |
| `GET /healthz` | Liveness check |

`/api/items` and `/feed.xml` take the same filters:

| Param | Example | Meaning |
| --- | --- | --- |
| `include` | `ai-assistants,editors` | Only these categories |
| `exclude` | `devops` | Drop these categories |
| `products` | `claude-code,cursor` | Only these sources |
| `hide` | `docker` | Drop these sources |
| `view` | `all` | Everything instead of the default highlights |
| `group` | `0` | Do not roll patch releases into weekly digests |
| `important` | `1` | Only breaking, security, deprecation or major |
| `tag` | `security` | Only items with this tag |
| `q` | `mcp` | Text search |
| `days` | `7` | Only the last N days |
| `limit`, `offset` | `50`, `0` | Paging (limit max 200) |

Example: an RSS feed of AI tools only, important changes only:
`https://news.agentwitch.com/feed.xml?include=ai-assistants,ai-sdks&important=1`

## Run it locally

Needs Node.js 20 or newer.

```bash
npm install
npm start            # http://localhost:3000, collects on start and at 07:00 and 13:00 Berlin time
npm run collect      # one collection run, writes data/store.json
npm test
```

Environment variables (all optional):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port (Railway sets this) |
| `COLLECT_TIMES` | `07:00,13:00` | Daily collection times (HH:MM, comma-separated) |
| `COLLECT_TZ` | `Europe/Berlin` | Time zone for `COLLECT_TIMES` |
| `REFRESH_MINUTES` | unset | If set, collect every N minutes (min 15) instead of at fixed times |
| `DATA_DIR` | `./data` | Where the store is written. Point it at a Railway volume to keep history across deploys |
| `ANTHROPIC_API_KEY` | unset | Turns on plain-language rewrites. Set it in Railway, never in the repo |
| `REWRITE_MODEL` | `claude-opus-5-5` | Claude model used for rewrites |
| `SITE_URL` | `https://news.agentwitch.com` | Used in RSS links |

## Deployment

Railway deploys `main` automatically. There is no CI pipeline in this repository, so please run
`npm test` before opening a pull request. `main` is protected: every change goes through a pull
request.

## Contributing

Adding a source is the easiest way to help. See [CONTRIBUTING.md](CONTRIBUTING.md).
