import { db, uid } from './db.js';
import { PALETTE, colorById, colorAdjective } from './color.js';
import { CATEGORIES, STYLES, SEASONS, ALL_SEASONS, catById, styleById, currentSeason, grammarOf } from './data.js';
import { buildPrefs, generateOutfit, outfitScore, bestMatches, signature, pairKey, scoreLabel } from './match.js';
import {
  loadImage, hasTransparency, removeBackground, composePackshot,
  dominantColor, progressMessage, preloadBgLib,
} from './imaging.js';

/* ---------- utilidades ---------- */

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const svg = (body, cls = '') =>
  `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICON = {
  hanger: svg('<path d="M10 5.5a2 2 0 1 1 2.6 1.9c-.4.1-.6.5-.6.9V9"/><path d="M12 9 3.4 14.6c-.9.6-.5 1.9.6 1.9h16c1.1 0 1.5-1.3.6-1.9L12 9Z"/>'),
  wardrobe: svg('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M9.5 11v2M14.5 11v2"/>'),
  outfit: svg('<path d="M8 3 5 5l-2 5 3 1 1-3v13h10V8l1 3 3-1-2-5-3-2"/><path d="M9 3a3 3 0 0 0 6 0"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>'),
  heartFill: svg('<path fill="currentColor" d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  unlock: svg('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
  camera: svg('<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5"/>'),
  shuffle: svg('<path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.6 0 2.8-1.5 3.8-3.3M13.2 9.3C14.2 8 15.4 7 17 7h3M18 4l2 3-2 3M18 14l2 3-2 3"/>'),
  bookmark: svg('<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>'),
  thumbDown: svg('<path d="M10 15H5.5a2 2 0 0 1-2-2.3l1-6A2 2 0 0 1 6.5 5H17v9l-4 6.5c-1.2 0-2-1-1.8-2.2z"/><path d="M17 5h3.5v9H17"/>'),
  trash: svg('<path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  back: svg('<path d="M15 5 8 12l7 7"/>'),
};

/* ---------- estado ---------- */

const season0 = currentSeason();
const state = {
  items: [],
  outfits: [],
  dislikes: {},
  settings: { quality: 'equilibrado', autoCut: true },
  tab: 'armario',
  renderedTab: null,
  sheet: null,
  sheetFromApp: false,
  urls: new Map(),
  filter: { cat: 'todo', color: null },
  gen: {
    occasion: 'cualquiera', season: season0, withCoat: ['otono', 'invierno'].includes(season0),
    locks: {}, currentIds: null, seen: new Set(), savedId: null,
  },
  add: null,
  edit: null,
};

const prefs = () => buildPrefs(state.outfits, state.dislikes);
const itemById = id => state.items.find(i => i.id === id);

function imgUrl(item) {
  if (!state.urls.has(item.id)) state.urls.set(item.id, URL.createObjectURL(item.image));
  return state.urls.get(item.id);
}
function dropUrl(id) {
  const u = state.urls.get(id);
  if (u) { URL.revokeObjectURL(u); state.urls.delete(id); }
}

function idsToSlots(ids) {
  const slots = {};
  for (const [k, id] of Object.entries(ids || {})) {
    const it = itemById(id);
    if (it) slots[k] = it;
  }
  return slots;
}
const slotsToIds = slots => Object.fromEntries(Object.entries(slots).filter(([, v]) => v).map(([k, v]) => [k, v.id]));

/* ---------- toast ---------- */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- navegación ---------- */

const TABS = ['armario', 'outfits', 'ajustes'];

function parseHash() {
  const h = decodeURIComponent(location.hash.slice(1)) || 'armario';
  const [view, arg] = h.split('/');
  return { view, arg };
}

function route() {
  const { view, arg } = parseHash();
  if (TABS.includes(view)) {
    state.tab = view;
    state.sheet = null;
    state.sheetFromApp = false;
  } else {
    state.sheet = { view, arg };
  }
  renderTab();
  renderSheet();
  document.querySelectorAll('.tabbar a[data-tab]').forEach(a =>
    a.setAttribute('aria-current', a.dataset.tab === state.tab ? 'page' : 'false'));
}

function openSheet(hash) {
  state.sheetFromApp = true;
  location.hash = hash;
}

function closeSheet() {
  if (state.add) cleanupAdd();
  state.edit = null;
  if (state.sheetFromApp && history.length > 1) history.back();
  else location.hash = state.tab;
}

function goTab(tab) {
  location.hash = tab;
}

/* ---------- render: pestañas ---------- */

function renderTab(force = false) {
  if (!force && state.renderedTab === state.tab) return;
  const view = $('#view');
  const html = { armario: viewArmario, outfits: viewOutfits, ajustes: viewAjustes }[state.tab]();
  view.innerHTML = html;
  if (state.renderedTab !== state.tab) window.scrollTo(0, 0);
  state.renderedTab = state.tab;
  if (state.tab === 'outfits') requestAnimationFrame(() => positionCarousels(false));
}

function refresh() {
  renderTab(true);
  renderSheet(true);
}

function cardHtml(item) {
  const c = colorById(item.color);
  const cat = catById(item.category);
  return `
  <a class="card" href="#prenda/${item.id}" data-action="open-item" data-id="${item.id}">
    <div class="studio${item.cutout ? '' : ' is-photo'}">
      <img src="${imgUrl(item)}" alt="${esc(item.name)}" loading="lazy" decoding="async">
      ${item.favorite ? `<span class="card-fav" aria-label="Favorita">${ICON.heartFill}</span>` : ''}
    </div>
    <div class="card-meta">
      <span class="card-name">${esc(item.name)}</span>
      <span class="card-sub"><i class="dot" style="--c:${c.hex}"></i>${esc(item.type || cat.short)}</span>
    </div>
  </a>`;
}

function viewArmario() {
  const { items, filter } = state;
  if (!items.length) {
    return `
    <header class="page-head"><h1 class="display">Armario</h1></header>
    <section class="empty">
      <div class="studio empty-shot">${ICON.hanger}</div>
      <h2 class="empty-title">Tu armario está vacío</h2>
      <p>Haz una foto a una prenda y la convertimos en una ficha de producto, con el fondo recortado y lista para combinar.</p>
      <button class="btn btn-primary" data-action="start-add">${ICON.camera}<span>Añadir la primera prenda</span></button>
    </section>`;
  }
  const counts = {};
  items.forEach(i => { counts[i.category] = (counts[i.category] || 0) + 1; });
  const presentColors = PALETTE.filter(p => items.some(i => i.color === p.id));
  const shown = items.filter(i =>
    (filter.cat === 'todo' || (filter.cat === 'fav' ? i.favorite : i.category === filter.cat)) &&
    (!filter.color || i.color === filter.color));
  const favCount = items.filter(i => i.favorite).length;

  return `
  <header class="page-head">
    <h1 class="display">Armario</h1>
    <p class="page-sub">${plural(items.length, 'prenda', 'prendas')}</p>
  </header>
  <div class="filters">
    <div class="chips scroll-x" role="group" aria-label="Filtrar por categoría">
      <button class="chip" data-action="filter-cat" data-v="todo" aria-pressed="${filter.cat === 'todo'}">Todo</button>
      ${favCount ? `<button class="chip" data-action="filter-cat" data-v="fav" aria-pressed="${filter.cat === 'fav'}">Favoritas <span class="n">${favCount}</span></button>` : ''}
      ${CATEGORIES.filter(c => counts[c.id]).map(c => `
        <button class="chip" data-action="filter-cat" data-v="${c.id}" aria-pressed="${filter.cat === c.id}">${c.short} <span class="n">${counts[c.id]}</span></button>`).join('')}
    </div>
    ${presentColors.length > 1 ? `
    <div class="swatch-row scroll-x" role="group" aria-label="Filtrar por color">
      ${presentColors.map(p => `
        <button class="swatch" style="--c:${p.hex}" data-action="filter-color" data-v="${p.id}" aria-pressed="${filter.color === p.id}" aria-label="${p.name}" title="${p.name}"></button>`).join('')}
    </div>` : ''}
  </div>
  ${shown.length ? `<section class="grid">${shown.map(cardHtml).join('')}</section>` : `
    <p class="empty-inline">No hay prendas con este filtro. <button class="link" data-action="clear-filters">Quitar filtros</button></p>`}
  `;
}

/* ---------- outfits ---------- */

const SLOT_ORDER = ['abrigo', 'top', 'pieza', 'bottom', 'calzado', 'accesorio'];
const SLOT_LABEL = {
  abrigo: 'Abrigo', top: 'Arriba', bottom: 'Abajo', pieza: 'Vestido o mono', calzado: 'Calzado', accesorio: 'Accesorio',
};
const OPTIONAL_SLOTS = ['abrigo', 'accesorio'];

function layoutOf(slots) {
  const base = slots.pieza ? 'B' : 'A';
  return base + (slots.abrigo ? '-coat' : '');
}

function stageHtml(slots, { mini = false } = {}) {
  const layout = layoutOf(slots);
  const tag = mini ? 'span' : 'div';
  return `
  <${tag} class="stage${mini ? ' stage-mini' : ''}" data-layout="${layout}">
    ${SLOT_ORDER.filter(s => slots[s]).map(s => `
      <img class="piece p-${s}${slots[s].cutout ? '' : ' is-photo'}" src="${imgUrl(slots[s])}" alt="${mini ? '' : esc(slots[s].name)}" decoding="async">`).join('')}
  </${tag}>`;
}

function canGenerate() {
  const has = c => state.items.some(i => i.category === c);
  return (has('top') && has('bottom')) || has('pieza');
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Prendas de una categoría en orden estable: favoritas primero, luego las más recientes.
function catItems(cat) {
  return state.items
    .filter(i => i.category === cat)
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || b.createdAt - a.createdAt);
}

const fitMode = () => (state.gen.currentIds?.pieza ? 'B' : 'A');
const coatOn = () => state.gen.withCoat && catItems('abrigo').length > 0;
const layoutKey = () => fitMode() + (coatOn() ? '+abrigo' : '');

function regenerate({ remember = true, mode } = {}) {
  const g = state.gen;
  if (remember && g.currentIds) g.seen.add(signature(idsToSlots(g.currentIds)));
  const m = mode || (g.currentIds ? fitMode() : null);
  const pool = state.items.filter(i => i.category !== 'accesorio' &&
    (m === 'A' ? i.category !== 'pieza' : m === 'B' ? !['top', 'bottom'].includes(i.category) : true));
  const locks = {};
  for (const [k, id] of Object.entries(g.locks)) {
    const it = itemById(id);
    if (it && pool.includes(it)) locks[k] = it;
  }
  const opts = { occasion: g.occasion, season: g.season, withCoat: coatOn(), withAccessory: false, locks, prefs: prefs(), avoid: g.seen };
  let r = generateOutfit(pool, opts);
  if (!r && g.seen.size) { g.seen.clear(); r = generateOutfit(pool, { ...opts, avoid: g.seen }); }
  if (r) g.currentIds = slotsToIds(r.slots);
  g.savedId = null;
  ensureFitIds();
}

// Garantiza que cada zona del probador tenga una prenda válida.
function ensureFitIds() {
  const g = state.gen;
  const ids = { ...(g.currentIds || {}) };
  for (const k of Object.keys(ids)) if (!itemById(ids[k])) delete ids[k];
  delete ids.accesorio;
  let mode = ids.pieza ? 'B' : (ids.top || ids.bottom) ? 'A' : null;
  if (!mode) mode = catItems('top').length && catItems('bottom').length ? 'A' : 'B';
  const need = mode === 'A' ? ['top', 'bottom', 'calzado'] : ['pieza', 'calzado'];
  if (mode === 'A') delete ids.pieza; else { delete ids.top; delete ids.bottom; }
  if (coatOn()) need.push('abrigo'); else delete ids.abrigo;
  for (const s of need) if (!ids[s]) { const first = catItems(s)[0]; if (first) ids[s] = first.id; }
  g.currentIds = ids;
}

function carouselHtml(slot) {
  const list = catItems(slot);
  const locked = !!state.gen.locks[slot];
  if (!list.length) return `<div class="rail"><div class="carousel-empty">Sin ${SLOT_LABEL[slot].toLowerCase()}</div></div>`;
  return `
  <div class="rail">
    <div class="carousel${locked ? ' is-locked' : ''}" data-slot="${slot}" role="group" aria-label="${SLOT_LABEL[slot]}: desliza para cambiar">
      ${list.map(it => `
        <div class="slide" data-id="${it.id}">
          <img class="${it.cutout ? '' : 'is-photo'}" src="${imgUrl(it)}" alt="${esc(it.name)}" draggable="false" decoding="async">
        </div>`).join('')}
    </div>
    ${locked ? `<span class="rail-lock" aria-hidden="true">${ICON.lock}</span>` : ''}
    ${list.length > 1 && !locked ? `
      <button class="rail-arrow prev" data-action="swipe" data-slot="${slot}" data-dir="-1" aria-label="${SLOT_LABEL[slot]} anterior">${ICON.back}</button>
      <button class="rail-arrow next" data-action="swipe" data-slot="${slot}" data-dir="1" aria-label="${SLOT_LABEL[slot]} siguiente">${ICON.back}</button>` : ''}
  </div>`;
}

function fittingHtml() {
  const coat = coatOn();
  const rows = fitMode() === 'A'
    ? [['upper', coat ? ['abrigo', 'top'] : ['top']], ['lower', ['bottom']], ['feet', ['calzado']]]
    : [['dress', coat ? ['abrigo', 'pieza'] : ['pieza']], ['feet', ['calzado']]];
  return `
  <div class="fitting">
    ${rows.map(([band, slots]) => `
      <div class="band band-${band}${slots.length > 1 ? ' is-split' : ''}">${slots.map(carouselHtml).join('')}</div>`).join('')}
  </div>`;
}

function fitSideHtml() {
  const g = state.gen;
  const slots = idsToSlots(g.currentIds);
  const info = outfitScore(slots, prefs());
  const saved = g.savedId ? state.outfits.find(o => o.id === g.savedId) : null;
  const alreadySaved = !saved && state.outfits.find(o => signature(idsToSlots(o.slots)) === signature(slots));
  const shown = SLOT_ORDER.filter(s => slots[s]);

  const strip = `
    <ul class="slot-strip">
      ${shown.map(s => {
        const it = slots[s];
        const locked = !!g.locks[s];
        return `
        <li class="slot">
          <button class="slot-pick" data-action="pick" data-slot="${s}" aria-label="Elegir ${SLOT_LABEL[s].toLowerCase()} de la lista">
            <span class="studio slot-thumb${it.cutout ? '' : ' is-photo'}"><img src="${imgUrl(it)}" alt=""></span>
            <span class="slot-text"><span class="slot-label">${SLOT_LABEL[s]}</span><span class="slot-name">${esc(it.name)}</span></span>
          </button>
          <button class="icon-btn${locked ? ' is-on' : ''}" data-action="lock" data-slot="${s}" aria-pressed="${locked}" aria-label="${locked ? 'Soltar' : 'Fijar'} ${SLOT_LABEL[s].toLowerCase()}">${locked ? ICON.lock : ICON.unlock}</button>
        </li>`;
      }).join('')}
    </ul>`;

  const actions = saved ? `
    <div class="gen-actions">
      <button class="btn btn-primary" data-action="wear" data-id="${saved.id}">${ICON.check}<span>Me lo he puesto hoy</span></button>
      <button class="btn btn-ghost danger" data-action="delete-outfit" data-id="${saved.id}">${ICON.trash}<span>Eliminar</span></button>
    </div>
    <p class="fineprint">${saved.wears ? `Te lo has puesto ${plural(saved.wears, 'vez', 'veces')}.` : 'Todavía no te lo has puesto.'}</p>` : `
    <div class="gen-actions">
      <button class="btn btn-primary" data-action="next">${ICON.shuffle}<span>Sugerir otra</span></button>
      <button class="btn btn-ghost" data-action="save-outfit" ${alreadySaved ? 'disabled' : ''}>${ICON.bookmark}<span>${alreadySaved ? 'Guardado' : 'Guardar'}</span></button>
      <button class="icon-btn" data-action="dislike" aria-label="No me convence" title="No me convence">${ICON.thumbDown}</button>
    </div>`;

  return `
    ${saved ? `<p class="saved-tag">Outfit guardado</p>` : ''}
    <div class="verdict">
      <p class="verdict-label">${info.label} <span class="verdict-score">${info.score}/100</span></p>
      <p class="verdict-reason">${esc(info.reason)}.</p>
    </div>
    ${strip}
    ${actions}`;
}

function updateFitSide() {
  const side = $('#fit-side');
  if (side) side.innerHTML = fitSideHtml();
}

// Coloca cada carrusel en la prenda actual (con animación si se pide).
function positionCarousels(smooth = false) {
  document.querySelectorAll('.carousel').forEach(c => {
    const id = state.gen.currentIds?.[c.dataset.slot];
    const idx = Math.max(0, [...c.children].findIndex(sl => sl.dataset.id === id));
    const left = idx * c.clientWidth;
    if (Math.abs(c.scrollLeft - left) > 2) c.scrollTo({ left, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  });
}

function onCarouselSettle(c) {
  if (!c.isConnected || !c.clientWidth) return;
  const idx = Math.round(c.scrollLeft / c.clientWidth);
  const slide = c.children[idx];
  if (!slide) return;
  const g = state.gen;
  const slot = c.dataset.slot;
  if (g.currentIds?.[slot] === slide.dataset.id) return;
  g.currentIds = { ...(g.currentIds || {}), [slot]: slide.dataset.id };
  if (g.savedId) { g.savedId = null; }
  updateFitSide();
}

function applySuggestion(prevKey) {
  if (state.tab === 'outfits' && layoutKey() === prevKey && $('.fitting')) {
    updateFitSide();
    positionCarousels(true);
  } else {
    renderTab(true);
  }
}

function viewOutfits() {
  const g = state.gen;
  const head = `
  <header class="page-head compact">
    <h1 class="display">Probador</h1>
    <p class="page-sub">Desliza cada prenda para combinar</p>
  </header>`;

  if (!canGenerate()) {
    return head + `
    <section class="empty">
      <p>Para usar el probador necesito al menos una prenda de arriba y una de abajo, o un vestido. Revisa también que cada prenda tenga bien puesta su categoría.</p>
      <button class="btn btn-primary" data-action="start-add">${ICON.plus}<span>Añadir prendas</span></button>
    </section>${lookbookHtml()}`;
  }

  if (!g.currentIds) regenerate({ remember: false, mode: catItems('top').length && catItems('bottom').length ? 'A' : 'B' });
  else ensureFitIds();

  const hasSeparates = catItems('top').length && catItems('bottom').length;
  const hasDresses = catItems('pieza').length;
  const hasCoats = catItems('abrigo').length;
  const mode = fitMode();

  const controls = (hasSeparates && hasDresses) || hasCoats ? `
    <div class="fit-controls">
      ${hasSeparates && hasDresses ? `
      <div class="seg" role="group" aria-label="Tipo de conjunto">
        <button data-action="fit-mode" data-v="A" aria-pressed="${mode === 'A'}">Por piezas</button>
        <button data-action="fit-mode" data-v="B" aria-pressed="${mode === 'B'}">Vestido</button>
      </div>` : ''}
      ${hasCoats ? `
      <label class="switch">
        <input type="checkbox" data-change="toggle-coat" ${g.withCoat ? 'checked' : ''}>
        <span class="switch-ui" aria-hidden="true"></span><span>Con abrigo</span>
      </label>` : ''}
    </div>` : '';

  const tune = `
    <details class="tune"${g.tuneOpen ? ' open' : ''}>
      <summary>Ajustar las sugerencias</summary>
      <div class="tune-body">
        <div class="chips wrap" role="group" aria-label="Ocasión">
          <button class="chip" data-action="occasion" data-v="cualquiera" aria-pressed="${g.occasion === 'cualquiera'}">Cualquier ocasión</button>
          ${STYLES.map(s => `<button class="chip" data-action="occasion" data-v="${s.id}" aria-pressed="${g.occasion === s.id}">${s.label}</button>`).join('')}
        </div>
        <div class="seg" role="group" aria-label="Temporada">
          ${SEASONS.map(s => `<button data-action="season" data-v="${s.id}" aria-pressed="${g.season === s.id}">${s.label}</button>`).join('')}
        </div>
        <p class="fineprint">Se aplican cuando pulsas «Sugerir otra». Deslizando puedes probar cualquier prenda.</p>
      </div>
    </details>`;

  return head + controls + `
  <section class="fit-wrap">
    <div class="fit-col">
      ${fittingHtml()}
      <p class="fineprint fit-hint">Desliza cada zona a los lados para cambiar de prenda. Toca un nombre de la lista para verlas ordenadas de mejor a peor.</p>
    </div>
    <div class="fit-side-col">
      <div id="fit-side">${fitSideHtml()}</div>
      ${tune}
    </div>
  </section>
  ${lookbookHtml()}`;
}

function lookbookHtml() {
  const list = state.outfits
    .map(o => ({ o, slots: idsToSlots(o.slots) }))
    .filter(x => Object.keys(x.slots).length >= 2)
    .sort((a, b) => b.o.createdAt - a.o.createdAt);
  if (!list.length) return '';
  return `
  <section class="lookbook">
    <h2 class="section-title">Guardados</h2>
    <div class="look-grid">
      ${list.map(({ o, slots }) => `
        <button class="look" data-action="open-saved" data-id="${o.id}" aria-label="Abrir outfit guardado">
          ${stageHtml(slots, { mini: true })}
          <span class="look-meta">${o.wears ? `Puesto ${plural(o.wears, 'vez', 'veces')}` : 'Sin estrenar'}</span>
        </button>`).join('')}
    </div>
  </section>`;
}

/* ---------- ajustes ---------- */

function viewAjustes() {
  const counts = {};
  state.items.forEach(i => { counts[i.color] = (counts[i.color] || 0) + 1; });
  const colorBar = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = state.items.length;
  const quality = state.settings.quality;
  const Q = [
    ['rapido', 'Rápido', 'Descarga ligera, bordes algo menos finos.'],
    ['equilibrado', 'Equilibrado', 'La mejor opción para el día a día.'],
    ['maxima', 'Máxima', 'Bordes más precisos. Descarga grande la primera vez.'],
  ];
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  return `
  <header class="page-head">
    <h1 class="display">Ajustes</h1>
    <p class="page-sub">Vestidor</p>
  </header>

  ${total ? `
  <section class="panel">
    <h2 class="section-title">Tu armario en colores</h2>
    <div class="colorbar" role="img" aria-label="Distribución de colores">
      ${colorBar.map(([id, n]) => { const c = colorById(id); return `<span style="--c:${c.hex};flex:${n}" title="${c.name}: ${n}"></span>`; }).join('')}
    </div>
    <ul class="color-legend">
      ${colorBar.slice(0, 6).map(([id, n]) => { const c = colorById(id); return `<li><i class="dot" style="--c:${c.hex}"></i>${c.name}<span>${Math.round(n / total * 100)} %</span></li>`; }).join('')}
    </ul>
    <p class="fineprint">${plural(total, 'prenda', 'prendas')} y ${plural(state.outfits.length, 'outfit guardado', 'outfits guardados')}.</p>
  </section>` : ''}

  <section class="panel">
    <h2 class="section-title">Recorte de fondo</h2>
    <label class="switch">
      <input type="checkbox" data-change="toggle-autocut" ${state.settings.autoCut ? 'checked' : ''}>
      <span class="switch-ui" aria-hidden="true"></span><span>Quitar el fondo automáticamente</span>
    </label>
    <div class="options" role="radiogroup" aria-label="Calidad del recorte">
      ${Q.map(([id, label, desc]) => `
        <button class="option" role="radio" aria-checked="${quality === id}" data-action="quality" data-v="${id}">
          <span class="option-title">${label}</span><span class="option-desc">${desc}</span>
        </button>`).join('')}
    </div>
    <p class="fineprint">El recorte se hace en tu móvil: las fotos no se envían a ningún servidor. Si subes una imagen que ya tiene el fondo transparente, se respeta tal cual.</p>
  </section>

  <section class="panel">
    <h2 class="section-title">Copia de seguridad</h2>
    <p>Tus prendas se guardan solo en este dispositivo. Exporta una copia de vez en cuando y guárdala en Drive o en Archivos.</p>
    <div class="btn-row">
      <button class="btn btn-primary" data-action="export" ${total ? '' : 'disabled'}>Exportar copia</button>
      <button class="btn btn-ghost" data-action="import">Importar copia</button>
    </div>
  </section>

  ${standalone ? '' : `
  <section class="panel">
    <h2 class="section-title">Instálala en tu pantalla de inicio</h2>
    <p>En iPhone, abre esta página en Safari, toca Compartir y elige «Añadir a pantalla de inicio». En Android, menú de Chrome y «Instalar aplicación».</p>
    <p class="fineprint">Además de abrirse como una app, así Safari no borra tus datos si pasas unos días sin usarla.</p>
  </section>`}

  <section class="panel">
    <h2 class="section-title">Borrar datos</h2>
    <p>Elimina todas las prendas y outfits de este dispositivo.</p>
    <button class="btn btn-ghost danger" data-action="wipe" ${total || state.outfits.length ? '' : 'disabled'}>${ICON.trash}<span>Borrar todo</span></button>
  </section>

  <p class="credits">Recorte de fondo con @imgly/background-removal (licencia AGPL).</p>`;
}

/* ---------- render: hojas ---------- */

function renderSheet(preserveScroll = false) {
  const root = $('#sheet-root');
  const s = state.sheet;
  if (!s) {
    root.innerHTML = '';
    document.body.classList.remove('locked');
    return;
  }
  let html = '';
  if (s.view === 'anadir') {
    if (!state.add) state.add = { step: 'pick', queue: [], index: 0 };
    html = sheetAdd();
  } else if (s.view === 'prenda') {
    const it = itemById(s.arg);
    html = it ? sheetItem(it) : sheetMissing();
  } else if (s.view === 'editar') {
    const it = itemById(s.arg);
    if (it && (!state.edit || state.edit.id !== it.id)) {
      state.edit = { id: it.id, form: { name: it.name, category: it.category, type: it.type, color: it.color, colorAuto: false, detected: null, pattern: !!it.pattern, styles: [...(it.styles || [])], seasons: [...(it.seasons || ALL_SEASONS)] } };
    }
    html = it ? sheetEdit(it) : sheetMissing();
  } else if (s.view === 'elegir') {
    html = sheetPicker(s.arg);
  } else {
    html = sheetMissing();
  }
  const prevBody = root.querySelector('.sheet-body');
  const scroll = preserveScroll && prevBody ? prevBody.scrollTop : 0;
  const wasOpen = !!root.querySelector('.sheet');
  root.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="sheet${wasOpen ? '' : ' entering'}" role="dialog" aria-modal="true">${html}</div>`;
  const body = root.querySelector('.sheet-body');
  if (body) body.scrollTop = scroll;
  document.body.classList.add('locked');
}

function sheetHead(title, right = '') {
  return `
  <header class="sheet-head">
    <button class="icon-btn" data-action="close-sheet" aria-label="Cerrar">${ICON.close}</button>
    <h2 class="sheet-title">${title}</h2>
    <div class="sheet-head-right">${right}</div>
  </header>`;
}

function sheetMissing() {
  return sheetHead('') + `<div class="sheet-body"><p class="empty-inline">Esta prenda ya no existe.</p></div>`;
}

/* ---- hoja: ficha de prenda ---- */

function matchWord(score) {
  if (score >= 84) return 'Excelente';
  if (score >= 72) return 'Buena';
  if (score >= 58) return 'Aceptable';
  return 'Arriesgada';
}

function sheetItem(it) {
  const c = colorById(it.color);
  const cat = catById(it.category);
  const groups = bestMatches(it, state.items, prefs());
  const usedIn = state.outfits.filter(o => Object.values(o.slots).includes(it.id));
  const wears = usedIn.reduce((t, o) => t + (o.wears || 0), 0);
  const styles = (it.styles || []).map(id => styleById(id)?.label).filter(Boolean);
  const seasons = it.seasons?.length && it.seasons.length < 4
    ? it.seasons.map(id => SEASONS.find(s => s.id === id)?.label).join(', ') : 'Todo el año';
  const canOutfit = canGenerate() && it.category !== 'accesorio';

  return sheetHead('', `
      <button class="icon-btn${it.favorite ? ' is-on' : ''}" data-action="fav" data-id="${it.id}" aria-pressed="${!!it.favorite}" aria-label="Favorita">${it.favorite ? ICON.heartFill : ICON.heart}</button>
      <button class="icon-btn" data-action="edit" data-id="${it.id}" aria-label="Editar">${ICON.edit}</button>`) + `
  <div class="sheet-body">
    <div class="studio hero-shot${it.cutout ? '' : ' is-photo'}"><img src="${imgUrl(it)}" alt="${esc(it.name)}"></div>
    <div class="item-head">
      <h2 class="item-name">${esc(it.name)}</h2>
      <p class="item-meta"><i class="dot" style="--c:${c.hex}"></i>${c.name}${it.pattern ? ', estampado' : ''}</p>
    </div>
    <dl class="facts">
      <div><dt>Tipo</dt><dd>${esc(it.type || cat.label)}</dd></div>
      <div><dt>Estilo</dt><dd>${styles.length ? styles.join(', ') : 'Sin indicar'}</dd></div>
      <div><dt>Temporada</dt><dd>${seasons}</dd></div>
      <div><dt>Uso</dt><dd>${usedIn.length ? `En ${plural(usedIn.length, 'outfit', 'outfits')}${wears ? `, puesta ${plural(wears, 'vez', 'veces')}` : ''}` : 'Aún en ningún outfit'}</dd></div>
    </dl>
    ${canOutfit ? `<button class="btn btn-primary btn-block" data-action="outfit-with" data-id="${it.id}">${ICON.outfit}<span>Crear un outfit con esta prenda</span></button>` : ''}

    ${Object.keys(groups).length ? `
    <section class="matches">
      <h3 class="section-title">Combina con</h3>
      ${CATEGORIES.filter(cg => groups[cg.id]).map(cg => `
        <div class="match-group">
          <h4 class="match-cat">${cg.label}</h4>
          <div class="match-row scroll-x">
            ${groups[cg.id].map(({ item, score }) => `
              <a class="match" href="#prenda/${item.id}" data-action="open-item" data-id="${item.id}" data-replace="1">
                <span class="studio${item.cutout ? '' : ' is-photo'}"><img src="${imgUrl(item)}" alt="" loading="lazy"></span>
                <span class="match-name">${esc(item.name)}</span>
                <span class="match-score s-${score >= 84 ? 'hi' : score >= 72 ? 'ok' : score >= 58 ? 'mid' : 'lo'}">${matchWord(score)}</span>
              </a>`).join('')}
          </div>
        </div>`).join('')}
    </section>` : `<p class="fineprint">Añade más prendas para ver con qué combina.</p>`}

    <button class="btn btn-ghost danger btn-block" data-action="delete-item" data-id="${it.id}">${ICON.trash}<span>Eliminar prenda</span></button>
  </div>`;
}

/* ---- formulario compartido (alta y edición) ---- */

function activeForm() {
  if (state.sheet?.view === 'editar') return state.edit?.form;
  return state.add?.current?.form;
}

function autoName(form) {
  const noun = form.type || 'Prenda';
  return `${noun} ${colorAdjective(form.color, grammarOf(noun))}`;
}

function formHtml(form) {
  const cat = form.category ? catById(form.category) : null;
  const allSeasons = form.seasons.length === 4;
  return `
  <div class="form">
    <fieldset class="field">
      <legend class="field-label">Categoría${cat ? '' : ' <span class="field-required">elige una</span>'}</legend>
      <div class="chips wrap">
        ${CATEGORIES.map(c => `<button type="button" class="chip" data-action="f-cat" data-v="${c.id}" aria-pressed="${form.category === c.id}">${c.label}</button>`).join('')}
      </div>
    </fieldset>

    ${cat ? `
    <fieldset class="field">
      <legend class="field-label">Tipo</legend>
      <div class="chips wrap">
        ${cat.types.map(t => `<button type="button" class="chip" data-action="f-type" data-v="${esc(t)}" aria-pressed="${form.type === t}">${t}</button>`).join('')}
      </div>
    </fieldset>` : ''}

    <label class="field">
      <span class="field-label">Nombre</span>
      <input type="text" data-input="name" value="${esc(form.name)}" placeholder="${esc(autoName(form))}" autocomplete="off" enterkeyhint="done">
    </label>

    <fieldset class="field">
      <legend class="field-label">Color <span class="field-value">${colorById(form.color).name}${form.detected && form.detected === form.color ? ' (detectado)' : ''}</span></legend>
      <div class="palette">
        ${PALETTE.map(p => `<button type="button" class="swatch" style="--c:${p.hex}" data-action="f-color" data-v="${p.id}" aria-pressed="${form.color === p.id}" aria-label="${p.name}" title="${p.name}"></button>`).join('')}
      </div>
      <label class="switch">
        <input type="checkbox" data-change="f-pattern" ${form.pattern ? 'checked' : ''}>
        <span class="switch-ui" aria-hidden="true"></span><span>Tiene estampado (rayas, cuadros, flores…)</span>
      </label>
    </fieldset>

    <fieldset class="field">
      <legend class="field-label">Estilo</legend>
      <div class="chips wrap">
        ${STYLES.map(s => `<button type="button" class="chip" data-action="f-style" data-v="${s.id}" aria-pressed="${form.styles.includes(s.id)}">${s.label}</button>`).join('')}
      </div>
    </fieldset>

    <fieldset class="field">
      <legend class="field-label">Temporada</legend>
      <div class="chips wrap">
        <button type="button" class="chip" data-action="f-all-seasons" aria-pressed="${allSeasons}">Todo el año</button>
        ${SEASONS.map(s => `<button type="button" class="chip" data-action="f-season" data-v="${s.id}" aria-pressed="${!allSeasons && form.seasons.includes(s.id)}">${s.label}</button>`).join('')}
      </div>
    </fieldset>
  </div>`;
}

/* ---- hoja: añadir prenda ---- */

function sheetAdd() {
  const a = state.add;
  const counter = a.queue.length > 1 ? `${a.index + 1} de ${a.queue.length}` : '';

  if (a.step === 'pick') {
    return sheetHead('Nueva prenda') + `
    <div class="sheet-body">
      <div class="studio add-shot">${ICON.hanger}</div>
      <div class="btn-stack">
        <button class="btn btn-primary btn-block" data-action="pick-camera">${ICON.camera}<span>Hacer una foto</span></button>
        <button class="btn btn-ghost btn-block" data-action="pick-library">${ICON.image}<span>Elegir de la galería</span></button>
      </div>
      <label class="switch">
        <input type="checkbox" data-change="toggle-autocut" ${state.settings.autoCut ? 'checked' : ''}>
        <span class="switch-ui" aria-hidden="true"></span><span>Quitar el fondo automáticamente</span>
      </label>
      <p class="fineprint">Para un recorte limpio: prenda extendida o en percha, buena luz y un fondo liso que contraste. Puedes elegir varias fotos a la vez.</p>
    </div>`;
  }

  if (a.step === 'processing') {
    const p = a.progress || {};
    return sheetHead(counter || 'Nueva prenda') + `
    <div class="sheet-body">
      <div class="studio add-shot is-processing">
        ${a.previewUrl ? `<img src="${a.previewUrl}" alt="">` : ''}
        <span class="scan" aria-hidden="true"></span>
      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" ${p.pct != null ? `aria-valuenow="${Math.round(p.pct * 100)}"` : ''}>
        <span class="progress-fill${p.pct == null ? ' indeterminate' : ''}" style="width:${p.pct != null ? Math.round(p.pct * 100) : 30}%"></span>
      </div>
      <p class="progress-msg">${esc(p.msg || 'Preparando la foto')}</p>
    </div>`;
  }

  if (a.step === 'error') {
    return sheetHead('Nueva prenda') + `
    <div class="sheet-body">
      <p class="note">${esc(a.error)}</p>
      <button class="btn btn-primary btn-block" data-action="add-skip">Continuar</button>
    </div>`;
  }

  const cur = a.current;
  const more = a.index < a.queue.length - 1;
  return sheetHead(counter || 'Nueva prenda') + `
  <div class="sheet-body">
    <div class="studio hero-shot${cur.use === 'cutout' ? '' : ' is-photo'}"><img src="${cur.urls[cur.use]}" alt="Vista previa"></div>
    ${cur.urls.cutout ? `
    <div class="seg seg-center" role="group" aria-label="Versión de la foto">
      <button data-action="use-variant" data-v="cutout" aria-pressed="${cur.use === 'cutout'}">Recortada</button>
      <button data-action="use-variant" data-v="original" aria-pressed="${cur.use === 'original'}">Foto original</button>
    </div>` : ''}
    ${cur.note ? `<p class="note">${esc(cur.note)}</p>` : ''}
    ${formHtml(cur.form)}
  </div>
  <footer class="sheet-foot">
    <button class="btn btn-ghost" data-action="add-skip">${more ? 'Saltar' : 'Descartar'}</button>
    <button class="btn btn-primary" data-action="add-save" ${cur.form.category ? '' : 'disabled'}>${!cur.form.category ? 'Elige una categoría' : more ? 'Guardar y seguir' : 'Guardar prenda'}</button>
  </footer>`;
}

function sheetEdit(it) {
  return sheetHead('Editar prenda') + `
  <div class="sheet-body">
    <div class="studio edit-shot${it.cutout ? '' : ' is-photo'}"><img src="${imgUrl(it)}" alt=""></div>
    ${formHtml(state.edit.form)}
  </div>
  <footer class="sheet-foot">
    <button class="btn btn-ghost" data-action="close-sheet">Cancelar</button>
    <button class="btn btn-primary" data-action="edit-save">Guardar cambios</button>
  </footer>`;
}

/* ---- hoja: elegir prenda para un hueco del outfit ---- */

function sheetPicker(slot) {
  const g = state.gen;
  const current = idsToSlots(g.currentIds);
  const p = prefs();
  const cands = state.items.filter(i => i.category === slot).map(i => {
    const test = { ...current, [slot]: i };
    if (slot === 'pieza') { delete test.top; delete test.bottom; }
    if (slot === 'top' || slot === 'bottom') delete test.pieza;
    return { item: i, score: outfitScore(test, p).score };
  }).sort((a, b) => b.score - a.score);

  return sheetHead(SLOT_LABEL[slot] || 'Elegir') + `
  <div class="sheet-body">
    ${OPTIONAL_SLOTS.includes(slot) && current[slot] ? `<button class="btn btn-ghost btn-block" data-action="choose-none" data-slot="${slot}">Sin ${SLOT_LABEL[slot].toLowerCase()}</button>` : ''}
    ${cands.length ? `
    <ul class="pick-list">
      ${cands.map(({ item, score }) => `
        <li>
          <button class="pick" data-action="choose" data-slot="${slot}" data-id="${item.id}" aria-pressed="${current[slot]?.id === item.id}">
            <span class="studio pick-thumb${item.cutout ? '' : ' is-photo'}"><img src="${imgUrl(item)}" alt="" loading="lazy"></span>
            <span class="pick-text"><span class="pick-name">${esc(item.name)}</span><span class="pick-score">${scoreLabel(score)}, ${score}/100</span></span>
            ${current[slot]?.id === item.id ? ICON.check : ''}
          </button>
        </li>`).join('')}
    </ul>` : `<p class="empty-inline">No tienes prendas en esta categoría.</p>`}
    <p class="fineprint">Ordenadas de mejor a peor según lo que llevas puesto.</p>
  </div>`;
}

/* ---------- flujo de alta ---------- */

function defaultForm(colorEntry) {
  return {
    name: '', category: null, type: null, color: colorEntry.id, detected: colorEntry.id, colorAuto: true,
    pattern: false, styles: ['casual'], seasons: [...ALL_SEASONS],
  };
}

function cleanupAdd() {
  const a = state.add;
  if (!a) return;
  if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
  if (a.current) Object.values(a.current.urls).forEach(u => u && URL.revokeObjectURL(u));
  state.add = null;
}

function setProgress(msg, pct) {
  const a = state.add;
  if (!a) return;
  a.progress = { msg, pct };
  const fill = $('.progress-fill');
  const label = $('.progress-msg');
  if (fill && label) {
    fill.classList.toggle('indeterminate', pct == null);
    fill.style.width = pct == null ? '30%' : `${Math.round(pct * 100)}%`;
    label.textContent = msg;
  }
}

async function handleFiles(files) {
  if (!files.length) return;
  if (!state.add) state.add = { step: 'pick', queue: [], index: 0 };
  state.add.queue = [...files];
  state.add.index = 0;
  if (state.sheet?.view !== 'anadir') openSheet('anadir');
  processCurrent();
}

async function processCurrent() {
  const a = state.add;
  if (!a) return;
  const file = a.queue[a.index];
  if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
  a.previewUrl = URL.createObjectURL(file);
  a.step = 'processing';
  a.progress = { msg: 'Preparando la foto', pct: null };
  a.current = null;
  renderSheet();

  try {
    const src = await loadImage(file);
    let cut = null, note = '';
    if (hasTransparency(src)) {
      cut = src;
    } else if (state.settings.autoCut) {
      try {
        cut = await removeBackground(src, {
          quality: state.settings.quality,
          onProgress: (key, c, t) => setProgress(progressMessage(key), t ? c / t : null),
        });
      } catch (err) {
        console.error(err);
        note = 'No se ha podido recortar el fondo, así que se usará la foto original. Comprueba la conexión: la primera vez hay que descargar el motor de recorte.';
      }
    }
    if (state.add !== a) return; // el usuario cerró la hoja
    setProgress('Montando la ficha', null);
    const variants = { original: await composePackshot(src, { cutout: false }) };
    if (cut) variants.cutout = await composePackshot(cut, { cutout: true });
    const use = variants.cutout ? 'cutout' : 'original';
    const color = dominantColor(variants[use].canvas, { cutout: use === 'cutout' });
    a.current = {
      variants, use, note,
      urls: {
        original: URL.createObjectURL(variants.original.blob),
        cutout: variants.cutout ? URL.createObjectURL(variants.cutout.blob) : null,
      },
      form: defaultForm(color),
    };
    a.step = 'review';
  } catch (err) {
    console.error(err);
    a.step = 'error';
    a.error = 'No se ha podido abrir esta foto. Prueba con otra imagen en formato JPG o PNG.';
  }
  if (state.add === a) renderSheet();
}

async function saveAdd() {
  const a = state.add;
  const cur = a.current;
  const f = cur.form;
  if (!f.category) { toast('Elige primero la categoría de la prenda'); return; }
  const item = {
    id: uid(), createdAt: Date.now(),
    name: f.name.trim() || autoName(f),
    category: f.category, type: f.type, color: f.color, pattern: f.pattern,
    styles: f.styles, seasons: f.seasons.length ? f.seasons : [...ALL_SEASONS],
    favorite: false, cutout: cur.use === 'cutout',
    image: cur.variants[cur.use].blob,
  };
  try {
    await db.put('items', item);
  } catch (err) {
    console.error(err);
    toast('No se ha podido guardar. Revisa el espacio libre del dispositivo.');
    return;
  }
  state.items.unshift(item);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  state.renderedTab = null;
  advanceAdd(`Guardada: ${item.name}`);
}

function advanceAdd(message) {
  const a = state.add;
  Object.values(a.current?.urls || {}).forEach(u => u && URL.revokeObjectURL(u));
  a.current = null;
  if (a.index < a.queue.length - 1) {
    a.index++;
    if (message) toast(message);
    processCurrent();
  } else {
    closeSheet();
    renderTab(true);
    if (message) toast(message);
  }
}

/* ---------- acciones ---------- */

async function persistItem(it) {
  await db.put('items', it);
}

async function persistDislikes() {
  await db.setPref('dislikes', state.dislikes);
}

async function persistSettings() {
  await db.setPref('settings', state.settings);
}

const actions = {
  'start-add': () => { state.add = { step: 'pick', queue: [], index: 0 }; openSheet('anadir'); preloadBgLib(); },
  'close-sheet': () => closeSheet(),
  'open-item': (el, e) => {
    e.preventDefault();
    if (el.dataset.replace) { state.edit = null; location.replace(`#prenda/${el.dataset.id}`); }
    else openSheet(`prenda/${el.dataset.id}`);
  },

  'filter-cat': el => { state.filter.cat = el.dataset.v; renderTab(true); },
  'filter-color': el => { state.filter.color = state.filter.color === el.dataset.v ? null : el.dataset.v; renderTab(true); },
  'clear-filters': () => { state.filter = { cat: 'todo', color: null }; renderTab(true); },

  'pick-camera': () => { preloadBgLib(); $('#file-camera').click(); },
  'pick-library': () => { preloadBgLib(); $('#file-library').click(); },
  'use-variant': el => {
    const cur = state.add.current;
    cur.use = el.dataset.v;
    if (cur.form.colorAuto) {
      const c = dominantColor(cur.variants[cur.use].canvas, { cutout: cur.use === 'cutout' });
      cur.form.color = c.id; cur.form.detected = c.id;
    }
    renderSheet(true);
  },
  'add-save': () => saveAdd(),
  'add-skip': () => advanceAdd(),

  'f-cat': el => { const f = activeForm(); f.category = el.dataset.v; f.type = catById(f.category).types[0]; renderSheet(true); },
  'f-type': el => { const f = activeForm(); f.type = f.type === el.dataset.v ? null : el.dataset.v; renderSheet(true); },
  'f-color': el => { const f = activeForm(); f.color = el.dataset.v; f.colorAuto = false; renderSheet(true); },
  'f-style': el => {
    const f = activeForm(); const v = el.dataset.v;
    f.styles = f.styles.includes(v) ? f.styles.filter(x => x !== v) : [...f.styles, v];
    renderSheet(true);
  },
  'f-season': el => {
    const f = activeForm(); const v = el.dataset.v;
    if (f.seasons.length === 4) f.seasons = [v];
    else f.seasons = f.seasons.includes(v) ? f.seasons.filter(x => x !== v) : [...f.seasons, v];
    if (!f.seasons.length) f.seasons = [...ALL_SEASONS];
    renderSheet(true);
  },
  'f-all-seasons': () => { activeForm().seasons = [...ALL_SEASONS]; renderSheet(true); },

  'edit': el => { state.edit = null; location.replace(`#editar/${el.dataset.id}`); },
  'edit-save': async () => {
    const it = itemById(state.edit.id);
    const f = state.edit.form;
    Object.assign(it, {
      name: f.name.trim() || autoName(f), category: f.category, type: f.type, color: f.color,
      pattern: f.pattern, styles: f.styles, seasons: f.seasons,
    });
    await persistItem(it);
    state.edit = null;
    state.renderedTab = null;
    location.replace(`#prenda/${it.id}`);
    toast('Cambios guardados');
  },
  'fav': async el => {
    const it = itemById(el.dataset.id);
    it.favorite = !it.favorite;
    await persistItem(it);
    state.renderedTab = null;
    refresh();
  },
  'delete-item': async el => {
    const it = itemById(el.dataset.id);
    const affected = state.outfits.filter(o => Object.values(o.slots).includes(it.id));
    const extra = affected.length ? ` También se borrarán ${plural(affected.length, 'outfit guardado', 'outfits guardados')} que la incluyen.` : '';
    if (!confirm(`¿Eliminar «${it.name}»?${extra}`)) return;
    await db.delete('items', it.id);
    for (const o of affected) await db.delete('outfits', o.id);
    state.outfits = state.outfits.filter(o => !affected.includes(o));
    state.items = state.items.filter(i => i.id !== it.id);
    for (const k in state.gen.locks) if (state.gen.locks[k] === it.id) delete state.gen.locks[k];
    if (state.gen.currentIds && Object.values(state.gen.currentIds).includes(it.id)) state.gen.currentIds = null;
    dropUrl(it.id);
    state.renderedTab = null;
    closeSheet();
    toast('Prenda eliminada');
  },
  'outfit-with': el => {
    const it = itemById(el.dataset.id);
    const g = state.gen;
    g.locks = { [it.category]: it.id };
    if (it.category === 'abrigo') g.withCoat = true;
    g.seen.clear();
    const mode = it.category === 'pieza' ? 'B' : ['top', 'bottom'].includes(it.category) ? 'A' : undefined;
    regenerate({ remember: false, mode });
    state.renderedTab = null;
    state.sheet = null;
    location.hash = 'outfits';
  },

  'occasion': el => { state.gen.occasion = el.dataset.v; state.gen.seen.clear(); renderTab(true); },
  'season': el => { state.gen.season = el.dataset.v; state.gen.seen.clear(); renderTab(true); },
  'next': () => { const before = layoutKey(); regenerate(); applySuggestion(before); },
  'swipe': el => {
    const c = $(`.carousel[data-slot="${el.dataset.slot}"]`);
    if (!c) return;
    const n = c.children.length;
    let next = Math.round(c.scrollLeft / c.clientWidth) + Number(el.dataset.dir);
    if (next < 0) next = n - 1;
    if (next >= n) next = 0;
    c.scrollTo({ left: next * c.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
  },
  'fit-mode': el => {
    const g = state.gen; const v = el.dataset.v;
    if (fitMode() === v) return;
    if (v === 'B') { delete g.locks.top; delete g.locks.bottom; } else delete g.locks.pieza;
    regenerate({ remember: false, mode: v });
    renderTab(true);
  },
  'lock': el => {
    const g = state.gen; const s = el.dataset.slot;
    if (g.locks[s]) delete g.locks[s];
    else if (g.currentIds?.[s]) g.locks[s] = g.currentIds[s];
    renderTab(true);
  },
  'pick': el => openSheet(`elegir/${el.dataset.slot}`),
  'choose': el => {
    const g = state.gen; const s = el.dataset.slot;
    const ids = { ...(g.currentIds || {}), [s]: el.dataset.id };
    if (s === 'pieza') { delete ids.top; delete ids.bottom; delete g.locks.top; delete g.locks.bottom; }
    if (s === 'top' || s === 'bottom') { delete ids.pieza; delete g.locks.pieza; }
    if (s === 'abrigo') g.withCoat = true;
    g.currentIds = ids;
    g.savedId = null;
    state.renderedTab = null;
    closeSheet();
  },
  'choose-none': el => {
    const g = state.gen; const s = el.dataset.slot;
    const ids = { ...(g.currentIds || {}) };
    delete ids[s]; delete g.locks[s];
    if (s === 'abrigo') g.withCoat = false;
    g.currentIds = ids;
    state.renderedTab = null;
    closeSheet();
  },
  'save-outfit': async () => {
    const o = { id: uid(), createdAt: Date.now(), slots: { ...state.gen.currentIds }, wears: 0, lastWorn: null };
    await db.put('outfits', o);
    state.outfits.push(o);
    renderTab(true);
    toast('Outfit guardado');
  },
  'dislike': async () => {
    const ids = Object.values(state.gen.currentIds || {});
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const k = pairKey(ids[i], ids[j]);
        state.dislikes[k] = (state.dislikes[k] || 0) + 1;
      }
    await persistDislikes();
    const before = layoutKey();
    regenerate();
    applySuggestion(before);
    toast('Anotado, te propondré otras cosas');
  },
  'open-saved': el => {
    const o = state.outfits.find(x => x.id === el.dataset.id);
    state.gen.savedId = o.id;
    state.gen.currentIds = { ...o.slots };
    state.gen.withCoat = !!o.slots.abrigo;
    renderTab(true);
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  },
  'back-to-gen': () => { state.gen.savedId = null; regenerate({ remember: false }); renderTab(true); },
  'wear': async el => {
    const o = state.outfits.find(x => x.id === el.dataset.id);
    o.wears = (o.wears || 0) + 1;
    o.lastWorn = Date.now();
    await db.put('outfits', o);
    renderTab(true);
    toast('Anotado para hoy');
  },
  'delete-outfit': async el => {
    if (!confirm('¿Eliminar este outfit guardado?')) return;
    await db.delete('outfits', el.dataset.id);
    state.outfits = state.outfits.filter(o => o.id !== el.dataset.id);
    state.gen.savedId = null;
    regenerate({ remember: false });
    renderTab(true);
    toast('Outfit eliminado');
  },

  'quality': async el => { state.settings.quality = el.dataset.v; await persistSettings(); renderTab(true); },
  'export': () => exportBackup(),
  'import': () => $('#file-import').click(),
  'wipe': async () => {
    if (!confirm('¿Borrar todas las prendas y outfits de este dispositivo? No se puede deshacer.')) return;
    await Promise.all([db.clear('items'), db.clear('outfits'), db.setPref('dislikes', {})]);
    state.items.forEach(i => dropUrl(i.id));
    Object.assign(state, { items: [], outfits: [], dislikes: {} });
    state.gen.currentIds = null; state.gen.locks = {}; state.gen.seen.clear();
    renderTab(true);
    toast('Datos borrados');
  },
};

const changeActions = {
  'toggle-coat': el => {
    const g = state.gen;
    g.withCoat = el.checked;
    if (g.withCoat) {
      // Elige el abrigo que mejor combina con lo que ya llevas puesto.
      const base = idsToSlots(g.currentIds);
      let best = null, bestScore = -1;
      for (const c of catItems('abrigo')) {
        const sc = outfitScore({ ...base, abrigo: c }, prefs()).score;
        if (sc > bestScore) { bestScore = sc; best = c; }
      }
      if (best) g.currentIds = { ...g.currentIds, abrigo: best.id };
    } else {
      delete g.locks.abrigo;
    }
    g.savedId = null;
    renderTab(true);
  },
  'toggle-autocut': async el => { state.settings.autoCut = el.checked; await persistSettings(); },
  'f-pattern': el => { activeForm().pattern = el.checked; },
};

/* ---------- copia de seguridad ---------- */

const blobToDataURL = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

async function exportBackup() {
  toast('Preparando la copia…');
  const items = await Promise.all(state.items.map(async i => ({ ...i, image: await blobToDataURL(i.image) })));
  const data = { app: 'vestidor', version: 1, exportedAt: new Date().toISOString(), items, outfits: state.outfits, dislikes: state.dislikes };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `vestidor-copia-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Copia de Vestidor' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'vestidor' || !Array.isArray(data.items)) throw new Error('formato');
    const items = await Promise.all(data.items.map(async i => ({ ...i, image: await (await fetch(i.image)).blob() })));
    await db.putMany('items', items);
    if (Array.isArray(data.outfits)) await db.putMany('outfits', data.outfits);
    state.dislikes = { ...state.dislikes, ...(data.dislikes || {}) };
    await persistDislikes();
    state.items.forEach(i => dropUrl(i.id));
    state.items = (await db.all('items')).sort((a, b) => b.createdAt - a.createdAt);
    state.outfits = await db.all('outfits');
    state.gen.currentIds = null;
    renderTab(true);
    toast(`Copia importada: ${plural(items.length, 'prenda', 'prendas')}`);
  } catch (err) {
    console.error(err);
    toast('Este archivo no es una copia válida de Vestidor');
  }
}

/* ---------- eventos ---------- */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { if (el.tagName === 'A' && el.dataset.action !== 'open-item') e.preventDefault(); fn(el, e); }
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && changeActions[el.dataset.change]) changeActions[el.dataset.change](el, e);
});

document.addEventListener('input', e => {
  const el = e.target.closest('[data-input="name"]');
  if (el) { const f = activeForm(); if (f) f.name = el.value; }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.sheet) closeSheet();
});

['file-camera', 'file-library'].forEach(id => {
  $(`#${id}`).addEventListener('change', e => {
    const files = [...e.target.files];
    e.target.value = '';
    handleFiles(files);
  });
});

$('#file-import').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) importBackup(f);
});

window.addEventListener('hashchange', route);

const settleTimers = new WeakMap();
document.addEventListener('scroll', e => {
  const c = e.target;
  if (!(c instanceof Element) || !c.classList.contains('carousel')) return;
  clearTimeout(settleTimers.get(c));
  settleTimers.set(c, setTimeout(() => onCarouselSettle(c), 120));
}, true);

document.addEventListener('toggle', e => {
  if (e.target.classList?.contains('tune')) state.gen.tuneOpen = e.target.open;
}, true);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.tab === 'outfits') positionCarousels(false); }, 150);
});

/* ---------- arranque ---------- */

async function init() {
  try {
    const [items, outfits, dislikes, settings] = await Promise.all([
      db.all('items'), db.all('outfits'), db.getPref('dislikes', {}), db.getPref('settings', null),
    ]);
    state.items = items.sort((a, b) => b.createdAt - a.createdAt);
    state.outfits = outfits;
    state.dislikes = dislikes || {};
    if (settings) state.settings = { ...state.settings, ...settings };
  } catch (err) {
    console.error(err);
    toast('No se puede acceder al almacenamiento del navegador. Sal del modo privado e inténtalo de nuevo.');
  }
  route();
  document.body.classList.add('ready');

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
