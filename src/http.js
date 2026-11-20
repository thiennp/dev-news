const USER_AGENT = 'dev-news-collector/1.0 (+https://news.agentwitch.com; public sources only)';

export async function fetchText(url, { timeoutMs = 20000, accept } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: accept || '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function fetchJson(url, opts) {
  return JSON.parse(await fetchText(url, { ...opts, accept: 'application/json' }));
}
