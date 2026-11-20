const PREFS_KEY = 'dev-news-prefs-v1';
const PAGE = 40;
const $ = (s) => document.querySelector(s);

const defaults = { excluded: [], hidden: [], important: false, days: '30', q: '' };
function loadPrefs() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { ...defaults }; }
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
}

const prefs = loadPrefs();
let meta = null;
let offset = 0;
let total = 0;
let lastDay = null;

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Inline `code` from changelogs, rendered safely.
const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

function queryString(extra = {}) {
  const p = new URLSearchParams();
  if (prefs.excluded.length) p.set('exclude', prefs.excluded.join(','));
  if (prefs.hidden.length) p.set('hide', prefs.hidden.join(','));
  if (prefs.important) p.set('important', '1');
  if (prefs.days !== '0') p.set('days', prefs.days);
  if (prefs.q) p.set('q', prefs.q);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

function renderFilters() {
  const box = $('#categories');
  box.innerHTML = meta.categories.map((c) => {
    const sources = meta.sources.filter((s) => s.category === c.id);
    const on = !prefs.excluded.includes(c.id);
    return `<details class="cat" data-cat="${c.id}">
      <summary title="${esc(c.description)}">
        <input type="checkbox" data-role="cat" value="${c.id}" ${on ? 'checked' : ''} aria-label="Include ${esc(c.name)}">
        <span class="name">${esc(c.name)}</span><span class="chev">▶</span>
      </summary>
      <div class="products">${sources.map((s) => `
        <label><input type="checkbox" data-role="product" value="${s.id}" ${on && !prefs.hidden.includes(s.id) ? 'checked' : ''} ${on ? '' : 'disabled'}>
          ${esc(s.product)}${s.health && !s.health.ok ? ' <span class="down" title="Last fetch failed">unavailable</span>' : ''}</label>`).join('')}
      </div>
    </details>`;
  }).join('');
  $('#important').checked = prefs.important;
  $('#days').value = prefs.days;
  $('#q').value = prefs.q;
  updateCount();
}

function updateCount() {
  const n = prefs.excluded.length + prefs.hidden.length + (prefs.important ? 1 : 0);
  $('#filter-count').textContent = n ? `(${n} active)` : '';
  $('#rss').href = `/feed.xml?${queryString()}`;
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function card(i) {
  const tags = i.tags.filter((t) => ['breaking', 'security', 'major', 'deprecation'].includes(t))
    .map((t) => `<span class="tag ${t}">${t}</span>`).join('');
  const body = i.highlights.length
    ? `<ul class="highlights">${i.highlights.slice(0, 4).map((h) => `<li>${rich(h)}</li>`).join('')}</ul>
       ${i.highlights.length > 4 || i.moreHighlights ? `<details class="toggle-more"><summary class="link">${i.highlights.length - 4 + (i.moreHighlights || 0)} more changes</summary>
         <ul class="highlights">${i.highlights.slice(4).map((h) => `<li>${rich(h)}</li>`).join('')}</ul>
         ${i.moreHighlights ? `<p class="summary"><a href="${esc(i.url)}" target="_blank" rel="noopener">See the full changelog</a></p>` : ''}</details>` : ''}`
    : i.summary ? `<p class="summary">${rich(i.summary)}</p>` : '';
  const also = i.links.length > 1
    ? `<div class="also">Also reported by ${i.links.slice(1).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(', ')}</div>` : '';
  const when = new Date(i.date ?? i.firstSeen).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `<article class="card ${i.importance >= 2 ? 'important' : ''}">
    <div class="meta"><span class="product">${esc(i.product)}</span>${tags}<span>${i.date ? when : 'first seen ' + when}</span></div>
    <h3><a href="${esc(i.url)}" target="_blank" rel="noopener">${rich(i.title)}</a></h3>
    ${body}${also}
  </article>`;
}

async function load(reset = true) {
  if (reset) { offset = 0; lastDay = null; $('#feed').innerHTML = ''; }
  $('#status').textContent = 'Loading…';
  const res = await fetch(`/api/items?${queryString({ limit: PAGE, offset })}`);
  const data = await res.json();
  total = data.total;
  let html = '';
  for (const i of data.items) {
    const day = dayLabel(i.date ?? i.firstSeen);
    if (day !== lastDay) { html += `<h2 class="day">${esc(day)}</h2>`; lastDay = day; }
    html += card(i);
  }
  $('#feed').insertAdjacentHTML('beforeend', html);
  offset += data.items.length;
  $('#more').hidden = offset >= total;
  if (!total) {
    $('#feed').innerHTML = `<div class="empty">${data.updatedAt ? 'Nothing matches these filters. Try a longer time range or more categories.' : 'The collector is gathering the first batch of updates. Check back in a minute.'}</div>`;
  }
  const updated = data.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : '';
  $('#status').textContent = [total ? `${total} update${total === 1 ? '' : 's'}` : '', updated].filter(Boolean).join(' · ');
}

let timer;
function changed(debounce = 0) {
  savePrefs();
  updateCount();
  clearTimeout(timer);
  timer = setTimeout(() => load(true), debounce);
}

function bind() {
  $('#categories').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.role === 'cat') {
      prefs.excluded = t.checked ? prefs.excluded.filter((c) => c !== t.value) : [...new Set([...prefs.excluded, t.value])];
      renderFilters();
    } else if (t.dataset.role === 'product') {
      prefs.hidden = t.checked ? prefs.hidden.filter((s) => s !== t.value) : [...new Set([...prefs.hidden, t.value])];
    }
    changed();
  });
  $('#all').addEventListener('click', () => { prefs.excluded = []; prefs.hidden = []; renderFilters(); changed(); });
  $('#none').addEventListener('click', () => { prefs.excluded = meta.categories.map((c) => c.id); renderFilters(); changed(); });
  $('#important').addEventListener('change', (e) => { prefs.important = e.target.checked; changed(); });
  $('#days').addEventListener('change', (e) => { prefs.days = e.target.value; changed(); });
  $('#q').addEventListener('input', (e) => { prefs.q = e.target.value.trim(); changed(250); });
  $('#more').addEventListener('click', () => load(false));
  $('.filters-toggle').addEventListener('click', (e) => {
    const open = $('.filters').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
}

async function init() {
  try {
    meta = await (await fetch('/api/meta')).json();
    renderFilters();
    bind();
    await load(true);
  } catch (err) {
    $('#status').textContent = 'Could not load updates. Please refresh.';
    console.error(err);
  }
}
init();
