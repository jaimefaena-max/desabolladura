import type { Carroceria, PiezaId, Severidad, Sugerido, Trabajo, Vehiculo } from './types';

/**
 * Tabla referencial en CLP netos para un auto mediano y daño medio.
 * Calibrada con valores publicados en Chile en 2026 (choque.cl, desabolladuravasbal.cl, carvuk.com).
 * Es una orientación para el administrador: el monto final siempre lo decide él.
 */
const BASE: Record<Trabajo, [number, number]> = {
  desabolladura: [170000, 300000],
  pintura: [160000, 240000],
  cambio: [60000, 120000],
  plastico: [80000, 150000],
  pulido: [30000, 80000],
};

const TAMANO_PIEZA: Partial<Record<PiezaId, number>> = {
  capot: 1.4, techo: 1.6, maletera: 1.2, parachoque_del: 1.05, parachoque_tras: 1.05,
  costado_tras_izq: 1.15, costado_tras_der: 1.15, espejo_izq: .35, espejo_der: .35,
};

const SEGMENTO: Record<Carroceria, number> = { hatchback: .92, sedan: 1, suv: 1.15, pickup: 1.25 };
const GRANDES = /f-?150|silverado|ram|tundra|land cruiser|explorer/i;
const SEVERIDAD: Record<Severidad, number> = { leve: .6, medio: 1, fuerte: 1.5 };

const redondear = (n: number) => Math.round(n / 5000) * 5000;

export const FUENTE_TABLA = 'Referencia de mercado Chile 2026';

export function sugerir(trabajo: Trabajo, pieza: PiezaId | null, severidad: Severidad, v: Pick<Vehiculo, 'carroceria' | 'modelo' | 'anio'>): Sugerido {
  const [a, b] = BASE[trabajo];
  const tam = pieza ? TAMANO_PIEZA[pieza] ?? 1 : 1;
  const seg = GRANDES.test(v.modelo) ? 1.7 : SEGMENTO[v.carroceria];
  const sev = trabajo === 'cambio' ? 1 : SEVERIDAD[severidad];
  const reciente = new Date().getFullYear() - v.anio <= 3 ? 1.05 : 1;
  const k = tam * seg * sev * reciente;
  return { min: redondear(a * k), max: redondear(b * k), fuente: FUENTE_TABLA };
}
