import { useSyncExternalStore } from 'react';
import type { Severidad, Trabajo } from './types';

/**
 * Costos reales del taller: trabajadores con su sueldo, gastos fijos y variables, y las boletas
 * que llegan mes a mes. De aquí sale el costo de una hora de taller que usa la rentabilidad.
 *
 * Dos fechas distintas y una regla que no se rompe:
 * - `periodo` es el mes al que pertenece el gasto (la luz de noviembre).
 * - `registradaEl` es el día en que llegó la boleta (10 de diciembre).
 * Un gasto pertenece al mes en que se consumió, no al día en que se pagó. Sin eso, los meses
 * quedan corridos y las ganancias mienten.
 */

export type Periodicidad = 'mensual' | 'semanal' | 'trimestral' | 'anual';

export interface Trabajador {
  id: string;
  nombre: string;
  /** Sueldo bruto de la liquidación, antes de descuentos legales. */
  sueldoBruto: number;
  horasSemana: number;
  /** Cargas patronales + provisiones, en porcentaje sobre el bruto. */
  cargasPct: number;
  /** Porcentaje de la jornada que de verdad produce trabajo cobrable (el resto es espera, taller, traslados). */
  ocupacionPct: number;
  activo: boolean;
}

export interface Gasto {
  id: string;
  nombre: string;
  periodicidad: Periodicidad;
  activo: boolean;
}

export interface Boleta {
  id: string;
  gastoId: string;
  /** Mes que cubre la boleta, AAAA-MM. No es la fecha de pago. */
  periodo: string;
  monto: number;
  /** Día en que se pagó, AAAA-MM-DD. */
  pagadaEl?: string;
  folio?: string;
  /** Identificador de la foto en IndexedDB (`dp-fotos`). */
  foto?: string;
  nota?: string;
  registradaEl: string;
}

export interface BaseCostos {
  trabajadores: Trabajador[];
  gastos: Gasto[];
  boletas: Boleta[];
  /** Lo que el taller corrigió a mano. Lo que no esté aquí usa la tabla de referencia. */
  insumos: Partial<Record<string, Record<Severidad, number>>>;
}

/**
 * Recargo sobre el sueldo bruto. En Chile 2026 las cargas del empleador son ≈7 % (AFP 0,1 %,
 * SIS, seguro de cesantía 2,4 %, mutual ≈1 %, Ley SANNA 0,03 %); sumando vacaciones y
 * gratificación legal queda cerca de 12 %. Editable: cada taller puede poner su cifra.
 */
export const CARGAS_DEFECTO = 12;
export const OCUPACION_DEFECTO = 80;

/**
 * Referencia de pintura e insumos por trabajo y tipo de dano, en pesos netos: masilla y lija al
 * desabollar; pintura, barniz y aparejo al pintar. El taller puede corregir cada fila en Ajustes;
 * lo que no corrija usa esta tabla.
 */
export const INSUMOS_REFERENCIA: Record<Trabajo | 'general', Record<Severidad, number>> = {
  desabolladura: { leve: 10000, medio: 18000, fuerte: 28000 },
  pintura: { leve: 45000, medio: 75000, fuerte: 110000 },
  cambio: { leve: 5000, medio: 5000, fuerte: 8000 },
  plastico: { leve: 12000, medio: 18000, fuerte: 25000 },
  pulido: { leve: 6000, medio: 9000, fuerte: 14000 },
  general: { leve: 0, medio: 0, fuerte: 0 },
};

/** Semanas promedio por mes: 52 ÷ 12. */
export const SEMANAS_MES = 52 / 12;

const CLAVE = (empresaId: string) => `dp.costos.v1.${empresaId}`;
const MENSUALIZAR: Record<Periodicidad, number> = { mensual: 1, semanal: 1, trimestral: 1 / 3, anual: 1 / 12 };

/* ---------------------------------------------------------------------------------------------
 * Almacenamiento
 * ------------------------------------------------------------------------------------------- */

/** Sin localStorage (modo privado, pruebas) los datos viven en memoria: la app no se cae. */
const memoria = new Map<string, string>();
const guardado = {
  leer(k: string): string | null {
    if (memoria.has(k)) return memoria.get(k)!;
    try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; }
  },
  escribir(k: string, v: string) {
    try { globalThis.localStorage?.setItem(k, v); } catch { /* sin almacén */ }
    memoria.set(k, v);
  },
};

const vacia = (): BaseCostos => ({ trabajadores: [], gastos: [], boletas: [], insumos: {} });
const cache = new Map<string, BaseCostos>();
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(f => f());

const numero = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const textoPlano = (x: unknown) => (typeof x === 'string' ? x : '');

/** Solo se aceptan correcciones con las tres severidades y montos válidos. */
function repararInsumos(crudo: unknown): BaseCostos['insumos'] {
  if (typeof crudo !== 'object' || crudo === null) return {};
  const salida: BaseCostos['insumos'] = {};
  for (const [trabajo, fila] of Object.entries(crudo as Record<string, unknown>)) {
    if (!fila || typeof fila !== 'object') continue;
    const f = fila as Record<string, unknown>;
    if (!['leve', 'medio', 'fuerte'].every(s => Number.isFinite(Number(f[s])))) continue;
    salida[trabajo] = { leve: numero(f.leve), medio: numero(f.medio), fuerte: numero(f.fuerte) };
  }
  return salida;
}

/** Lo guardado puede venir de una versión anterior o dañado: se acepta solo lo que tiene forma. */
function reparar(crudo: unknown): BaseCostos {
  const o = (typeof crudo === 'object' && crudo !== null ? crudo : {}) as Record<string, unknown>;
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter(v => typeof v === 'object' && v !== null) as Record<string, unknown>[] : []);
  return {
    trabajadores: lista(o.trabajadores)
      .filter(t => typeof t.id === 'string' && t.id)
      .map(t => ({
        id: String(t.id), nombre: textoPlano(t.nombre) || 'Trabajador',
        sueldoBruto: numero(t.sueldoBruto), horasSemana: numero(t.horasSemana) || 42,
        cargasPct: Number.isFinite(Number(t.cargasPct)) ? Number(t.cargasPct) : CARGAS_DEFECTO,
        ocupacionPct: numero(t.ocupacionPct) || OCUPACION_DEFECTO,
        activo: t.activo !== false,
      })),
    gastos: lista(o.gastos)
      .filter(g => typeof g.id === 'string' && g.id)
      .map(g => ({
        id: String(g.id), nombre: textoPlano(g.nombre) || 'Gasto',
        periodicidad: (MENSUALIZAR[g.periodicidad as Periodicidad] !== undefined ? g.periodicidad : 'mensual') as Periodicidad,
        activo: g.activo !== false,
      })),
    boletas: lista(o.boletas)
      .filter(b => typeof b.gastoId === 'string' && typeof b.periodo === 'string' && /^\d{4}-\d{2}$/.test(b.periodo))
      .map(b => ({
        id: String(b.id ?? uid()), gastoId: String(b.gastoId), periodo: String(b.periodo),
        monto: numero(b.monto), pagadaEl: textoPlano(b.pagadaEl) || undefined,
        folio: textoPlano(b.folio) || undefined, foto: textoPlano(b.foto) || undefined,
        nota: textoPlano(b.nota) || undefined, registradaEl: textoPlano(b.registradaEl),
      })),
    insumos: repararInsumos(o.insumos),
  };
}

export function leerCostos(empresaId: string): BaseCostos {
  const enCache = cache.get(empresaId);
  if (enCache) return enCache;
  let bd: BaseCostos;
  try {
    const crudo = guardado.leer(CLAVE(empresaId));
    bd = crudo ? reparar(JSON.parse(crudo)) : empresaId === 'demo' ? costosDemo() : vacia();
  } catch {
    bd = empresaId === 'demo' ? costosDemo() : vacia();
  }
  // La demo se presenta sola: si el taller de ejemplo quedó vacío, se vuelve a sembrar.
  if (empresaId === 'demo' && !bd.trabajadores.length && !bd.gastos.length) bd = costosDemo();
  cache.set(empresaId, bd);
  return bd;
}

function escribir(empresaId: string, bd: BaseCostos) {
  cache.set(empresaId, bd);
  guardado.escribir(CLAVE(empresaId), JSON.stringify(bd));
  avisar();
}

export function restablecerCostos(empresaId: string) {
  cache.delete(empresaId);
  try { globalThis.localStorage?.removeItem(CLAVE(empresaId)); } catch { /* nada que borrar */ }
  avisar();
}

const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
export const useCostos = (empresaId: string) => useSyncExternalStore(suscribir, () => leerCostos(empresaId), () => leerCostos(empresaId));

if (typeof addEventListener === 'function') {
  addEventListener('storage', e => { if (e.key === null || e.key.startsWith('dp.costos.')) { cache.clear(); avisar(); } });
}

export function uid() { return Math.random().toString(36).slice(2, 10); }

/* ---------------------------------------------------------------------------------------------
 * Trabajadores y gastos
 * ------------------------------------------------------------------------------------------- */

export const nuevoTrabajador = (): Trabajador => ({
  id: uid(), nombre: 'Trabajador', sueldoBruto: 700000, horasSemana: 42,
  cargasPct: CARGAS_DEFECTO, ocupacionPct: OCUPACION_DEFECTO, activo: true,
});

export const nuevoGasto = (nombre = ''): Gasto => ({ id: uid(), nombre, periodicidad: 'mensual', activo: true });

export function guardarTrabajador(empresaId: string, t: Trabajador) {
  const bd = leerCostos(empresaId);
  escribir(empresaId, { ...bd, trabajadores: bd.trabajadores.some(x => x.id === t.id) ? bd.trabajadores.map(x => (x.id === t.id ? t : x)) : [...bd.trabajadores, t] });
}

export function quitarTrabajador(empresaId: string, id: string) {
  const bd = leerCostos(empresaId);
  escribir(empresaId, { ...bd, trabajadores: bd.trabajadores.filter(t => t.id !== id) });
}

export function guardarGasto(empresaId: string, g: Gasto) {
  const bd = leerCostos(empresaId);
  escribir(empresaId, { ...bd, gastos: bd.gastos.some(x => x.id === g.id) ? bd.gastos.map(x => (x.id === g.id ? g : x)) : [...bd.gastos, g] });
}

/** Borrar un gasto lo desactiva: sus boletas siguen contando para los meses ya pasados. */
export function archivarGasto(empresaId: string, id: string) {
  const bd = leerCostos(empresaId);
  escribir(empresaId, { ...bd, gastos: bd.gastos.map(g => (g.id === id ? { ...g, activo: !g.activo } : g)) });
}

/* ---------------------------------------------------------------------------------------------
 * Boletas
 * ------------------------------------------------------------------------------------------- */

export const boletaDe = (bd: BaseCostos, gastoId: string, periodo: string) => bd.boletas.find(b => b.gastoId === gastoId && b.periodo === periodo);

/**
 * Guarda o reemplaza la boleta de un gasto y un mes. Un mes tiene una sola boleta por gasto:
 * volver a cargarla la corrige en vez de duplicar el costo.
 */
export function guardarBoleta(empresaId: string, b: Omit<Boleta, 'id' | 'registradaEl'> & Partial<Pick<Boleta, 'id' | 'registradaEl'>>) {
  const bd = leerCostos(empresaId);
  const previa = boletaDe(bd, b.gastoId, b.periodo);
  const nueva: Boleta = { ...b, id: b.id ?? previa?.id ?? uid(), registradaEl: b.registradaEl ?? new Date().toISOString() };
  escribir(empresaId, { ...bd, boletas: [...bd.boletas.filter(x => !(x.gastoId === b.gastoId && x.periodo === b.periodo)), nueva] });
  return nueva;
}

export function quitarBoleta(empresaId: string, id: string) {
  const bd = leerCostos(empresaId);
  escribir(empresaId, { ...bd, boletas: bd.boletas.filter(b => b.id !== id) });
}

/* ---------------------------------------------------------------------------------------------
 * Meses
 * ------------------------------------------------------------------------------------------- */

export const periodoDe = (fechaISO: string) => (fechaISO || '').slice(0, 7);

/** Los `n` meses anteriores a `hasta` (AAAA-MM), del más viejo al más nuevo. */
export function mesesAtras(hasta: string, n: number): string[] {
  const [a, m] = hasta.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function nombreMes(periodo: string) {
  const [a, m] = periodo.split('-').map(Number);
  return `${MESES[(m || 1) - 1]} ${a}`;
}

export const mesActual = (hoy = new Date()) => `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

/* ---------------------------------------------------------------------------------------------
 * El cálculo
 * ------------------------------------------------------------------------------------------- */

export interface GastoDelMes { gasto: Gasto; monto: number; real: boolean; sinDatos: boolean }

/** Cuánto cuesta ese gasto en un mes. Si la boleta no llegó, se estima con las anteriores. */
export function gastoEnMes(bd: BaseCostos, gasto: Gasto, periodo: string): GastoDelMes {
  const real = boletaDe(bd, gasto.id, periodo);
  if (real) return { gasto, monto: real.monto * MENSUALIZAR[gasto.periodicidad], real: true, sinDatos: false };
  // Estimación: promedio de hasta 3 boletas anteriores. Es lo mejor que se puede hacer sin la cuenta.
  const previas = bd.boletas
    .filter(b => b.gastoId === gasto.id && b.periodo < periodo)
    .sort((a, b) => (a.periodo < b.periodo ? 1 : -1))
    .slice(0, 3);
  if (!previas.length) return { gasto, monto: 0, real: false, sinDatos: true };
  const promedio = previas.reduce((a, b) => a + b.monto, 0) / previas.length;
  return { gasto, monto: promedio * MENSUALIZAR[gasto.periodicidad], real: false, sinDatos: false };
}

export interface CalculoMes {
  periodo: string;
  manoObra: number;
  gastos: number;
  horasProductivas: number;
  costoHora: number;
  /** Al menos un número es estimado: la boleta de ese gasto todavía no llega. */
  estimado: boolean;
  /** Gastos activos sin ninguna boleta: no hay de dónde estimar. */
  faltan: string[];
  detalleGastos: GastoDelMes[];
  trabajadores: Trabajador[];
}

/** Costo de una hora de taller en un mes: todo lo que cuesta tener el taller abierto ÷ horas que producen. */
export function calculoMes(bd: BaseCostos, periodo: string): CalculoMes {
  const trabajadores = bd.trabajadores.filter(t => t.activo);
  const horasProductivas = trabajadores.reduce((a, t) => a + t.horasSemana * SEMANAS_MES * (t.ocupacionPct / 100), 0);
  const manoObra = trabajadores.reduce((a, t) => a + t.sueldoBruto * (1 + t.cargasPct / 100), 0);
  const detalleGastos = bd.gastos.filter(g => g.activo).map(g => gastoEnMes(bd, g, periodo));
  const gastos = detalleGastos.reduce((a, g) => a + g.monto, 0);
  const costoHora = horasProductivas > 0 ? (manoObra + gastos) / horasProductivas : 0;
  return {
    periodo, manoObra, gastos, horasProductivas, costoHora,
    estimado: detalleGastos.some(g => !g.real),
    faltan: detalleGastos.filter(g => g.sinDatos).map(g => g.gasto.nombre),
    detalleGastos, trabajadores,
  };
}

/** Atajo para la rentabilidad: el costo de la hora del mes, o `undefined` si no hay datos. */
export function costoHoraDelMes(empresaId: string, periodo: string): number | undefined {
  const c = calculoMes(leerCostos(empresaId), periodo);
  return c.horasProductivas > 0 && c.costoHora > 0 ? Math.round(c.costoHora) : undefined;
}

/**
 * Lo que gasta en insumos ese trabajo con ese daño: lo que el taller corrigió, o la referencia.
 */
export function insumoDe(bd: BaseCostos, trabajo: Trabajo | 'general', severidad: Severidad): number {
  return bd.insumos[trabajo]?.[severidad] ?? INSUMOS_REFERENCIA[trabajo][severidad];
}

/** Corregir una fila. Sin fila, vuelve a la tabla de referencia. */
export function guardarInsumo(empresaId: string, trabajo: string, fila?: Record<Severidad, number>) {
  const bd = leerCostos(empresaId);
  const insumos = { ...bd.insumos };
  if (fila) { insumos[trabajo] = fila; } else { delete insumos[trabajo]; }
  escribir(empresaId, { ...bd, insumos });
}

/** ¿Esta fila está corregida a mano? Sirve para ofrecer «volver a la referencia». */
export const insumoCorregido = (bd: BaseCostos, trabajo: string) => bd.insumos[trabajo] !== undefined;

/* ---------------------------------------------------------------------------------------------
 * Alertas: lo que el administrador tiene que mirar
 * ------------------------------------------------------------------------------------------- */

export interface Alerta { nivel: 'atencion' | 'dato'; texto: string }

export function alertas(bd: BaseCostos, hoy = new Date()): Alerta[] {
  const salida: Alerta[] = [];
  const actual = mesActual(hoy), anterior = mesesAtras(actual, 2)[0];

  if (!bd.trabajadores.some(t => t.activo)) {
    salida.push({ nivel: 'atencion', texto: 'No hay trabajadores activos: sin sueldos no se puede calcular el costo de la hora.' });
  }

  for (const g of bd.gastos.filter(x => x.activo)) {
    const delAnterior = gastoEnMes(bd, g, anterior);
    if (delAnterior.sinDatos) {
      salida.push({ nivel: 'atencion', texto: `${g.nombre}: no hay ninguna boleta cargada, el costo de ese gasto cuenta como $0.` });
      continue;
    }
    if (g.periodicidad === 'mensual' && !boletaDe(bd, g.id, anterior)) {
      salida.push({ nivel: 'atencion', texto: `${g.nombre}: falta la boleta de ${nombreMes(anterior)}. Se está estimando con las anteriores.` });
    }
    // Lo que pidió el taller: enterarse cuando sube una cuenta.
    const suyas = bd.boletas.filter(b => b.gastoId === g.id).sort((a, b) => (a.periodo < b.periodo ? 1 : -1));
    if (suyas.length >= 2) {
      const [ultima, ...anteriores] = suyas;
      const promedio = anteriores.slice(0, 3).reduce((a, b) => a + b.monto, 0) / Math.min(3, anteriores.length);
      if (promedio > 0) {
        const cambio = Math.round(((ultima.monto - promedio) / promedio) * 100);
        if (Math.abs(cambio) >= 20) {
          salida.push({
            nivel: 'dato',
            texto: `${g.nombre}: ${cambio > 0 ? 'subió' : 'bajó'} ${Math.abs(cambio)} % en ${nombreMes(ultima.periodo)} ($${Math.round(ultima.monto).toLocaleString('es-CL')} frente a $${Math.round(promedio).toLocaleString('es-CL')} de promedio).`,
          });
        }
      }
    }
  }
  return salida;
}

/* ---------------------------------------------------------------------------------------------
 * Datos de ejemplo
 * ------------------------------------------------------------------------------------------- */

/**
 * Taller de ejemplo con tres meses de boletas de luz, para que el módulo se vea funcionando.
 * Los montos son ficticios pero plausibles: la luz de noviembre sube 16 % y dispara la alerta.
 */
export function costosDemo(): BaseCostos {
  const trabajador: Trabajador = {
    id: 'demo-trabajador', nombre: 'Trabajador Demo', sueldoBruto: 700000,
    horasSemana: 42, cargasPct: CARGAS_DEFECTO, ocupacionPct: OCUPACION_DEFECTO, activo: true,
  };
  const gastos: Gasto[] = [
    { id: 'g-arriendo', nombre: 'Arriendo', periodicidad: 'mensual', activo: true },
    { id: 'g-luz', nombre: 'Electricidad', periodicidad: 'mensual', activo: true },
    { id: 'g-agua', nombre: 'Agua', periodicidad: 'mensual', activo: true },
    { id: 'g-telefono', nombre: 'Teléfono', periodicidad: 'mensual', activo: true },
    { id: 'g-internet', nombre: 'Internet', periodicidad: 'mensual', activo: true },
    { id: 'g-uber', nombre: 'Uber (traslados)', periodicidad: 'semanal', activo: true },
  ];
  const meses = mesesAtras(mesActual(), 3);
  const fijas: Record<string, number[]> = {
    'g-arriendo': [450000, 450000, 450000],
    'g-agua': [21500, 22300, 22800],
    'g-telefono': [24900, 24900, 25900],
    'g-internet': [29990, 29990, 29990],
    'g-uber': [82000, 86000, 90000],
  };
  const luz = [48200, 52700, 61400];
  const boletas: Boleta[] = [];
  meses.forEach((periodo, i) => {
    for (const [gastoId, montos] of Object.entries(fijas)) {
      boletas.push({ id: `b-${gastoId}-${periodo}`, gastoId, periodo, monto: montos[i], registradaEl: `${periodo}-05T12:00:00.000Z` });
    }
    boletas.push({ id: `b-g-luz-${periodo}`, gastoId: 'g-luz', periodo, monto: luz[i], folio: `88${4520 + i}`, registradaEl: `${periodo}-10T12:00:00.000Z` });
  });
  return { trabajadores: [trabajador], gastos, boletas, insumos: {} };
}
