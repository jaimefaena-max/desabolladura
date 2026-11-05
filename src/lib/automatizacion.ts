import { fechaLocal, nombrePieza, totales } from './piezas';
import type { Empresa, EtapaId, Item, Orden, Repuesto, Severidad } from './types';

/** Reglas que mueven el taller solo: nadie arrastra tarjetas ni recuerda avisos. */

export const ETAPAS: { id: EtapaId; nombre: string; cliente: string }[] = [
  { id: 'aprobar', nombre: 'Por aprobar', cliente: 'Esperando aprobación del presupuesto' },
  { id: 'repuestos', nombre: 'Esperando repuestos', cliente: 'Esperando repuestos' },
  { id: 'desabolladura', nombre: 'Desabolladura', cliente: 'En desabolladura' },
  { id: 'pintura', nombre: 'Pintura', cliente: 'En pintura' },
  { id: 'armado', nombre: 'Armado y pulido', cliente: 'En armado y pulido' },
  { id: 'calidad', nombre: 'Control de calidad', cliente: 'En control de calidad' },
  { id: 'entrega', nombre: 'Listo para entregar', cliente: 'Listo para retirar' },
  { id: 'entregado', nombre: 'Entregado', cliente: 'Entregado' },
];

export const nombreEtapa = (id: EtapaId) => ETAPAS.find(e => e.id === id)!.nombre;

export function etapaDe(o: Orden): EtapaId {
  if (o.entregadaEl) return 'entregado';
  const obra = o.items.filter(i => i.trabajo !== 'general');
  const empezo = obra.some(i => i.estado !== 'pendiente');
  const pendiente = (...t: Item['trabajo'][]) => obra.some(i => t.includes(i.trabajo) && i.estado !== 'listo');
  if (o.aprobacion !== 'aprobada' && !empezo) return 'aprobar';
  if (obra.every(i => i.estado === 'listo')) {
    return o.items.find(i => i.id === 'g-calidad')?.estado === 'listo' ? 'entrega' : 'calidad';
  }
  if (!empezo && o.repuestos.some(r => r.estado !== 'recibido')) return 'repuestos';
  if (pendiente('desabolladura', 'plastico', 'cambio')) return 'desabolladura';
  if (pendiente('pintura')) return 'pintura';
  return 'armado';
}

const DIAS: Record<Item['trabajo'], Record<Severidad, number>> = {
  desabolladura: { leve: .5, medio: 1, fuerte: 2 },
  pintura: { leve: 1, medio: 1, fuerte: 1.5 },
  cambio: { leve: .5, medio: .5, fuerte: .5 },
  plastico: { leve: .5, medio: .5, fuerte: 1 },
  pulido: { leve: .25, medio: .25, fuerte: .5 },
  general: { leve: 0, medio: 0, fuerte: 0 },
};

/** Días hábiles de taller, más uno de control y lavado. */
export function diasTrabajo(items: Item[]) {
  return Math.ceil(items.reduce((a, i) => a + DIAS[i.trabajo][i.severidad ?? 'medio'], 0)) + 1;
}

export function sumarHabiles(desde: string, dias: number) {
  const d = new Date(desde + 'T12:00:00');
  for (let n = dias; n > 0;) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n--;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Cada cambio de pieza genera su repuesto, y la fecha prometida nunca se adelanta sola. */
export function sincronizar(o: Orden): Orden {
  const vivos = new Set(o.items.map(i => i.id));
  const repuestos: Repuesto[] = o.repuestos.filter(r => vivos.has(r.itemId));
  for (const i of o.items) {
    if (i.trabajo === 'cambio' && i.pieza && !repuestos.some(r => r.itemId === i.id)) {
      repuestos.push({ id: `r-${i.id}`, itemId: i.id, nombre: nombrePieza(i.pieza, o.vehiculo.carroceria), estado: 'por_pedir' });
    }
  }
  const estimada = sumarHabiles(o.creada, diasTrabajo(o.items));
  return { ...o, repuestos, entrega: !o.entrega || estimada > o.entrega ? estimada : o.entrega };
}

export const conEvento = (o: Orden, texto: string): Orden => ({ ...o, historial: [{ fecha: new Date().toISOString(), texto }, ...o.historial] });

export interface Alerta { id: string; ordenId: string; texto: string; urgente: boolean; }

export function alertas(ordenes: Orden[], hoy = fechaLocal()): Alerta[] {
  const out: Alerta[] = [];
  for (const o of ordenes) {
    const et = etapaDe(o), v = `${o.vehiculo.marca} ${o.vehiculo.modelo}`, add = (k: string, texto: string, urgente = false) => out.push({ id: `${o.id}-${k}`, ordenId: o.id, texto: `${v}: ${texto}`, urgente });
    if (et !== 'entrega' && et !== 'entregado' && o.entrega < hoy) add('atraso', 'pasó su fecha de entrega', true);
    if (et === 'entregado' && !o.cobrada) add('cobro', 'entregado sin cobrar', true);
    if (o.cobrada) continue;
    const t = totales(o);
    if (t.faltan) add('monto', `${t.faltan} ${t.faltan === 1 ? 'trabajo' : 'trabajos'} sin monto`);
    if (o.aprobacion === 'enviada') add('aprobar', 'esperando aprobación');
    if (o.aprobacion === 'pendiente' && o.items.some(i => i.adicional)) add('adicional', 'trabajo adicional por aprobar', true);
    const pedir = o.repuestos.filter(r => r.estado === 'por_pedir');
    if (pedir.length) add('repuesto', `pedir ${pedir.map(r => r.nombre.toLowerCase()).join(', ')}`);
    if (et === 'entrega') add('entrega', 'listo, avisa al cliente');
  }
  return out.sort((a, b) => Number(b.urgente) - Number(a.urgente));
}

export function mensajeCliente(o: Orden, empresa: Pick<Empresa, 'nombre'>) {
  const v = `${o.vehiculo.marca} ${o.vehiculo.modelo}`, et = etapaDe(o);
  const saludo = `Hola, le escribimos de ${empresa.nombre}.`;
  const seguir = `Puede seguir el avance con el código ${o.codigo}.`;
  if (et === 'aprobar') return `${saludo} El presupuesto de su ${v} está listo para revisar. ${seguir}`;
  if (et === 'entrega') return `${saludo} Su ${v} está listo para retirar.`;
  if (et === 'entregado') return `${saludo} Gracias por confiar en nosotros. Si nota algo en su ${v}, escríbanos.`;
  const etapa = ETAPAS.find(e => e.id === et)!.cliente.toLowerCase();
  return `${saludo} Su ${v} está ${etapa}. ${seguir}`;
}

export function enlaceWhatsApp(telefono: string, texto: string) {
  return `https://wa.me/${telefono.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function metricas(ordenes: Orden[], hoy = new Date()) {
  const entregadas = ordenes.filter(o => o.entregadaEl);
  const cobradas = ordenes.filter(o => o.cobrada);
  const ingresos = cobradas.reduce((a, o) => a + totales(o).total, 0);
  const dias = entregadas.map(o => Math.round((Date.parse(o.entregadaEl!) - Date.parse(o.creada)) / 864e5));
  const seguro = cobradas.filter(o => o.pagador.tipo === 'aseguradora').reduce((a, o) => a + totales(o).total, 0);
  const meses = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - 5 + k, 1);
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { mes: MESES[d.getMonth()], valor: cobradas.filter(o => o.entregadaEl?.startsWith(clave)).reduce((a, o) => a + totales(o).total, 0) };
  });
  const tipos = new Map<string, number>();
  for (const o of ordenes) for (const i of o.items) if (i.trabajo !== 'general') tipos.set(i.trabajo, (tipos.get(i.trabajo) ?? 0) + 1);
  return {
    ingresos, ticket: cobradas.length ? Math.round(ingresos / cobradas.length) : 0,
    ciclo: dias.length ? Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10 : 0,
    pctSeguro: ingresos ? Math.round((seguro / ingresos) * 100) : 0,
    enTaller: ordenes.length - entregadas.length, meses,
    tipos: [...tipos.entries()].sort((a, b) => b[1] - a[1]),
  };
}
