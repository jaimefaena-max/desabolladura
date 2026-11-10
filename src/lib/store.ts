import { useSyncExternalStore } from 'react';
import { borrarFotos } from './fotos';
import { conFotosDemo, ordenesDemo, USUARIOS } from './seed';
import type { Empresa, Orden, Usuario } from './types';

/**
 * Base de datos de la demostración: vive en el navegador, separada por empresa.
 * La versión de producción reemplaza este módulo por un servidor con la misma interfaz.
 */
const CLAVE_EMPRESAS = 'dp.empresas.v2';
const CLAVE_ACTUAL = 'dp.empresa.actual';
const SESION = 'dp.sesion';
const ACENTO = '#ff7a2f';
const claveOrdenes = (id: string) => `dp.ordenes.v2.${id}`;

/**
 * Almacén que nunca lanza. Si el navegador lo bloquea (modo privado, cookies bloqueadas, navegador
 * dentro de otra app) o se llena, la app sigue con los datos en memoria y avisa que no se guardan.
 */
function almacen(nombre: 'localStorage' | 'sessionStorage') {
  const memoria = new Map<string, string>();
  let real: Storage | undefined;
  try { real = globalThis[nombre]; } catch { /* bloqueado por el navegador */ }
  return {
    leer(k: string): string | null {
      if (memoria.has(k)) return memoria.get(k)!;
      try { return real?.getItem(k) ?? null; } catch { return null; }
    },
    /** Devuelve false si el navegador no lo guardó: queda solo en memoria. */
    escribir(k: string, v: string): boolean {
      try {
        if (!real) throw new Error('sin almacén');
        real.setItem(k, v);
        memoria.delete(k);
        return true;
      } catch {
        memoria.set(k, v);
        return false;
      }
    },
    borrar(k: string) {
      memoria.delete(k);
      try { real?.removeItem(k); } catch { /* nada que borrar */ }
    },
  };
}
const local = almacen('localStorage');
const deSesion = almacen('sessionStorage');

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const lista = (x: unknown) => (Array.isArray(x) ? x : []);

function leerJSON(k: string): unknown {
  try {
    const s = local.leer(k);
    return s ? JSON.parse(s) : undefined;
  } catch {
    return undefined; // datos corruptos: se vuelve al valor base
  }
}

const empresaDemo = (): Empresa => ({ id: 'demo', nombre: 'Taller Demo', acento: ACENTO, whatsapp: '' });

/** Lo guardado puede venir dañado o de una versión anterior: se acepta solo lo que tiene forma de empresa. */
function leerEmpresas(): Empresa[] {
  const validas = lista(leerJSON(CLAVE_EMPRESAS))
    .filter((e): e is Record<string, unknown> => esObjeto(e) && typeof e.id === 'string' && !!e.id && typeof e.nombre === 'string')
    .map(e => ({
      ...e,
      acento: typeof e.acento === 'string' && /^#[0-9a-f]{6}$/i.test(e.acento) ? e.acento : ACENTO,
      whatsapp: typeof e.whatsapp === 'string' ? e.whatsapp : '',
    }) as Empresa);
  return validas.length ? validas : [empresaDemo()];
}

/** Una orden guardada sirve si tiene lo mínimo; las listas que falten (versiones viejas) se completan vacías. */
function repararOrden(o: unknown): Orden | null {
  if (!esObjeto(o) || typeof o.id !== 'string' || typeof o.numero !== 'number' || typeof o.codigo !== 'string') return null;
  if (!esObjeto(o.vehiculo) || !esObjeto(o.pagador) || !Array.isArray(o.items) || !o.items.every(esObjeto)) return null;
  return {
    ...o,
    cliente: esObjeto(o.cliente) ? o.cliente : { nombre: '', rut: '', telefono: '' },
    recepcion: esObjeto(o.recepcion) ? o.recepcion : { km: null, combustible: '', observaciones: '' },
    repuestos: lista(o.repuestos), fotos: lista(o.fotos), historial: lista(o.historial),
    notas: typeof o.notas === 'string' ? o.notas : '',
    entrega: typeof o.entrega === 'string' ? o.entrega : '',
    entregadaEl: typeof o.entregadaEl === 'string' ? o.entregadaEl : null,
  } as unknown as Orden;
}

function cargarOrdenes(id: string): Orden[] {
  const base = () => (id === 'demo' ? ordenesDemo() : []);
  try {
    const crudo = leerJSON(claveOrdenes(id));
    if (!Array.isArray(crudo)) return base();
    const sanas = crudo.map(repararOrden).filter((o): o is Orden => !!o);
    if (crudo.length && !sanas.length) return base();
    return id === 'demo' ? conFotosDemo(sanas) : sanas;
  } catch {
    return base();
  }
}

let empresas = leerEmpresas();
let actual = empresas.find(e => e.id === local.leer(CLAVE_ACTUAL)) ?? empresas[0];
let ordenes = cargarOrdenes(actual.id);
/** true cuando el navegador rechazó el último guardado: los cambios viven solo hasta cerrar la pestaña. */
let sinGuardar = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(f => f());

function persistir(clave: string, valor: unknown): boolean {
  const ok = local.escribir(clave, JSON.stringify(valor));
  sinGuardar = !ok;
  return ok;
}

function publicar(nuevas: Orden[]) {
  ordenes = nuevas;
  // Sin espacio: se suelta lo más pesado (formato antiguo de imagen) y se intenta otra vez.
  if (!persistir(claveOrdenes(actual.id), ordenes)) persistir(claveOrdenes(actual.id), ordenes.map(o => ({ ...o, imagenIA: undefined })));
  avisar();
}

const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
export const useOrdenes = () => useSyncExternalStore(suscribir, () => ordenes, () => ordenes);
export const useOrden = (id: string) => useOrdenes().find(o => o.id === id);
export const useEmpresa = () => useSyncExternalStore(suscribir, () => actual, () => actual);
export const useEmpresas = () => useSyncExternalStore(suscribir, () => empresas, () => empresas);
export const useSinGuardar = () => useSyncExternalStore(suscribir, () => sinGuardar, () => sinGuardar);

/* Dos pestañas (administrador y trabajador) comparten los datos: lo que guarda una lo ve la otra. */
if (typeof addEventListener === 'function') {
  addEventListener('storage', e => {
    if (e.key !== null && e.key !== CLAVE_EMPRESAS && e.key !== claveOrdenes(actual.id)) return;
    empresas = leerEmpresas();
    actual = empresas.find(x => x.id === actual.id) ?? empresas[0];
    ordenes = cargarOrdenes(actual.id);
    aplicarMarca(actual);
    avisar();
  });
}

export function guardarOrden(o: Orden) {
  publicar(ordenes.some(x => x.id === o.id) ? ordenes.map(x => (x.id === o.id ? o : x)) : [o, ...ordenes]);
}
export function actualizar(id: string, cambio: (o: Orden) => Orden) {
  publicar(ordenes.map(o => (o.id === id ? cambio(o) : o)));
}
export const siguienteNumero = () => Math.max(1000, ...ordenes.map(o => o.numero)) + 1;

/** Identificadores de las fotos que el taller guardó en este equipo para estas órdenes. */
const fotosDe = (os: Orden[]) => os.flatMap(o => [
  ...o.fotos.map(f => f.id),
  ...o.items.flatMap(i => [i.fotoAntes, i.fotoDespues]),
  ...Object.values(o.vistas ?? {}).map(r => (r?.startsWith('idb:') ? r.slice(4) : undefined)),
]).filter((x): x is string => !!x);

export function restablecerDemo() {
  void borrarFotos(fotosDe(ordenes)).catch(() => { /* sin IndexedDB no hay fotos que borrar */ });
  publicar(actual.id === 'demo' ? ordenesDemo() : []);
}

/** Salida de emergencia: borra todo lo guardado de la demo (no la clave de Gemini). */
export function borrarTodo() {
  [CLAVE_EMPRESAS, CLAVE_ACTUAL, ...empresas.map(e => claveOrdenes(e.id))].forEach(local.borrar);
}

export const ultimaOrdenDePatente = (patente: string) => ordenes.find(o => o.vehiculo.patente === patente);

export function buscarPorAcceso(patente: string, codigo: string) {
  const p = patente.toUpperCase().replace(/[^A-Z0-9]/g, ''), c = codigo.trim().toUpperCase();
  return ordenes.find(o => o.vehiculo.patente === p && o.codigo === c);
}

/* Empresas: cada taller tiene marca y datos propios. */
function textoSobre(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4));
  return .2126 * r + .7152 * g + .0722 * b > .22 ? '#14100c' : '#f7f8f9';
}
export function aplicarMarca(e: Empresa) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--acento', e.acento);
  document.documentElement.style.setProperty('--sobre-acento', textoSobre(e.acento));
}
function guardarEmpresas(nuevas: Empresa[]) {
  empresas = nuevas;
  actual = nuevas.find(e => e.id === actual.id) ?? nuevas[0];
  persistir(CLAVE_EMPRESAS, nuevas);
  aplicarMarca(actual);
  avisar();
}
export const editarEmpresa = (c: Partial<Empresa>) => guardarEmpresas(empresas.map(e => (e.id === actual.id ? { ...e, ...c } : e)));
export function cambiarEmpresa(id: string) {
  actual = empresas.find(e => e.id === id) ?? actual;
  local.escribir(CLAVE_ACTUAL, actual.id);
  ordenes = cargarOrdenes(actual.id);
  aplicarMarca(actual);
  avisar();
}
export function crearEmpresa(nombre: string) {
  const e: Empresa = { id: uid(), nombre: nombre.trim(), acento: ACENTO, whatsapp: '' };
  guardarEmpresas([...empresas, e]);
  cambiarEmpresa(e.id);
}

/*
 * Entrada de demostración por perfil, sin usuario ni clave: no hay servidor que proteger.
 * En un producto real esto se reemplaza por autenticación del lado del servidor.
 */
export function entrarDemo(rol: Usuario['rol']): Usuario {
  const u = USUARIOS.find(x => x.rol === rol)!;
  deSesion.escribir(SESION, u.id);
  return u;
}
export const sesion = () => USUARIOS.find(u => u.id === deSesion.leer(SESION)) ?? null;
export const cerrarSesion = () => deSesion.borrar(SESION);

export function uid() { return Math.random().toString(36).slice(2, 10); }
export function codigoCliente() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => a[b % a.length]).join('');
}

/** Lectura fuera de React (pruebas y diagnóstico). */
export const instantanea = () => ({ ordenes, empresas, actual, sinGuardar });
