// Catálogo base del armario: categorías, tipos, estilos y temporadas.

export const CATEGORIES = [
  { id: 'abrigo', label: 'Abrigos y chaquetas', short: 'Abrigos',
    types: ['Abrigo', 'Chaqueta', 'Americana', 'Cazadora', 'Gabardina', 'Plumífero', 'Chaleco'] },
  { id: 'top', label: 'Parte de arriba', short: 'Arriba',
    types: ['Camiseta', 'Camisa', 'Polo', 'Jersey', 'Cárdigan', 'Sudadera', 'Top'] },
  { id: 'bottom', label: 'Parte de abajo', short: 'Abajo',
    types: ['Pantalón', 'Vaquero', 'Chino', 'Jogger', 'Falda', 'Bermuda', 'Shorts'] },
  { id: 'pieza', label: 'Vestidos y monos', short: 'Vestidos',
    types: ['Vestido', 'Mono', 'Peto'] },
  { id: 'calzado', label: 'Calzado', short: 'Calzado',
    types: ['Zapatillas', 'Zapatos', 'Mocasines', 'Botas', 'Botines', 'Sandalias'] },
  { id: 'accesorio', label: 'Accesorios', short: 'Accesorios',
    types: ['Cinturón', 'Bolso', 'Mochila', 'Gorra', 'Gorro', 'Bufanda', 'Reloj', 'Gafas'] },
];

export const STYLES = [
  { id: 'casual', label: 'Casual' },
  { id: 'smart', label: 'Smart casual' },
  { id: 'formal', label: 'Formal' },
  { id: 'deporte', label: 'Deportivo' },
  { id: 'noche', label: 'Noche' },
];

export const SEASONS = [
  { id: 'primavera', label: 'Primavera' },
  { id: 'verano', label: 'Verano' },
  { id: 'otono', label: 'Otoño' },
  { id: 'invierno', label: 'Invierno' },
];

// Concordancia para los nombres automáticos ("Camiseta blanca", "Botas marrones").
const FEMININE = new Set(['Chaqueta', 'Americana', 'Cazadora', 'Gabardina', 'Camiseta', 'Camisa', 'Sudadera', 'Falda',
  'Bermuda', 'Zapatillas', 'Botas', 'Sandalias', 'Gorra', 'Bufanda', 'Gafas', 'Mochila', 'Prenda']);
const PLURAL = new Set(['Zapatillas', 'Zapatos', 'Mocasines', 'Botas', 'Botines', 'Sandalias', 'Gafas', 'Shorts']);
export const grammarOf = noun => ({ f: FEMININE.has(noun), pl: PLURAL.has(noun) });

export const ALL_SEASONS = SEASONS.map(s => s.id);

export const catById = id => CATEGORIES.find(c => c.id === id);
export const styleById = id => STYLES.find(s => s.id === id);
export const seasonById = id => SEASONS.find(s => s.id === id);

// Temporada por defecto según el mes (hemisferio norte).
export function currentSeason(date = new Date()) {
  const m = date.getMonth(); // 0 = enero
  if (m === 11 || m <= 1) return 'invierno';
  if (m <= 4) return 'primavera';
  if (m <= 7) return 'verano';
  return 'otono';
}
