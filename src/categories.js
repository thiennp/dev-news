// Every source belongs to exactly one category. Readers include or exclude
// categories (and individual products) in the UI; the API accepts the same filters.
export const CATEGORIES = [
  { id: 'ai-assistants', name: 'AI coding assistants', description: 'Claude Code, Cursor, Copilot, Codex, Gemini CLI and friends' },
  { id: 'ai-sdks', name: 'AI SDKs & protocols', description: 'Agent SDKs, MCP and model APIs for builders' },
  { id: 'editors', name: 'Editors & IDEs', description: 'VS Code, Zed and other editors' },
  { id: 'languages', name: 'Languages & runtimes', description: 'Node.js, TypeScript, Python, Go, Rust, Bun, Deno' },
  { id: 'frameworks', name: 'Web frameworks', description: 'React, Next.js, Vite, Svelte, Astro' },
  { id: 'devops', name: 'Cloud & DevOps', description: 'GitHub, Vercel, Cloudflare, Docker, Kubernetes' },
  { id: 'databases', name: 'Databases', description: 'PostgreSQL, Prisma' },
];

export const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
