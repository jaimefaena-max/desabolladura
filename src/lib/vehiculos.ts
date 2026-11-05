import type { Carroceria } from './types';

export const CATALOGO: Record<string, Record<string, Carroceria>> = {
  Chevrolet: { Sail: 'sedan', Onix: 'hatchback', Tracker: 'suv', Captiva: 'suv', Colorado: 'pickup', Silverado: 'pickup' },
  Chery: { Tiggo: 'suv', Arrizo: 'sedan' },
  Ford: { 'F-150': 'pickup', Ranger: 'pickup', Territory: 'suv', Escape: 'suv', Explorer: 'suv' },
  Hyundai: { Accent: 'sedan', Elantra: 'sedan', Tucson: 'suv', 'Santa Fe': 'suv', Creta: 'suv' },
  Kia: { Rio: 'hatchback', Morning: 'hatchback', Cerato: 'sedan', Sportage: 'suv', Sorento: 'suv' },
  Mazda: { '2': 'hatchback', '3': 'sedan', 'CX-5': 'suv', 'BT-50': 'pickup' },
  Mitsubishi: { L200: 'pickup', Outlander: 'suv', Montero: 'suv' },
  Nissan: { Versa: 'sedan', Sentra: 'sedan', Qashqai: 'suv', 'X-Trail': 'suv', Navara: 'pickup' },
  Peugeot: { '208': 'hatchback', '2008': 'suv', '3008': 'suv' },
  Subaru: { Impreza: 'hatchback', Forester: 'suv', Outback: 'suv' },
  Suzuki: { Swift: 'hatchback', Baleno: 'hatchback', Vitara: 'suv', Jimny: 'suv' },
  Toyota: { Yaris: 'sedan', Corolla: 'sedan', 'RAV4': 'suv', 'Land Cruiser': 'suv', Hilux: 'pickup' },
  Volkswagen: { Gol: 'hatchback', Polo: 'hatchback', Virtus: 'sedan', Tiguan: 'suv', Amarok: 'pickup' },
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function carroceriaDe(marca: string, modelo: string): Carroceria | null {
  const m = Object.keys(CATALOGO).find(k => norm(k) === norm(marca));
  if (!m) return null;
  const mod = norm(modelo);
  const k = Object.keys(CATALOGO[m]).find(x => mod.includes(norm(x)) || norm(x).includes(mod) && mod.length > 1);
  return k ? CATALOGO[m][k] : null;
}

export const CARROCERIAS: { id: Carroceria; nombre: string }[] = [
  { id: 'sedan', nombre: 'Sedán' },
  { id: 'hatchback', nombre: 'Hatchback' },
  { id: 'suv', nombre: 'SUV' },
  { id: 'pickup', nombre: 'Camioneta' },
];

export const COLORES: { nombre: string; hex: string }[] = [
  { nombre: 'Blanco', hex: '#e4e6e8' },
  { nombre: 'Plateado', hex: '#a9aeb4' },
  { nombre: 'Gris', hex: '#4a4f55' },
  { nombre: 'Negro', hex: '#16181b' },
  { nombre: 'Rojo', hex: '#a3121c' },
  { nombre: 'Azul', hex: '#1d3f72' },
  { nombre: 'Verde', hex: '#1f4a3a' },
  { nombre: 'Café', hex: '#4b3527' },
  { nombre: 'Beige', hex: '#b5a58c' },
];

export function colorHex(nombre: string) {
  const n = norm(nombre);
  const alias: Record<string, string> = { plata: 'Plateado', plateada: 'Plateado', blanca: 'Blanco', negra: 'Negro', roja: 'Rojo', azulada: 'Azul', grafito: 'Gris', perla: 'Blanco', burdeo: 'Rojo' };
  const encontrado = COLORES.find(c => n.includes(norm(c.nombre)))
    ?? COLORES.find(c => c.nombre === Object.entries(alias).find(([k]) => n.includes(k))?.[1]);
  return encontrado ?? COLORES[1];
}

/** Patente chilena: BBBB-12 (desde 2007) o AA-1234 (antigua). */
export function normalizarPatente(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export function patenteValida(s: string) {
  return /^([A-Z]{4}\d{2}|[A-Z]{2}\d{4})$/.test(normalizarPatente(s));
}
export function verPatente(s: string) {
  const p = normalizarPatente(s);
  return p.length === 6 ? `${p.slice(0, 4)}-${p.slice(4)}` : p;
}
