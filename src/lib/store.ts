import { useSyncExternalStore } from 'react';
import { ordenesDemo, USUARIOS } from './seed';
import type { Orden, Usuario } from './types';

/** Base de datos de la demostración: vive en el navegador. La versión de producción la reemplaza por un servidor. */
const CLAVE = 'dp.ordenes.v1';
const SESION = 'dp.sesion';

function cargar(): Orden[] {
  try {
    const s = localStorage.getItem(CLAVE);
    if (s) return JSON.parse(s) as Orden[];
  } catch { /* datos corruptos: se vuelve a la demo */ }
  return ordenesDemo();
}

let ordenes = cargar();
const oyentes = new Set<() => void>();

function publicar(nuevas: Orden[]) {
  ordenes = nuevas;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(ordenes));
  } catch {
    // Sin espacio: se suelta lo más pesado para no perder las órdenes.
    localStorage.setItem(CLAVE, JSON.stringify(ordenes.map(o => ({ ...o, imagenIA: undefined }))));
  }
  oyentes.forEach(f => f());
}

const suscribir = (f: () => void) => { oyentes.add(f); return () => oyentes.delete(f); };
export const useOrdenes = () => useSyncExternalStore(suscribir, () => ordenes);
export const useOrden = (id: string) => useOrdenes().find(o => o.id === id);

export function guardarOrden(o: Orden) {
  publicar(ordenes.some(x => x.id === o.id) ? ordenes.map(x => (x.id === o.id ? o : x)) : [o, ...ordenes]);
}
export function actualizar(id: string, cambio: (o: Orden) => Orden) {
  publicar(ordenes.map(o => (o.id === id ? cambio(o) : o)));
}
export const siguienteNumero = () => Math.max(1040, ...ordenes.map(o => o.numero)) + 1;
export const restablecerDemo = () => publicar(ordenesDemo());

export function buscarPorAcceso(patente: string, codigo: string) {
  const p = patente.toUpperCase().replace(/[^A-Z0-9]/g, ''), c = codigo.trim().toUpperCase();
  return ordenes.find(o => o.vehiculo.patente === p && o.codigo === c);
}

export function iniciarSesion(id: string, pin: string): Usuario | null {
  const u = USUARIOS.find(x => x.id === id && x.pin === pin);
  if (u) { sessionStorage.setItem(SESION, u.id); }
  return u ?? null;
}
export const sesion = () => USUARIOS.find(u => u.id === sessionStorage.getItem(SESION)) ?? null;
export const cerrarSesion = () => sessionStorage.removeItem(SESION);

export const uid = () => Math.random().toString(36).slice(2, 10);
export function codigoCliente() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => a[b % a.length]).join('');
}
