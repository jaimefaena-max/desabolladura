import { enlaceSeguimiento } from './seguimiento';
import { fecha, fechaLocal } from './piezas';
import type { Empresa, Orden, Repuesto } from './types';

/**
 * Control de repuestos: quién lo trae, qué día lo prometió y cuánto se atrasó.
 * Es la causa más común de autos detenidos en el taller (la CMF la cita entre los motivos de demora).
 */

export const PROVEEDORES_SUGERIDOS = ['Concesionario de la marca', 'Repuestos Demo Norte', 'Autopartes Demo Centro', 'Desarmaduría'];

const dia = (f: string) => Date.parse(`${f}T12:00:00`);
export const diasEntre = (a: string, b: string) => Math.round((dia(b) - dia(a)) / 864e5);

export type EstadoEntrega = 'por_pedir' | 'en_camino' | 'llega_hoy' | 'atrasado' | 'a_tiempo' | 'tarde' | 'recibido';

/** Situación de un repuesto hoy. `atraso`: días después de lo prometido (si ya llegó, con cuánto atraso llegó). */
export function estadoRepuesto(r: Repuesto, hoy = fechaLocal()) {
  if (r.estado === 'por_pedir') return { estado: 'por_pedir' as EstadoEntrega, atraso: 0, faltan: 0 };
  if (r.estado === 'recibido') {
    const promesa = r.prometidoInicial ?? r.prometido;
    if (!promesa || !r.recibidoEl) return { estado: 'recibido' as EstadoEntrega, atraso: 0, faltan: 0 };
    const atraso = Math.max(0, diasEntre(promesa, r.recibidoEl));
    return { estado: (atraso ? 'tarde' : 'a_tiempo') as EstadoEntrega, atraso, faltan: 0 };
  }
  if (!r.prometido) return { estado: 'en_camino' as EstadoEntrega, atraso: 0, faltan: 0 };
  const faltan = diasEntre(hoy, r.prometido);
  return { estado: (faltan < 0 ? 'atrasado' : faltan === 0 ? 'llega_hoy' : 'en_camino') as EstadoEntrega, atraso: Math.max(0, -faltan), faltan };
}

export function textoEstado(r: Repuesto, hoy = fechaLocal()) {
  const e = estadoRepuesto(r, hoy);
  switch (e.estado) {
    case 'por_pedir': return 'Por pedir';
    case 'llega_hoy': return 'Llega hoy';
    case 'atrasado': return `Atrasado ${e.atraso} ${e.atraso === 1 ? 'día' : 'días'}`;
    case 'en_camino': return r.prometido ? `Llega ${fecha(r.prometido)}` : 'Pedido, sin fecha';
    case 'a_tiempo': return `Llegó a tiempo · ${fecha(r.recibidoEl!)}`;
    case 'tarde': return `Llegó ${e.atraso} ${e.atraso === 1 ? 'día' : 'días'} tarde`;
    default: return 'Recibido';
  }
}

/** Un repuesto frena el auto si aún no llega y su trabajo no está terminado. */
const frena = (o: Orden, r: Repuesto) => r.estado !== 'recibido' && o.items.some(i => i.id === r.itemId && i.estado !== 'listo');

/** Todo lo de repuestos en una mirada: qué pedir, qué viene, qué se atrasó y qué autos están parados. */
export function resumenRepuestos(ordenes: Orden[], hoy = fechaLocal()) {
  const activas = ordenes.filter(o => !o.entregadaEl);
  const filas = activas.flatMap(o => o.repuestos.map(r => ({ o, r, e: estadoRepuesto(r, hoy) })));
  const orden: Record<EstadoEntrega, number> = { atrasado: 0, llega_hoy: 1, por_pedir: 2, en_camino: 3, tarde: 4, a_tiempo: 5, recibido: 6 };
  filas.sort((a, b) => orden[a.e.estado] - orden[b.e.estado] || b.e.atraso - a.e.atraso || (a.r.prometido ?? '').localeCompare(b.r.prometido ?? ''));

  const detenidos = activas.map(o => {
    const pendientes = o.repuestos.filter(r => frena(o, r));
    if (!pendientes.length) return null;
    const desde = pendientes.map(r => r.pedidoEl ?? o.creada).sort()[0];
    const peor = Math.max(0, ...pendientes.map(r => estadoRepuesto(r, hoy).atraso));
    return { o, pendientes, dias: Math.max(0, diasEntre(desde, hoy)), atraso: peor };
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.atraso - a.atraso || b.dias - a.dias);

  // Cumplimiento de cada proveedor con todo el historial (también autos ya entregados).
  const todos = ordenes.flatMap(o => o.repuestos).filter(r => r.proveedor);
  const proveedores = [...new Set(todos.map(r => r.proveedor!))].map(nombre => {
    const suyos = todos.filter(r => r.proveedor === nombre);
    const llegados = suyos.filter(r => r.estado === 'recibido' && (r.prometidoInicial ?? r.prometido) && r.recibidoEl);
    const atraso = (r: Repuesto) => Math.max(0, diasEntre((r.prometidoInicial ?? r.prometido)!, r.recibidoEl!));
    const aTiempo = llegados.filter(r => atraso(r) === 0).length;
    const atrasados = suyos.filter(r => estadoRepuesto(r, hoy).estado === 'atrasado').length;
    return {
      nombre, pedidos: suyos.length, enCamino: suyos.filter(r => r.estado === 'pedido').length, atrasados,
      cumplimiento: llegados.length ? Math.round((aTiempo / llegados.length) * 100) : null,
      atrasoPromedio: llegados.length ? Math.round((llegados.reduce((a, r) => a + atraso(r), 0) / llegados.length) * 10) / 10 : null,
    };
  }).sort((a, b) => b.pedidos - a.pedidos);

  const cuenta = (...e: EstadoEntrega[]) => filas.filter(x => e.includes(x.e.estado)).length;
  return {
    filas, detenidos, proveedores,
    porPedir: cuenta('por_pedir'), enCamino: cuenta('en_camino', 'llega_hoy'), atrasados: cuenta('atrasado'), llegaHoy: cuenta('llega_hoy'),
  };
}

/**
 * Aviso honesto al cliente. Con fecha nueva: cuándo llega y la nueva entrega. Atrasado sin fecha
 * nueva: no se inventa una; se dice que se confirmará.
 */
export function mensajeRepuesto(o: Orden, r: Repuesto, empresa: Pick<Empresa, 'nombre'>, hoy = fechaLocal()) {
  const nombre = /^cliente\b/i.test(o.cliente.nombre) ? '' : o.cliente.nombre.trim().split(/\s+/)[0];
  const v = `${o.vehiculo.marca} ${o.vehiculo.modelo}`;
  return [
    `Hola${nombre ? ` ${nombre}` : ''}, le escribimos de ${empresa.nombre}.`,
    `Le avisamos que el repuesto *${r.nombre.toLowerCase()}* de su ${v} viene con atraso del proveedor.`,
    r.prometido && r.prometido >= hoy
      ? `Ahora llega el ${fecha(r.prometido)} y la nueva fecha estimada de entrega es el *${fecha(o.entrega)}*.`
      : `${r.prometido ? `Debía llegar el ${fecha(r.prometido)} y aún no lo recibimos. ` : ''}Le confirmaremos la nueva fecha de entrega apenas el proveedor nos dé la suya.`,
    'Mientras tanto seguimos avanzando con los demás trabajos.',
    `Vea el avance aquí: ${enlaceSeguimiento(o, empresa.nombre)}`,
  ].join('\n');
}
