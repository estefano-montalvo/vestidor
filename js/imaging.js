// Pipeline de imagen: foto → recorte del fondo → packshot estilo tienda online.
// El recorte se hace en el propio navegador (no se sube ninguna foto a ningún servidor).

import { nearestColor } from './color.js';

const BG_LIB_VERSION = '1.7.0';
const BG_LIB_URLS = [
  `https://cdn.jsdelivr.net/npm/@imgly/background-removal@${BG_LIB_VERSION}/+esm`,
  `https://esm.sh/@imgly/background-removal@${BG_LIB_VERSION}`,
];

export const PACKSHOT = { w: 900, h: 1125 }; // proporción 4:5, como las fichas de producto

let bgLib;
async function loadBgLib() {
  if (bgLib) return bgLib;
  let lastErr;
  for (const url of BG_LIB_URLS) {
    try { bgLib = await import(url); return bgLib; } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('No se pudo cargar el motor de recorte');
}

export function preloadBgLib() { loadBgLib().catch(() => {}); }

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const ctx2d = c => c.getContext('2d', { willReadFrequently: true });

export function canvasToBlob(canvas, type = 'image/png', quality = 0.9) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo exportar la imagen'))), type, quality));
}

async function blobToCanvas(blob) {
  const bmp = await createImageBitmap(blob);
  const c = makeCanvas(bmp.width, bmp.height);
  ctx2d(c).drawImage(bmp, 0, 0);
  bmp.close && bmp.close();
  return c;
}

// Carga un archivo respetando la orientación EXIF y lo reduce a un tamaño manejable.
export async function loadImage(file, max = 1600) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = makeCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  return c;
}

// ¿La imagen ya viene recortada? (PNG con fondo transparente, p. ej. recortada con el iPhone)
export function hasTransparency(canvas) {
  const { width: w, height: h } = canvas;
  const data = ctx2d(canvas).getImageData(0, 0, w, h).data;
  let transparent = 0, total = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 80));
  const check = (x, y) => { total++; if (data[(y * w + x) * 4 + 3] < 250) transparent++; };
  for (let x = 0; x < w; x += step) { check(x, 0); check(x, h - 1); }
  for (let y = 0; y < h; y += step) { check(0, y); check(w - 1, y); }
  return transparent / total > 0.3;
}

const MODEL_BY_QUALITY = { rapido: 'isnet_quint8', equilibrado: 'isnet_fp16', maxima: 'isnet' };

export async function removeBackground(canvas, { quality = 'equilibrado', onProgress } = {}) {
  const lib = await loadBgLib();
  const input = await canvasToBlob(canvas, 'image/png');
  const out = await lib.removeBackground(input, {
    model: MODEL_BY_QUALITY[quality] || 'isnet_fp16',
    output: { format: 'image/png' },
    progress: (key, current, total) => onProgress && onProgress(key, current, total),
  });
  const result = await blobToCanvas(out);
  cleanAlpha(result);
  return result;
}

// Limpia el halo semitransparente que a veces deja el recorte.
function cleanAlpha(canvas) {
  const ctx = ctx2d(canvas);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 28) d[i] = 0;
    else if (d[i] > 235) d[i] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function alphaBounds(canvas, threshold = 24) {
  const { width: w, height: h } = canvas;
  const d = ctx2d(canvas).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Compone el packshot final.
 * cutout = true: prenda recortada, centrada, con margen uniforme y sombra suave (fondo transparente).
 * cutout = false: foto original encuadrada a 4:5.
 */
export async function composePackshot(source, { cutout }) {
  const { w: W, h: H } = PACKSHOT;
  const out = makeCanvas(W, H);
  const ctx = ctx2d(out);
  ctx.imageSmoothingQuality = 'high';

  if (cutout) {
    const b = alphaBounds(source) || { x: 0, y: 0, w: source.width, h: source.height };
    const pad = W * 0.09;
    const scale = Math.min((W - pad * 2) / b.w, (H - pad * 2 - 30) / b.h);
    const dw = b.w * scale, dh = b.h * scale;
    const dx = (W - dw) / 2, dy = (H - dh) / 2 - 12;
    ctx.save();
    ctx.shadowColor = 'rgba(20, 24, 36, 0.20)';
    ctx.shadowBlur = 38;
    ctx.shadowOffsetY = 20;
    ctx.drawImage(source, b.x, b.y, b.w, b.h, dx, dy, dw, dh);
    ctx.restore();
    let blob = await canvasToBlob(out, 'image/webp', 0.9);
    if (blob.type !== 'image/webp') blob = await canvasToBlob(out, 'image/png');
    return { blob, canvas: out };
  }

  const r = Math.max(W / source.width, H / source.height);
  const sw = W / r, sh = H / r;
  ctx.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, 0, 0, W, H);
  const blob = await canvasToBlob(out, 'image/jpeg', 0.88);
  return { blob, canvas: out };
}

// Color dominante de la prenda (ignora el fondo transparente).
export function dominantColor(canvas, { cutout }) {
  const sw = 72, sh = 90;
  const small = makeCanvas(sw, sh);
  const sctx = ctx2d(small);
  if (cutout) sctx.drawImage(canvas, 0, 0, sw, sh);
  else {
    const cw = canvas.width * 0.5, ch = canvas.height * 0.5;
    sctx.drawImage(canvas, canvas.width * 0.25, canvas.height * 0.25, cw, ch, 0, 0, sw, sh);
  }
  const d = sctx.getImageData(0, 0, sw, sh).data;
  const bins = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    const b = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
    bins.set(key, b);
  }
  let best = null;
  for (const b of bins.values()) if (!best || b.n > best.n) best = b;
  if (!best) return nearestColor([128, 128, 128]);
  return nearestColor([best.r / best.n, best.g / best.n, best.b / best.n]);
}

export function progressMessage(key) {
  if (key.startsWith('fetch')) return 'Descargando el motor de recorte (solo la primera vez)';
  return 'Recortando la prenda';
}
