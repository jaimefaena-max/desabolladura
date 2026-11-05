import { useSyncExternalStore } from 'react';
import { ordenesDemo, USUARIOS } from './seed';
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

const leer = <T,>(k: string, base: () => T): T => {
  try {
    const s = localStorage.getItem(k);
    if (s) return JSON.parse(s) as T;
  } catch { /* datos corruptos: se vuelve al valor base */ }
  return base();
};

let empresas = leer<Empresa[]>(CLAVE_EMPRESAS, () => [{ id: 'demo', nombre: 'Taller Demo', acento: ACENTO, whatsapp: '' }]);
let actual = empresas.find(e => e.id === localStorage.getItem(CLAVE_ACTUAL)) ?? empresas[0];
const cargarOrdenes = (id: string) => leer<Orden[]>(claveOrdenes(id), () => (id === 'demo' ? ordenesDemo() : []));
let ordenes = cargarOrdenes(actual.id);
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(f => f());

function publicar(nuevas: Orden[]) {
  ordenes = nuevas;
  try {
    localStorage.setItem(claveOrdenes(actual.id), JSON.stringify(ordenes));
  } catch {
    // Sin espacio: se suelta lo más pesado para no perder las órdenes.
    localStorage.setItem(claveOrdenes(actual.id), JSON.stringify(ordenes.map(o => ({ ...o, imagenIA: undefined }))));
  }
  avisar();
}

const suscribir = (f: () => void) => { oyentes.add(f); return () => oyentes.delete(f); };
export const useOrdenes = () => useSyncExternalStore(suscribir, () => ordenes);
export const useOrden = (id: string) => useOrdenes().find(o => o.id === id);
export const useEmpresa = () => useSyncExternalStore(suscribir, () => actual);
export const useEmpresas = () => useSyncExternalStore(suscribir, () => empresas);

export function guardarOrden(o: Orden) {
  publicar(ordenes.some(x => x.id === o.id) ? ordenes.map(x => (x.id === o.id ? o : x)) : [o, ...ordenes]);
}
export function actualizar(id: string, cambio: (o: Orden) => Orden) {
  publicar(ordenes.map(o => (o.id === id ? cambio(o) : o)));
}
export const siguienteNumero = () => Math.max(1000, ...ordenes.map(o => o.numero)) + 1;
export const restablecerDemo = () => publicar(actual.id === 'demo' ? ordenesDemo() : []);
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
  document.documentElement.style.setProperty('--acento', e.acento);
  document.documentElement.style.setProperty('--sobre-acento', textoSobre(e.acento));
}
function guardarEmpresas(lista: Empresa[]) {
  empresas = lista;
  actual = lista.find(e => e.id === actual.id) ?? lista[0];
  localStorage.setItem(CLAVE_EMPRESAS, JSON.stringify(lista));
  aplicarMarca(actual);
  avisar();
}
export const editarEmpresa = (c: Partial<Empresa>) => guardarEmpresas(empresas.map(e => (e.id === actual.id ? { ...e, ...c } : e)));
export function cambiarEmpresa(id: string) {
  actual = empresas.find(e => e.id === id) ?? actual;
  localStorage.setItem(CLAVE_ACTUAL, actual.id);
  ordenes = cargarOrdenes(actual.id);
  aplicarMarca(actual);
  avisar();
}
export function crearEmpresa(nombre: string) {
  const e: Empresa = { id: uid(), nombre: nombre.trim(), acento: ACENTO, whatsapp: '' };
  guardarEmpresas([...empresas, e]);
  cambiarEmpresa(e.id);
}

/* Sesión de demostración: la validación real corresponde a un servidor. */
export function iniciarSesion(usuario: string, clave: string): Usuario | null {
  const u = USUARIOS.find(x => x.usuario === usuario.trim().toLowerCase() && x.clave === clave);
  if (u) sessionStorage.setItem(SESION, u.id);
  return u ?? null;
}
export const sesion = () => USUARIOS.find(u => u.id === sessionStorage.getItem(SESION)) ?? null;
export const cerrarSesion = () => sessionStorage.removeItem(SESION);

export function uid() { return Math.random().toString(36).slice(2, 10); }
export function codigoCliente() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => a[b % a.length]).join('');
}
