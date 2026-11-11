import { itemsCobrables, TRABAJOS, totales } from './piezas';
import type { Empresa, Item, Orden, Severidad, Trabajo } from './types';

/**
 * Rentabilidad por orden: lo cobrado (neto, sin IVA) menos mano de obra, pintura e insumos y repuestos.
 *
 * Valores de referencia para un taller de desabolladura y pintura en Chile (estimados, cada taller los
 * ajusta en Ajustes): una hora de taller cuesta ≈ $16.000 sumando el maestro (sueldo y leyes sociales)
 * y los gastos generales (arriendo, luz, cabina de pintura, herramientas); pintar una pieza gasta
 * ≈ $45-110 mil en pintura, barniz, aparejo y lija según el daño.
 */
export const COSTO_HORA_DEFECTO = 16000;

/** Horas típicas por trabajo y tamaño de daño, si el maestro no anotó las reales. */
const HORAS: Record<Trabajo | 'general', Record<Severidad, number>> = {
  desabolladura: { leve: 3, medio: 6, fuerte: 10 },
  pintura: { leve: 4, medio: 6, fuerte: 8 },
  cambio: { leve: 2, medio: 2, fuerte: 3 },
  plastico: { leve: 3, medio: 4, fuerte: 6 },
  pulido: { leve: 1.5, medio: 2, fuerte: 3 },
  general: { leve: 1, medio: 1, fuerte: 1 },
};

/** Pintura e insumos por trabajo (pesos netos): masilla y lija en desabolladura; pintura, barniz y aparejo al pintar. */
const INSUMOS: Record<Trabajo | 'general', Record<Severidad, number>> = {
  desabolladura: { leve: 10000, medio: 18000, fuerte: 28000 },
  pintura: { leve: 45000, medio: 75000, fuerte: 110000 },
  cambio: { leve: 5000, medio: 5000, fuerte: 8000 },
  plastico: { leve: 12000, medio: 18000, fuerte: 25000 },
  pulido: { leve: 6000, medio: 9000, fuerte: 14000 },
  general: { leve: 0, medio: 0, fuerte: 0 },
};

/** Si aún no se anota lo que costó un repuesto, se estima como la mitad de lo cobrado por ese cambio. */
const REPUESTO_SOBRE_COBRO = .5;

export const horasEstimadas = (i: Item) => HORAS[i.trabajo][i.severidad ?? 'medio'];

/**
 * De dónde sale el costo de la hora. El administrador puede fijarlo a mano en la empresa; si no,
 * se usa el que resulta de sus propios costos para el mes de la orden (ver `costos.ts`), y solo si
 * no hay ningún dato se cae al valor de referencia.
 */
export type ResolverHora = (periodo: string) => number | undefined;

function horaDe(empresa: Pick<Empresa, 'costoHora'>, periodo: string, resolver?: ResolverHora) {
  return empresa.costoHora ?? resolver?.(periodo) ?? COSTO_HORA_DEFECTO;
}

export interface LineaCosto { item: Item; horas: number; horasReales: boolean; manoObra: number; insumos: number; repuesto: number; repuestoReal: boolean }

export type Semaforo = 'buena' | 'justa' | 'baja' | 'perdida';
export const semaforoMargen = (margen: number): Semaforo => (margen < 0 ? 'perdida' : margen < 15 ? 'baja' : margen < 30 ? 'justa' : 'buena');

/** Cuentas de una orden. `estimado` indica si algún costo aún no es real (horas o repuesto sin anotar). */
export function rentabilidad(o: Orden, empresa: Pick<Empresa, 'costoHora'>, resolver?: ResolverHora) {
  const hora = horaDe(empresa, o.creada.slice(0, 7), resolver);
  const lineas: LineaCosto[] = o.items.map(i => {
    const horas = i.horas ?? horasEstimadas(i);
    const rep = i.trabajo === 'cambio' ? o.repuestos.find(r => r.itemId === i.id) : undefined;
    const repuestoReal = rep?.costo !== undefined;
    const repuesto = i.trabajo !== 'cambio' ? 0 : repuestoReal ? rep!.costo! : Math.round((i.monto ?? 0) * REPUESTO_SOBRE_COBRO);
    return { item: i, horas, horasReales: i.horas !== undefined, manoObra: Math.round(horas * hora), insumos: INSUMOS[i.trabajo][i.severidad ?? 'medio'], repuesto, repuestoReal: i.trabajo !== 'cambio' || repuestoReal };
  });
  const suma = (k: 'manoObra' | 'insumos' | 'repuesto' | 'horas') => lineas.reduce((a, l) => a + l[k], 0);
  const ingreso = totales(o).neto;
  const manoObra = suma('manoObra'), insumos = suma('insumos'), repuestos = suma('repuesto');
  const costo = manoObra + insumos + repuestos, ganancia = ingreso - costo;
  const margen = ingreso > 0 ? Math.round((ganancia / ingreso) * 100) : 0;
  const sinMonto = itemsCobrables(o).some(i => i.monto === null);
  return {
    lineas, ingreso, manoObra, insumos, repuestos, costo, ganancia, margen, horas: Math.round(suma('horas') * 10) / 10,
    semaforo: semaforoMargen(margen), sinMonto,
    estimado: lineas.some(l => !l.horasReales || !l.repuestoReal),
  };
}

/** Para el dueño: margen total y qué trabajos y qué pagadores dejan más (o menos) plata. */
export function resumenRentabilidad(ordenes: Orden[], empresa: Pick<Empresa, 'costoHora'>, resolver?: ResolverHora) {
  const conMonto = ordenes.filter(o => totales(o).neto > 0 && !itemsCobrables(o).some(i => i.monto === null));
  const filas = conMonto.map(o => ({ o, r: rentabilidad(o, empresa, resolver) }));
  const ingreso = filas.reduce((a, x) => a + x.r.ingreso, 0), ganancia = filas.reduce((a, x) => a + x.r.ganancia, 0);

  // Por tipo de trabajo: lo cobrado de cada ítem contra su propio costo.
  const tipos = TRABAJOS.map(t => {
    const ls = filas.flatMap(x => x.r.lineas.filter(l => l.item.trabajo === t.id && l.item.monto !== null));
    const ing = ls.reduce((a, l) => a + (l.item.monto ?? 0), 0), cos = ls.reduce((a, l) => a + l.manoObra + l.insumos + l.repuesto, 0);
    return { id: t.id, nombre: t.nombre, trabajos: ls.length, ingreso: ing, ganancia: ing - cos, margen: ing ? Math.round(((ing - cos) / ing) * 100) : 0 };
  }).filter(t => t.trabajos > 0).sort((a, b) => b.margen - a.margen);

  // Por quién paga: particulares y cada compañía.
  const pagadores = [...new Set(filas.map(x => (x.o.pagador.tipo === 'particular' ? 'Particulares' : x.o.pagador.aseguradora ?? 'Compañía')))].map(nombre => {
    const suyas = filas.filter(x => (x.o.pagador.tipo === 'particular' ? 'Particulares' : x.o.pagador.aseguradora) === nombre);
    const ing = suyas.reduce((a, x) => a + x.r.ingreso, 0), gan = suyas.reduce((a, x) => a + x.r.ganancia, 0);
    return { nombre, ordenes: suyas.length, ingreso: ing, ganancia: gan, margen: ing ? Math.round((gan / ing) * 100) : 0 };
  }).sort((a, b) => b.margen - a.margen);

  const peores = [...filas].sort((a, b) => a.r.margen - b.r.margen).slice(0, 3);
  return { filas, ingreso, ganancia, margen: ingreso ? Math.round((ganancia / ingreso) * 100) : 0, tipos, pagadores, peores };
}
