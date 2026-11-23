const PREFS_KEY = 'dev-news-prefs-v2';
const PAGE = 30;
const $ = (s) => document.querySelector(s);

const defaults = { view: 'highlights', excluded: [], hidden: [], days: '30', q: '' };
function loadPrefs() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { ...defaults }; }
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}

const prefs = loadPrefs();
let meta = null;
let offset = 0;
let total = 0;
let lastDay = null;

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const catVar = (id) => `--cat: var(--c-${id})`;

function queryString(extra = {}) {
  const p = new URLSearchParams();
  if (prefs.view === 'all') p.set('view', 'all');
  if (prefs.excluded.length) p.set('exclude', prefs.excluded.join(','));
  if (prefs.hidden.length) p.set('hide', prefs.hidden.join(','));
  if (prefs.days !== '0') p.set('days', prefs.days);
  if (prefs.q) p.set('q', prefs.q);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

function renderControls() {
  $('#chips').innerHTML = meta.categories.map((c) => `
    <button type="button" class="chip" style="${catVar(c.id)}" data-cat="${c.id}" aria-pressed="${!prefs.excluded.includes(c.id)}" title="${esc(c.description)}">
      <span class="dot" aria-hidden="true"></span>${esc(c.name)}
    </button>`).join('');
  $('#products').innerHTML = meta.categories.map((c) => {
    const sources = meta.sources.filter((s) => s.category === c.id);
    const off = prefs.excluded.includes(c.id);
    return `<h3>${esc(c.name)}</h3>${sources.map((s) => `
      <label><input type="checkbox" value="${s.id}" ${!off && !prefs.hidden.includes(s.id) ? 'checked' : ''} ${off ? 'disabled' : ''}> ${esc(s.product)}</label>`).join('')}`;
  }).join('');
  for (const b of document.querySelectorAll('.view-switch button')) b.setAttribute('aria-checked', String(b.dataset.view === prefs.view));
  $('#days').value = prefs.days;
  $('#hidden-count').textContent = prefs.hidden.length ? `(${prefs.hidden.length} hidden)` : '';
  $('#rss').href = `/feed.xml?${queryString()}`;
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

const BADGES = { breaking: 'Breaking', security: 'Security', deprecation: 'Deprecation', major: 'Major release' };

function entry(i) {
  const at = i.date ?? i.firstSeen;
  const time = new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const badges = Object.entries(BADGES).filter(([t]) => i.tags.includes(t)).map(([t, label]) => `<span class="badge ${t}">${label}</span>`);
  if (i.digest) badges.push(`<span class="badge">${i.digest.releases} releases this week</span>`);
  const alert = i.tags.includes('breaking') || i.tags.includes('security');
  const big = alert || i.kind === 'major';
  const headline = i.headline || i.title;
  const sub = i.headline ? i.title : '';
  const points = i.highlights.slice(0, 3);
  const rest = i.highlights.slice(3);
  const hasMore = rest.length || i.details || i.action || i.digest || i.links.length > 1;
  const more = hasMore ? `
    <details class="expand"><summary>Details</summary>
      ${i.details ? `<p class="summary">${rich(i.details)}</p>` : ''}
      ${i.action ? `<p class="summary"><strong>What to do:</strong> ${rich(i.action)}</p>` : ''}
      ${rest.length ? `<ul class="points">${rest.map((h) => `<li>${rich(h)}</li>`).join('')}</ul>` : ''}
      ${i.digest ? `<div class="versions">${i.digest.versions.map((v) => `<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.version)}</a>`).join('')}</div>` : ''}
      ${i.links.length > 1 ? `<div class="also">Also reported by ${i.links.slice(1).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(', ')}</div>` : ''}
    </details>` : '';
  return `<li class="entry ${big ? 'big' : ''} ${alert ? 'alert' : ''}" style="${catVar(i.category)}">
    <div class="when"><time datetime="${esc(at)}">${time}</time></div>
    <div class="node" aria-hidden="true"></div>
    <article class="card">
      <div class="meta"><span class="product">${esc(i.product)}</span>${badges.join('')}<span class="time">${time}</span></div>
      <h3><a href="${esc(i.url)}" target="_blank" rel="noopener">${rich(headline)}</a></h3>
      ${sub ? `<div class="meta">${esc(sub)}</div>` : ''}
      ${points.length ? `<ul class="points">${points.map((h) => `<li>${rich(h)}</li>`).join('')}</ul>` : i.summary && !i.headline ? `<p class="summary">${rich(i.summary)}</p>` : ''}
      ${more}
    </article>
  </li>`;
}

async function load(reset = true) {
  if (reset) { offset = 0; lastDay = null; $('#timeline').innerHTML = ''; }
  $('#status').textContent = 'Loading…';
  const data = await (await fetch(`/api/items?${queryString({ limit: PAGE, offset })}`)).json();
  total = data.total;
  let html = '';
  for (const i of data.items) {
    const day = dayLabel(i.date ?? i.firstSeen);
    if (day !== lastDay) { html += `<li class="day"><span>${esc(day)}</span></li>`; lastDay = day; }
    html += entry(i);
  }
  $('#timeline').insertAdjacentHTML('beforeend', html);
  offset += data.items.length;
  $('#more').hidden = offset >= total;
  if (!total) {
    $('#timeline').innerHTML = `<li class="empty">${data.updatedAt ? 'Nothing here for these filters. Try a longer range, more categories, or Everything.' : 'The first collection is running. Check back in a minute.'}</li>`;
  }
  const updated = data.updatedAt ? `updated ${new Date(data.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : '';
  const label = prefs.view === 'all' ? 'updates' : 'highlights';
  $('#status').textContent = [total ? `${total} ${label}` : '', updated].filter(Boolean).join(' · ');
}

let timer;
function changed(debounce = 0) {
  savePrefs();
  renderControls();
  clearTimeout(timer);
  timer = setTimeout(() => load(true), debounce);
}

function bind() {
  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const id = b.dataset.cat;
    prefs.excluded = prefs.excluded.includes(id) ? prefs.excluded.filter((c) => c !== id) : [...prefs.excluded, id];
    changed();
  });
  $('#products').addEventListener('change', (e) => {
    const t = e.target;
    prefs.hidden = t.checked ? prefs.hidden.filter((s) => s !== t.value) : [...new Set([...prefs.hidden, t.value])];
    changed();
  });
  for (const b of document.querySelectorAll('.view-switch button')) {
    b.addEventListener('click', () => { prefs.view = b.dataset.view; changed(); });
  }
  $('#days').addEventListener('change', (e) => { prefs.days = e.target.value; changed(); });
  $('#q').addEventListener('input', (e) => { prefs.q = e.target.value.trim(); savePrefs(); clearTimeout(timer); timer = setTimeout(() => { renderControls(); load(true); }, 250); });
  $('#more').addEventListener('click', () => load(false));
  document.addEventListener('click', (e) => {
    const menu = $('#products-menu');
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
  const setHeader = () => document.documentElement.style.setProperty('--header-h', `${$('.top').offsetHeight}px`);
  setHeader();
  window.addEventListener('resize', setHeader);
}

async function init() {
  try {
    meta = await (await fetch('/api/meta')).json();
    $('#q').value = prefs.q;
    renderControls();
    bind();
    await load(true);
  } catch (err) {
    $('#status').textContent = 'Could not load updates. Please refresh.';
    console.error(err);
  }
}
init();
