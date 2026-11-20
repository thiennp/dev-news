# Contributing

Anyone can open a pull request. Nobody, including maintainers, pushes to `main` directly; every change
is reviewed in a PR, and Railway deploys `main` after it is merged.

## Adding a source

1. Add an entry to [`src/sources.js`](src/sources.js) under the right category.
2. Prefer, in this order: an official RSS/Atom feed, `github-releases`, a raw `CHANGELOG.md`
   (`markdown-changelog`), and only then `html-links` for a page with no feed.
3. Use `skipTitle` to drop pre-releases and nightlies so the feed stays useful.
4. Check it collects: `npm run collect`, then look for your source in `data/store.json` or at
   `http://localhost:3000/api/meta` after `npm start`.

Rules for sources:

- **Public only.** No logins, API keys, paywalls or scraping that breaks a site's terms.
- **Developer-relevant.** Tools, languages, frameworks and platforms developers build with.
  Not general tech news or company announcements.
- **Primary sources.** The vendor's own changelog, release notes or engineering blog.

## Adding a category

Add it to [`src/categories.js`](src/categories.js) and move the matching sources into it. Readers who
excluded categories keep their choices; new categories show up as included.

## Code changes

- Run `npm test` before you push. There is no CI here, so reviewers rely on it.
- Keep dependencies minimal. The app is plain Node.js with no build step.
- Never commit credentials, `.env` files or the `data/` directory.
