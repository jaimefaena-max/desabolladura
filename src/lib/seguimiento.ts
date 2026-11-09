import { deflateSync, inflateSync, strFromU8, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { progreso, tituloItem } from './piezas';
import type { Empresa, Item, Orden } from './types';
import { vistasDe } from './vistas';

/**
 * Link de seguimiento para el cliente.
 *
 * La demo no tiene servidor: los datos viven en el navegador del taller. Para que el link abra en el
 * teléfono del cliente, lleva adentro una «instantánea» comprimida de la orden (vehículo, tareas,
 * notas y avance). No incluye nombre, RUT, teléfono ni montos, y va después del # (el navegador no la
 * envía a ningún servidor). Las fotos que saca el trabajador pesan demasiado para un link: se ven en
 * el equipo del taller; con servidor, se verían en cualquier teléfono.
 */

const b64url = (u: Uint8Array) => {
  let s = '';
  u.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const desdeB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

interface Paquete {
  t: string; n: number; c: string; e: string; a: Orden['aprobacion']; p: Orden['pagador']['tipo'];
  v: Orden['vehiculo']; vi: Record<string, string>; i: Item[];
}

export function empaquetar(o: Orden, taller: string): string {
  const v = { ...o.vehiculo, ficha: o.vehiculo.ficha && { ...o.vehiculo.ficha, fuentes: undefined, rasgos: '' } };
  // Solo las fotos públicas del modelo (las de la demo); las del taller viven en su IndexedDB.
  const vi = Object.fromEntries(Object.entries(vistasDe(o) ?? {}).filter(([, r]) => r && !/^(idb|data):/.test(r)));
  // Las fotos del taller no caben en el link: va solo su identificador, para avisar que existen.
  const i = o.items.map(({ sugerido: _s, monto: _m, ...x }) => ({ ...x, monto: null }));
  const datos: Paquete = { t: taller, n: o.numero, c: o.codigo, e: o.entrega, a: o.aprobacion, p: o.pagador.tipo, v, vi, i };
  return b64url(deflateSync(strToU8(JSON.stringify(datos)), { level: 9 }));
}

/** Reconstruye una orden de solo lectura desde el link. Devuelve null si el link está dañado. */
export function desempaquetar(s: string): (Orden & { taller: string }) | null {
  try {
    const d = JSON.parse(strFromU8(inflateSync(desdeB64url(s)))) as Paquete;
    return {
      taller: d.t, id: `link-${d.c}`, numero: d.n, codigo: d.c, creada: '', entrega: d.e, maestroId: '',
      vehiculo: d.v, cliente: { nombre: '', rut: '', telefono: '' }, pagador: { tipo: d.p },
      items: d.i, notas: '', aprobacion: d.a, repuestos: [], fotos: [], historial: [],
      recepcion: { km: null, combustible: '', observaciones: '' }, entregadaEl: null, cobrada: false,
      vistas: d.vi,
    };
  } catch {
    return null;
  }
}

export function enlaceSeguimiento(o: Orden, taller: string) {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/cliente/${o.codigo}/${empaquetar(o, taller)}`;
}

/** Mensaje de avance: qué se terminó, cuánto subió y el link para verlo. */
export function mensajeAvance(o: Orden, item: Item, antes: number, empresa: Pick<Empresa, 'nombre'>) {
  const v = `${o.vehiculo.marca} ${o.vehiculo.modelo}`;
  const ahora = progreso(o.items);
  // Solo el nombre de pila; un nombre genérico («Cliente Demo») no se usa para saludar.
  const nombre = /^cliente/i.test(o.cliente.nombre) ? '' : o.cliente.nombre.trim().split(/\s+/)[0];
  return [
    `Hola${nombre ? ` ${nombre}` : ''}, le escribimos de ${empresa.nombre}.`,
    `Su ${v} avanzó de ${antes}% a ${ahora}%: terminamos *${tituloItem(item, o.vehiculo.carroceria).toLowerCase()}*.`,
    item.nota ? `Nota del maestro: «${item.nota}».` : '',
    ahora === 100 ? 'Ya terminamos todos los trabajos. Le avisamos cuando esté listo para retirar.' : '',
    `Vea el avance, el auto en 3D y los detalles aquí: ${enlaceSeguimiento(o, empresa.nombre)}`,
  ].filter(Boolean).join('\n');
}
