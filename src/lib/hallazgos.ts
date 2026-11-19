import { conEvento } from './automatizacion';
import type { Empresa, Hallazgo, Orden, TipoHallazgo } from './types';

/*
 * Acta de recepción (plano docs/specs/2026-11-19-acta-recepcion-hallazgos.md).
 * Funciones puras: no importa el almacén (cargaría localStorage al importarse). El id lo genera quien llama.
 */

// Listas literales: renombrar una pieza de la app no debe invalidar links ya enviados.
export const CATEGORIAS: Record<TipoHallazgo, readonly string[]> = {
  dano: ['Rayón', 'Abolladura', 'Trizadura', 'Pintura dañada', 'Pieza suelta o rota', 'Otro'],
  objeto: ['Cartera o bolso', 'Documentos', 'Dinero', 'Celular o electrónico', 'Lentes', 'Herramientas', 'Otro'],
};
export const UBICACIONES: Record<TipoHallazgo, readonly string[]> = {
  dano: ['Capot', 'Parachoque delantero', 'Parachoque trasero', 'Tapabarro delantero derecho', 'Tapabarro delantero izquierdo',
    'Puerta delantera derecha', 'Puerta delantera izquierda', 'Puerta trasera derecha', 'Puerta trasera izquierda',
    'Costado trasero derecho', 'Costado trasero izquierdo', 'Espejo derecho', 'Espejo izquierdo', 'Techo', 'Maletera o portón',
    'Parabrisas', 'Luneta trasera', 'Vidrio lateral', 'Focos o luces', 'Llantas', 'Interior'],
  objeto: ['Asiento delantero', 'Asiento trasero', 'Bajo un asiento', 'Guantera', 'Consola central', 'Maletera', 'Piso', 'Otro'],
};
export const MAX_FOTOS = 3, MAX_DETALLE = 300, MAX_HALLAZGOS = 30;
export const ID = /^[a-z0-9]{1,20}$/i;

const SUFIJO_CONFORMIDAD = ' · conformidad anterior anulada';

export const vigentes = (o: Pick<Orden, 'hallazgos'>) => (o.hallazgos ?? []).filter(h => !h.anulado);

export function nuevoHallazgo(d: Omit<Hallazgo, 'id' | 'creado'>, id: string, ahora = new Date()): Hallazgo {
  return { ...d, id, creado: ahora.toISOString(), detalle: d.detalle.trim().slice(0, MAX_DETALLE), fotos: d.fotos.slice(0, MAX_FOTOS) };
}

export function resumenHallazgo(h: Hallazgo): string {
  return `${h.categoria || (h.tipo === 'dano' ? 'Daño' : 'Objeto de valor')}${h.ubicacion ? ` en ${h.ubicacion}` : ''}`;
}

export function agregarHallazgo(o: Orden, h: Hallazgo): Orden {
  const lista = o.hallazgos ?? [];
  if (lista.length >= MAX_HALLAZGOS) return o;
  const habia = !!o.conformidadRecepcion;
  return conEvento(
    { ...o, hallazgos: [...lista, h], conformidadRecepcion: null },
    `Hallazgo registrado por ${h.autor || 'el taller'}: ${resumenHallazgo(h)}${habia ? SUFIJO_CONFORMIDAD : ''}`,
    true,
  );
}

export function anularHallazgo(o: Orden, id: string, por: string, motivo: string, ahora = new Date()): Orden {
  const m = motivo.trim().slice(0, MAX_DETALLE);
  const h = (o.hallazgos ?? []).find(x => x.id === id);
  if (!m || !h || h.anulado) return o;
  const habia = !!o.conformidadRecepcion;
  return conEvento(
    { ...o, hallazgos: o.hallazgos!.map(x => (x.id === id ? { ...x, anulado: { el: ahora.toISOString(), por, motivo: m } } : x)), conformidadRecepcion: null },
    `Hallazgo anulado por ${por}: ${resumenHallazgo(h)} · motivo: ${m}${habia ? SUFIJO_CONFORMIDAD : ''}`,
    true,
  );
}

export function marcarDevuelto(o: Orden, id: string, ahora = new Date()): { orden: Orden; fotos: string[] } {
  const h = (o.hallazgos ?? []).find(x => x.id === id);
  if (!h || h.tipo !== 'objeto' || h.devueltoEl || h.anulado) return { orden: o, fotos: [] };
  const orden = conEvento(
    { ...o, hallazgos: o.hallazgos!.map(x => (x.id === id ? { ...x, devueltoEl: ahora.toISOString(), fotos: [] } : x)) },
    'Objeto de valor devuelto; fotos borradas',
    true,
  );
  return { orden, fotos: h.fotos };
}

export function darConformidad(o: Orden, por: string, ahora = new Date()): Orden {
  return conEvento(
    { ...o, conformidadRecepcion: ahora.toISOString() },
    `Conformidad del cliente al acta de recepción (respuesta por WhatsApp), registrada por ${por}`,
    true,
  );
}

export const objetosPorDevolver = (o: Orden) => vigentes(o).filter(h => h.tipo === 'objeto' && !h.devueltoEl);
export const puedeEntregar = (o: Orden) => objetosPorDevolver(o).length === 0;

/** Genérico a propósito: el teléfono no está verificado y no se dice qué ni dónde. */
export function mensajeObjeto(empresa: Pick<Empresa, 'nombre'>): string {
  return `Hola, le escribimos de ${empresa.nombre}. Al trabajar en su vehículo encontramos un objeto de valor y quedó resguardado. Consúltenos el detalle.`;
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const fechaValida = (x: unknown): x is string => typeof x === 'string' && x.length < 40 && !Number.isNaN(Date.parse(x));
const str = (x: unknown, max = MAX_DETALLE) => (typeof x === 'string' ? x.slice(0, max) : '');

/** Saneo de lo guardado en el equipo. null si falta id, tipo o fecha de creación válidos. */
export function repararHallazgo(x: unknown): Hallazgo | null {
  if (!esObjeto(x) || typeof x.id !== 'string' || !ID.test(x.id) || (x.tipo !== 'dano' && x.tipo !== 'objeto') || !fechaValida(x.creado)) return null;
  const tipo = x.tipo;
  const a = esObjeto(x.anulado) && typeof x.anulado.el === 'string' && typeof x.anulado.por === 'string' && typeof x.anulado.motivo === 'string'
    ? { el: x.anulado.el, por: x.anulado.por, motivo: x.anulado.motivo } : undefined;
  return {
    id: x.id, tipo, creado: x.creado,
    categoria: str(x.categoria, 60), ubicacion: str(x.ubicacion, 60), detalle: str(x.detalle), autor: str(x.autor, 80),
    fotos: Array.isArray(x.fotos) ? x.fotos.filter((f): f is string => typeof f === 'string' && ID.test(f)).slice(0, MAX_FOTOS) : [],
    ...(tipo === 'dano' && typeof x.noRepara === 'boolean' ? { noRepara: x.noRepara } : {}),
    ...(tipo === 'objeto' && (x.resguardo === 'vehiculo' || x.resguardo === 'taller') ? { resguardo: x.resguardo } : {}),
    ...(tipo === 'objeto' && typeof x.devueltoEl === 'string' ? { devueltoEl: x.devueltoEl } : {}),
    ...(a ? { anulado: a } : {}),
  };
}

/** Lo que viaja en el link: sin autor, detalle, fotos ni anulado; los objetos, sin qué ni dónde. */
export function hallazgoAlLink(h: Hallazgo): Record<string, unknown> {
  // Del objeto, el cliente solo sabe que existe: ni cuántas fotos tiene.
  if (h.tipo === 'objeto') return { i: h.id, t: 'o', f: 0, r: h.creado, ...(h.devueltoEl ? { d: h.devueltoEl } : {}) };
  return { i: h.id, t: 'd', c: h.categoria, u: h.ubicacion, f: h.fotos.length, r: h.creado, ...(h.noRepara ? { n: 1 } : {}) };
}

/** Valida lo que llega del link (entrada no confiable). */
export function hallazgoDelLink(x: unknown): Hallazgo | null {
  if (!esObjeto(x) || typeof x.i !== 'string' || !ID.test(x.i) || !fechaValida(x.r)) return null;
  if (typeof x.f !== 'number' || !Number.isInteger(x.f) || x.f < 0 || x.f > MAX_FOTOS) return null;
  const base = { id: x.i, creado: x.r, detalle: '', fotos: [], fotosEnTaller: x.f, autor: '' };
  if (x.t === 'd') {
    if (typeof x.c !== 'string' || !CATEGORIAS.dano.includes(x.c) || typeof x.u !== 'string' || !UBICACIONES.dano.includes(x.u)) return null;
    if (x.n !== undefined && x.n !== 1) return null;
    if (x.d !== undefined) return null;
    return { ...base, tipo: 'dano', categoria: x.c, ubicacion: x.u, ...(x.n === 1 ? { noRepara: true } : {}) };
  }
  if (x.t === 'o') {
    if (x.n !== undefined || x.c !== undefined || x.u !== undefined) return null;
    if (x.d !== undefined && !fechaValida(x.d)) return null;
    return { ...base, tipo: 'objeto', categoria: '', ubicacion: '', ...(x.d ? { devueltoEl: x.d as string } : {}) };
  }
  return null;
}
