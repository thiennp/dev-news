// The list of public sources the collector agent reads.
// Adding a source is the most common contribution: append an entry and open a PR.
//
// type:
//   feed               RSS or Atom feed
//   github-releases    https://github.com/<repo>/releases.atom (no token needed)
//   markdown-changelog A raw CHANGELOG.md with "## <version>" headings
//   html-links         A public HTML page; entries are links whose path matches `linkPattern`
//
// Optional fields:
//   skipTitle   regex string; entries whose title matches are dropped (pre-releases, nightlies)
//   onlyTitle   regex string; only entries whose title matches are kept
//   npmPackage  for markdown-changelog: dates versions from the public npm registry
//   maxItems    keep only the newest N entries from this source (default 30)
//   fallback    { type, url, ... } tried when the main fetch fails or returns nothing

export const SOURCES = [
  // AI coding assistants
  {
    id: 'claude-code', product: 'Claude Code', category: 'ai-assistants', type: 'markdown-changelog',
    url: 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md',
    link: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
    npmPackage: '@anthropic-ai/claude-code', maxItems: 20,
  },
  {
    id: 'cursor', product: 'Cursor', category: 'ai-assistants', type: 'feed', url: 'https://cursor.com/atom.xml',
    // If the feed is down, read the public changelog page directly.
    fallback: { type: 'html-links', url: 'https://cursor.com/changelog', linkPattern: '^/(?:[a-z]{2}(?:-[A-Za-z]{2})?/)?changelog/[^/?#]+$' },
  },
  { id: 'copilot', product: 'GitHub Copilot', category: 'ai-assistants', type: 'feed', url: 'https://github.blog/changelog/label/copilot/feed/' },
  { id: 'codex', product: 'OpenAI Codex CLI', category: 'ai-assistants', type: 'github-releases', repo: 'openai/codex', skipTitle: '(alpha|beta|rc|nightly)' },
  { id: 'gemini-cli', product: 'Gemini CLI', category: 'ai-assistants', type: 'github-releases', repo: 'google-gemini/gemini-cli', skipTitle: '(nightly|preview|alpha|beta|rc)' },
  { id: 'cline', product: 'Cline', category: 'ai-assistants', type: 'github-releases', repo: 'cline/cline', skipTitle: '(alpha|beta|rc|nightly|^(Desktop|CLI|SDK) v|^sdk/)' },
  { id: 'aider', product: 'Aider', category: 'ai-assistants', type: 'github-releases', repo: 'Aider-AI/aider', skipTitle: '(dev|rc)' },

  // AI SDKs & protocols
  { id: 'claude-agent-sdk', product: 'Claude Agent SDK', category: 'ai-sdks', type: 'github-releases', repo: 'anthropics/claude-agent-sdk-typescript' },
  { id: 'mcp-ts-sdk', product: 'MCP TypeScript SDK', category: 'ai-sdks', type: 'github-releases', repo: 'modelcontextprotocol/typescript-sdk', skipTitle: '(alpha|beta|rc|^@)' },
  { id: 'openai-agents', product: 'OpenAI Agents SDK', category: 'ai-sdks', type: 'github-releases', repo: 'openai/openai-agents-python', skipTitle: '(alpha|beta|rc)' },

  // Editors & IDEs
  { id: 'vscode', product: 'VS Code', category: 'editors', type: 'feed', url: 'https://code.visualstudio.com/feed.xml', skipTitle: 'Insiders' },
  { id: 'zed', product: 'Zed', category: 'editors', type: 'github-releases', repo: 'zed-industries/zed', skipTitle: '(-pre|preview|nightly)' },

  // Languages & runtimes
  { id: 'nodejs', product: 'Node.js', category: 'languages', type: 'feed', url: 'https://nodejs.org/en/feed/blog.xml', skipTitle: '(alpha|beta|rc|nightly)' },
  { id: 'typescript', product: 'TypeScript', category: 'languages', type: 'feed', url: 'https://devblogs.microsoft.com/typescript/feed/' },
  { id: 'python', product: 'Python', category: 'languages', type: 'feed', url: 'https://pythoninsider.blogspot.com/feeds/posts/default' },
  { id: 'go', product: 'Go', category: 'languages', type: 'feed', url: 'https://go.dev/blog/feed.atom' },
  { id: 'rust', product: 'Rust', category: 'languages', type: 'feed', url: 'https://blog.rust-lang.org/feed.xml' },
  { id: 'bun', product: 'Bun', category: 'languages', type: 'feed', url: 'https://bun.sh/rss.xml' },
  { id: 'deno', product: 'Deno', category: 'languages', type: 'feed', url: 'https://deno.com/feed' },

  // Web frameworks
  { id: 'react', product: 'React', category: 'frameworks', type: 'feed', url: 'https://react.dev/rss.xml' },
  { id: 'nextjs', product: 'Next.js', category: 'frameworks', type: 'feed', url: 'https://nextjs.org/feed.xml' },
  { id: 'vite', product: 'Vite', category: 'frameworks', type: 'github-releases', repo: 'vitejs/vite', skipTitle: '(alpha|beta|rc|create-vite|plugin-legacy)' },
  { id: 'svelte', product: 'Svelte', category: 'frameworks', type: 'feed', url: 'https://svelte.dev/blog/rss.xml' },
  { id: 'astro', product: 'Astro', category: 'frameworks', type: 'feed', url: 'https://astro.build/rss.xml' },

  // Cloud & DevOps
  { id: 'github', product: 'GitHub', category: 'devops', type: 'feed', url: 'https://github.blog/changelog/feed/' },
  { id: 'vercel', product: 'Vercel', category: 'devops', type: 'feed', url: 'https://vercel.com/atom' },
  { id: 'cloudflare', product: 'Cloudflare', category: 'devops', type: 'feed', url: 'https://developers.cloudflare.com/changelog/rss/index.xml' },
  { id: 'docker', product: 'Docker', category: 'devops', type: 'feed', url: 'https://www.docker.com/blog/feed/' },
  { id: 'kubernetes', product: 'Kubernetes', category: 'devops', type: 'feed', url: 'https://kubernetes.io/feed.xml' },

  // Databases
  // The PostgreSQL news feed is mostly community and vendor posts; keep the project's own releases.
  { id: 'postgres', product: 'PostgreSQL', category: 'databases', type: 'feed', url: 'https://www.postgresql.org/news.rss', onlyTitle: '^PostgreSQL \\d' },
  { id: 'prisma', product: 'Prisma', category: 'databases', type: 'github-releases', repo: 'prisma/prisma', skipTitle: '(dev|integration|alpha|beta|rc)' },
];
