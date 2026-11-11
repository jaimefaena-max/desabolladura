import { conEvento, sincronizar } from './automatizacion';
import { clp, itemsCobrables } from './piezas';
import type { Orden } from './types';

/**
 * Adicionales: lo que aparece al desarmar y la compañía autoriza aparte.
 *
 * El ciclo completo es: el maestro los agrega (quedan «por autorizar») → el taller envía la
 * solicitud con foto de cada daño → la compañía responde ítem por ítem. Lo autorizado deja de ser
 * adicional y pasa a ser trabajo del presupuesto; lo rechazado se retira de la orden y queda en el
 * historial con su monto, para que nadie lo cobre ni lo haga por error.
 */

export const adicionalesPendientes = (o: Orden) => itemsCobrables(o).filter(i => i.adicional);

export const netoAdicionales = (o: Orden) => adicionalesPendientes(o).reduce((a, i) => a + (i.monto ?? 0), 0);

const nombre = (texto: string) => texto.toLowerCase();

export type Decision = { orden: Orden; texto: string };

/** Autorizar los adicionales elegidos: se suman al trabajo existente y la orden vuelve a «aprobada». */
export function autorizarAdicionales(o: Orden, ids: string[] | 'todos', titulo: (i: Orden['items'][number]) => string): Decision | null {
  const elegidos = adicionalesPendientes(o).filter(i => ids === 'todos' || ids.includes(i.id));
  if (!elegidos.length) return null;
  const items = o.items.map(i => (elegidos.some(e => e.id === i.id) ? { ...i, adicional: false } : i));
  const quedan = items.filter(i => i.trabajo !== 'general' && i.adicional).length;
  const monto = elegidos.reduce((a, i) => a + (i.monto ?? 0), 0);
  const detalle = elegidos.map(i => `${nombre(titulo(i))} (${clp(i.monto ?? 0)})`).join(', ');
  const texto = elegidos.length === 1
    ? `Adicional autorizado: ${detalle}`
    : `${elegidos.length} adicionales autorizados por ${clp(monto)} neto: ${detalle}`;
  // Trabajo nuevo sobre una orden ya pagada: vuelve a quedar plata por cobrar.
  const orden = conEvento(
    { ...o, items, aprobacion: quedan ? o.aprobacion : 'aprobada', cobrada: o.cobrada ? false : o.cobrada },
    quedan ? `${texto}. Quedan ${quedan} por autorizar` : texto,
  );
  return { orden, texto };
}

/** Rechazar: el trabajo no se hace ni se cobra; sale de la orden y queda registrado con su monto. */
export function rechazarAdicionales(o: Orden, ids: string[], titulo: (i: Orden['items'][number]) => string): Decision | null {
  const fuera = adicionalesPendientes(o).filter(i => ids.includes(i.id));
  if (!fuera.length) return null;
  const items = o.items.filter(i => !fuera.some(f => f.id === i.id));
  const quedan = items.filter(i => i.trabajo !== 'general' && i.adicional).length;
  const detalle = fuera.map(i => `${nombre(titulo(i))} (${clp(i.monto ?? 0)})`).join(', ');
  const texto = fuera.length === 1
    ? `Adicional rechazado por la compañía: ${detalle}`
    : `${fuera.length} adicionales rechazados por la compañía: ${detalle}`;
  return {
    orden: conEvento(sincronizar({ ...o, items, aprobacion: quedan ? o.aprobacion : 'aprobada' }), quedan ? `${texto}. Quedan ${quedan} por autorizar` : texto),
    texto,
  };
}
