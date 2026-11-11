import type { Carroceria, EstadoPieza, Item, Orden, PiezaId, Trabajo } from './types';

export const PIEZAS: { id: PiezaId; nombre: string; zona: 'Frente' | 'Lado derecho' | 'Lado izquierdo' | 'Atrás' | 'Arriba' }[] = [
  { id: 'capot', nombre: 'Capot', zona: 'Frente' },
  { id: 'parachoque_del', nombre: 'Parachoque delantero', zona: 'Frente' },
  { id: 'tapabarro_del_der', nombre: 'Tapabarro delantero derecho', zona: 'Lado derecho' },
  { id: 'puerta_del_der', nombre: 'Puerta delantera derecha', zona: 'Lado derecho' },
  { id: 'puerta_tras_der', nombre: 'Puerta trasera derecha', zona: 'Lado derecho' },
  { id: 'costado_tras_der', nombre: 'Costado trasero derecho', zona: 'Lado derecho' },
  { id: 'espejo_der', nombre: 'Espejo derecho', zona: 'Lado derecho' },
  { id: 'tapabarro_del_izq', nombre: 'Tapabarro delantero izquierdo', zona: 'Lado izquierdo' },
  { id: 'puerta_del_izq', nombre: 'Puerta delantera izquierda', zona: 'Lado izquierdo' },
  { id: 'puerta_tras_izq', nombre: 'Puerta trasera izquierda', zona: 'Lado izquierdo' },
  { id: 'costado_tras_izq', nombre: 'Costado trasero izquierdo', zona: 'Lado izquierdo' },
  { id: 'espejo_izq', nombre: 'Espejo izquierdo', zona: 'Lado izquierdo' },
  { id: 'techo', nombre: 'Techo', zona: 'Arriba' },
  { id: 'maletera', nombre: 'Maletera', zona: 'Atrás' },
  { id: 'parachoque_tras', nombre: 'Parachoque trasero', zona: 'Atrás' },
];

export function nombrePieza(id: PiezaId, carroceria?: Carroceria) {
  if (id === 'maletera' && carroceria === 'pickup') return 'Pick-up y tapa trasera';
  if (id === 'maletera' && (carroceria === 'suv' || carroceria === 'hatchback')) return 'Portón trasero';
  return PIEZAS.find(p => p.id === id)?.nombre ?? id;
}

export const TRABAJOS: { id: Trabajo; nombre: string; ayuda: string }[] = [
  { id: 'desabolladura', nombre: 'Desabolladura', ayuda: 'Sacar abollones y dejar la lata pareja' },
  { id: 'pintura', nombre: 'Pintura', ayuda: 'Preparar, pintar y barnizar la pieza' },
  { id: 'cambio', nombre: 'Cambio de pieza', ayuda: 'Desmontar y montar una pieza nueva' },
  { id: 'plastico', nombre: 'Reparar plástico', ayuda: 'Soldar o reforzar pieza plástica' },
  { id: 'pulido', nombre: 'Pulido', ayuda: 'Sacar rayas superficiales y dar brillo' },
];

export function tituloItem(i: Item, carroceria?: Carroceria) {
  if (i.trabajo === 'general') return i.titulo ?? 'Tarea general';
  const t = TRABAJOS.find(x => x.id === i.trabajo)?.nombre ?? i.trabajo;
  return i.pieza ? `${t}: ${nombrePieza(i.pieza, carroceria).toLowerCase()}` : t;
}

/** Porcentaje real de avance: una tarea en proceso cuenta la mitad. */
export function progreso(items: Item[]) {
  if (!items.length) return 0;
  const puntos = items.reduce((a, i) => a + (i.estado === 'listo' ? 1 : i.estado === 'proceso' ? .5 : 0), 0);
  return Math.round((puntos / items.length) * 100);
}

/**
 * Estado visible de cada pieza en el 3D.
 * Pieza con pintura pendiente nunca se muestra terminada aunque ya esté desabollada:
 * queda en aparejo gris hasta que la pintura esté lista.
 */
export function estadosPiezas(items: Item[]) {
  const out: Partial<Record<PiezaId, EstadoPieza>> = {};
  const grupos = new Map<PiezaId, Item[]>();
  for (const i of items) if (i.pieza) grupos.set(i.pieza, [...(grupos.get(i.pieza) ?? []), i]);
  grupos.forEach((lista, id) => {
    if (lista.every(i => i.estado === 'listo')) out[id] = 'listo';
    else if (lista.some(i => i.estado !== 'pendiente')) out[id] = 'proceso';
    else out[id] = 'pendiente';
  });
  return out;
}

export const itemsCobrables = (o: Orden) => o.items.filter(i => i.trabajo !== 'general');

/**
 * Presupuesto vigente. Un adicional que la compañía todavía no autoriza no se suma al total ni se
 * factura: si se contara, el cliente vería cobrado un trabajo que aún puede rechazar.
 */
export const itemsPresupuesto = (o: Orden) => o.items.filter(i => i.trabajo !== 'general' && !i.adicional);

export function totales(o: Orden) {
  const cobrables = itemsPresupuesto(o);
  const neto = cobrables.reduce((a, i) => a + (i.monto ?? 0), 0);
  const iva = Math.round(neto * .19);
  const total = neto + iva;
  const deducible = o.pagador.tipo === 'aseguradora' ? Math.min(o.pagador.deducible ?? 0, total) : 0;
  return { neto, iva, total, deducible, aseguradora: o.pagador.tipo === 'aseguradora' ? total - deducible : 0, faltan: cobrables.filter(i => i.monto === null).length };
}

/** Fecha local a n días: toISOString se corre un día después de las 21:00 en Chile. */
export function fechaLocal(n = 0) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const clp = (n: number) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('es-CL');
export const fecha = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
