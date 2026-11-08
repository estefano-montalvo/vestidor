// Paleta de colores de moda y utilidades de conversión.
// "neutral: true" marca los tonos que combinan con casi todo (base del armario).

export const PALETTE = [
  { id: 'negro', name: 'Negro', hex: '#1a1a1c', neutral: true },
  { id: 'marengo', name: 'Gris marengo', hex: '#46484d', neutral: true },
  { id: 'gris', name: 'Gris', hex: '#8b8c8f', neutral: true },
  { id: 'gris-claro', name: 'Gris claro', hex: '#c6c7c9', neutral: true },
  { id: 'blanco', name: 'Blanco', hex: '#f4f4f2', neutral: true },
  { id: 'crudo', name: 'Crudo', hex: '#e9e2d2', neutral: true },
  { id: 'beige', name: 'Beige', hex: '#d3bf9f', neutral: true },
  { id: 'camel', name: 'Camel', hex: '#b5845a', neutral: true },
  { id: 'marron', name: 'Marrón', hex: '#694833', neutral: true },
  { id: 'caqui', name: 'Caqui', hex: '#8c8458', neutral: true },
  { id: 'marino', name: 'Azul marino', hex: '#1f2b45', neutral: true },
  { id: 'denim', name: 'Denim', hex: '#4b6b90', neutral: true },
  { id: 'azul-claro', name: 'Azul claro', hex: '#9dbbe0', neutral: false },
  { id: 'azul', name: 'Azul', hex: '#2c5bd4', neutral: false },
  { id: 'turquesa', name: 'Turquesa', hex: '#2a9fa0', neutral: false },
  { id: 'verde-botella', name: 'Verde botella', hex: '#1e4a36', neutral: false },
  { id: 'verde', name: 'Verde', hex: '#2f8c4f', neutral: false },
  { id: 'oliva', name: 'Verde oliva', hex: '#5f632c', neutral: false },
  { id: 'amarillo', name: 'Amarillo', hex: '#e6c22e', neutral: false },
  { id: 'mostaza', name: 'Mostaza', hex: '#c09524', neutral: false },
  { id: 'naranja', name: 'Naranja', hex: '#de7420', neutral: false },
  { id: 'rojo', name: 'Rojo', hex: '#bf2630', neutral: false },
  { id: 'burdeos', name: 'Burdeos', hex: '#6a1a2a', neutral: false },
  { id: 'rosa', name: 'Rosa', hex: '#e59db1', neutral: false },
  { id: 'fucsia', name: 'Fucsia', hex: '#c42a7c', neutral: false },
  { id: 'lila', name: 'Lila', hex: '#b29bd4', neutral: false },
  { id: 'morado', name: 'Morado', hex: '#5a2e7a', neutral: false },
];

// Formas del adjetivo: [masc., fem., masc. pl., fem. pl.]
const FORMS = {
  negro: ['negro', 'negra', 'negros', 'negras'],
  blanco: ['blanco', 'blanca', 'blancos', 'blancas'],
  crudo: ['crudo', 'cruda', 'crudos', 'crudas'],
  rojo: ['rojo', 'roja', 'rojos', 'rojas'],
  amarillo: ['amarillo', 'amarilla', 'amarillos', 'amarillas'],
  morado: ['morado', 'morada', 'morados', 'moradas'],
  gris: ['gris', 'gris', 'grises', 'grises'],
  azul: ['azul', 'azul', 'azules', 'azules'],
  verde: ['verde', 'verde', 'verdes', 'verdes'],
  marron: ['marrón', 'marrón', 'marrones', 'marrones'],
};

export function colorAdjective(id, { f = false, pl = false } = {}) {
  const forms = FORMS[id];
  if (forms) return forms[(pl ? 2 : 0) + (f ? 1 : 0)];
  const c = PALETTE.find(p => p.id === id);
  return c ? c.name.toLowerCase() : '';
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function rgbToLab([r, g, b]) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const LAB_CACHE = PALETTE.map(c => ({ ...c, lab: rgbToLab(hexToRgb(c.hex)), hsl: rgbToHsl(hexToRgb(c.hex)) }));

export function nearestColor(rgb) {
  const lab = rgbToLab(rgb);
  let best = LAB_CACHE[0], bestD = Infinity;
  for (const c of LAB_CACHE) {
    const d = deltaE(lab, c.lab);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function colorById(id) {
  return LAB_CACHE.find(c => c.id === id) || LAB_CACHE[0];
}

// Diferencia de tono en grados (0–180).
export function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
