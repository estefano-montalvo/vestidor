// Motor de combinaciones.
// Puntúa pares de prendas (color + estilo + temporada + tus preferencias)
// y genera outfits completos a partir de esas puntuaciones.

import { colorById, hueDistance } from './color.js';
import { ALL_SEASONS } from './data.js';

const STYLE_AFFINITY = {
  'casual|smart': 72, 'casual|deporte': 70, 'casual|noche': 45, 'casual|formal': 25,
  'smart|formal': 82, 'smart|noche': 74, 'smart|deporte': 30,
  'formal|noche': 85, 'formal|deporte': 5, 'deporte|noche': 10,
};

function styleAffinity(sa = [], sb = []) {
  if (!sa.length || !sb.length) return 75;
  let best = 0;
  for (const x of sa) for (const y of sb) {
    const v = x === y ? 100 : (STYLE_AFFINITY[`${x}|${y}`] ?? STYLE_AFFINITY[`${y}|${x}`] ?? 40);
    if (v > best) best = v;
  }
  return best;
}

const isSoft = c => c.hsl.s < 0.4 || c.hsl.l > 0.72 || c.hsl.l < 0.22;

// Armonía cromática entre dos colores de la paleta.
export function colorHarmony(ca, cb) {
  if (ca.neutral && cb.neutral) {
    const pair = [ca.id, cb.id].sort().join('|');
    if (pair === 'marino|negro') return { score: 64, kind: 'neutral' };
    if (pair === 'marron|negro') return { score: 62, kind: 'neutral' };
    if (ca.id === cb.id) return { score: 78, kind: 'neutral' };
    return { score: 88, kind: 'neutral' };
  }
  if (ca.neutral || cb.neutral) return { score: 90, kind: 'accent' };

  const d = hueDistance(ca.hsl.h, cb.hsl.h);
  if (d < 18) {
    const dl = Math.abs(ca.hsl.l - cb.hsl.l);
    return { score: dl > 0.15 ? 88 : 80, kind: 'mono' };
  }
  if (d < 50) return { score: 82, kind: 'analog' };
  if (d > 140) return { score: (isSoft(ca) || isSoft(cb)) ? 84 : 72, kind: 'complement' };
  if (d >= 100) return { score: 60, kind: 'triad' };
  return { score: (isSoft(ca) && isSoft(cb)) ? 60 : 36, kind: 'clash' };
}

const seasonsOf = i => (i.seasons && i.seasons.length ? i.seasons : ALL_SEASONS);

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Preferencias aprendidas: pares que guardaste juntos (likes) o descartaste (dislikes).
export function buildPrefs(outfits = [], dislikes = {}) {
  const likes = {};
  for (const o of outfits) {
    const ids = Object.values(o.slots || {}).filter(Boolean);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const k = pairKey(ids[i], ids[j]);
        likes[k] = (likes[k] || 0) + 1 + (o.wears || 0) * 0.5;
      }
  }
  return { likes, dislikes };
}

export function pairScore(a, b, prefs = { likes: {}, dislikes: {} }) {
  const color = colorHarmony(colorById(a.color), colorById(b.color)).score;
  const style = styleAffinity(a.styles, b.styles);
  let s = color * 0.6 + style * 0.4;
  if (a.pattern && b.pattern) s -= 30;
  const sa = seasonsOf(a), sb = seasonsOf(b);
  if (!sa.some(x => sb.includes(x))) s -= 15;
  const k = pairKey(a.id, b.id);
  s += Math.min(15, (prefs.likes[k] || 0) * 6);
  s -= Math.min(40, (prefs.dislikes[k] || 0) * 8);
  return Math.max(0, Math.min(100, s));
}

const SLOT_WEIGHT = { accesorio: 0.5 };

function describe(list) {
  const colors = list.map(i => colorById(i.color));
  const chroma = colors.filter(c => !c.neutral);
  const uniq = [...new Map(chroma.map(c => [c.id, c])).values()];
  const patterned = list.filter(i => i.pattern).length;
  let reason;
  if (uniq.length === 0) reason = 'Todo en neutros: equilibrado y fácil de llevar';
  else if (uniq.length === 1) reason = `Base neutra con un toque de ${uniq[0].name.toLowerCase()}`;
  else {
    let maxD = 0;
    for (let i = 0; i < uniq.length; i++)
      for (let j = i + 1; j < uniq.length; j++)
        maxD = Math.max(maxD, hueDistance(uniq[i].hsl.h, uniq[j].hsl.h));
    if (maxD < 18) reason = `Monocromático en tonos de ${uniq[0].name.toLowerCase()}`;
    else if (maxD < 50) reason = 'Colores vecinos en el círculo cromático';
    else if (uniq.length === 2 && maxD > 140) reason = 'Contraste de colores complementarios';
    else reason = 'Mezcla de color atrevida';
  }
  if (patterned === 1) reason += '; el estampado es el protagonista';
  if (patterned > 1) reason += '; ojo, hay más de un estampado';
  return { reason, chromaCount: uniq.length };
}

export function scoreLabel(score) {
  if (score >= 84) return 'Combinación excelente';
  if (score >= 72) return 'Buena combinación';
  if (score >= 58) return 'Puede funcionar';
  return 'Combinación arriesgada';
}

// slots: { abrigo, top, bottom, pieza, calzado, accesorio } con objetos prenda.
export function outfitScore(slots, prefs, cache) {
  const entries = Object.entries(slots).filter(([, v]) => v);
  if (entries.length < 2) {
    const list = entries.map(([, v]) => v);
    return { score: 0, label: 'Añade más prendas', ...describe(list) };
  }
  let sum = 0, w = 0;
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const [si, a] = entries[i], [sj, b] = entries[j];
      const weight = Math.min(SLOT_WEIGHT[si] ?? 1, SLOT_WEIGHT[sj] ?? 1);
      let s;
      const k = pairKey(a.id, b.id);
      if (cache && cache.has(k)) s = cache.get(k);
      else { s = pairScore(a, b, prefs); cache && cache.set(k, s); }
      sum += s * weight; w += weight;
    }
  const list = entries.map(([, v]) => v);
  const d = describe(list);
  let score = sum / w;
  if (d.chromaCount >= 3 && d.reason !== 'Colores vecinos en el círculo cromático') score -= 12;
  score = Math.round(Math.max(0, Math.min(100, score)));
  return { score, label: scoreLabel(score), ...d };
}

export const signature = slots =>
  Object.values(slots).filter(Boolean).map(i => i.id).sort().join('+');

function sample(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Genera un outfit.
 * opts: { occasion, season, withCoat, withAccessory, locks: {slot: item}, prefs, avoid: Set<signature> }
 */
export function generateOutfit(items, opts) {
  const { occasion = 'cualquiera', season, withCoat, withAccessory = true, locks = {}, prefs, avoid = new Set() } = opts;
  const cache = new Map();

  const fits = i => {
    const seasonOk = !season || seasonsOf(i).includes(season);
    const styleOk = occasion === 'cualquiera' || !i.styles?.length ||
      i.styles.includes(occasion) || styleAffinity(i.styles, [occasion]) >= 70;
    return seasonOk && styleOk;
  };
  const cands = cat => {
    if (locks[cat]) return [locks[cat]];
    const all = items.filter(i => i.category === cat);
    const f = all.filter(fits);
    return f.length ? f : all;
  };

  const structures = [];
  if (locks.pieza) structures.push('B');
  else if (locks.top || locks.bottom) structures.push('A');
  else {
    if (cands('top').length && cands('bottom').length) structures.push('A');
    if (cands('pieza').length) structures.push('B');
  }
  if (!structures.length) return null;

  const results = [];
  for (const st of structures) {
    const slots = st === 'A' ? ['top', 'bottom', 'calzado'] : ['pieza', 'calzado'];
    if (withCoat || locks.abrigo) slots.push('abrigo');
    const lists = slots.map(s => [s, cands(s)]).filter(([, l]) => l.length);
    const total = lists.reduce((p, [, l]) => p * l.length, 1);
    const LIMIT = 8000;
    const evalCombo = combo => {
      const o = {};
      lists.forEach(([s], idx) => { o[s] = combo[idx]; });
      const r = outfitScore(o, prefs, cache);
      const sig = signature(o);
      if (!avoid.has(sig)) results.push({ slots: o, score: r.score, sig });
    };
    if (total <= LIMIT) {
      const rec = (idx, acc) => {
        if (idx === lists.length) return evalCombo(acc);
        for (const it of lists[idx][1]) rec(idx + 1, [...acc, it]);
      };
      rec(0, []);
    } else {
      for (let n = 0; n < LIMIT; n++) evalCombo(lists.map(([, l]) => sample(l)));
    }
  }
  if (!results.length) return null;

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, 12);
  const min = top[top.length - 1].score;
  const weights = top.map(r => Math.pow(r.score - min + 2, 2));
  let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
  let chosen = top[0];
  for (let i = 0; i < top.length; i++) { pick -= weights[i]; if (pick <= 0) { chosen = top[i]; break; } }

  const slots = { ...chosen.slots };
  if (locks.accesorio) slots.accesorio = locks.accesorio;
  else if (withAccessory) {
    const acc = cands('accesorio');
    const core = Object.values(slots);
    let best = null, bestS = 0;
    for (const a of acc) {
      const s = core.reduce((t, c) => t + pairScore(a, c, prefs), 0) / core.length;
      if (s > bestS) { bestS = s; best = a; }
    }
    if (best && bestS >= 72) slots.accesorio = best;
  }
  return { slots, ...outfitScore(slots, prefs) };
}

// Mejores compañeros para una prenda, agrupados por categoría.
export function bestMatches(item, items, prefs, perCat = 8) {
  const incompatible = {
    top: ['pieza', 'top'], bottom: ['pieza', 'bottom'], pieza: ['top', 'bottom', 'pieza'],
    calzado: ['calzado'], abrigo: ['abrigo'], accesorio: [],
  };
  const skip = incompatible[item.category] || [];
  const groups = {};
  for (const other of items) {
    if (other.id === item.id || skip.includes(other.category)) continue;
    (groups[other.category] ||= []).push({ item: other, score: Math.round(pairScore(item, other, prefs)) });
  }
  for (const k in groups) groups[k] = groups[k].sort((a, b) => b.score - a.score).slice(0, perCat);
  return groups;
}
