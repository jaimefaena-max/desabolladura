import { estadoFactura } from './cobranza';
import { estadoRepuesto } from './repuestos';
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
  let estimada = sumarHabiles(o.creada, diasTrabajo(o.items));
  // Un repuesto que llega después corre la entrega: desde su llegada (o desde hoy, si ya se atrasó)
  // más los días de trabajo que aún faltan.
  const hoy = fechaLocal(), faltan = diasTrabajo(o.items.filter(i => i.estado !== 'listo'));
  for (const r of repuestos) {
    if (r.estado !== 'pedido' || !r.prometido || o.entregadaEl) continue;
    const llega = r.prometido < hoy ? hoy : r.prometido, porRepuesto = sumarHabiles(llega, faltan);
    if (porRepuesto > estimada) estimada = porRepuesto;
  }
  return { ...o, repuestos, entrega: !o.entrega || estimada > o.entrega ? estimada : o.entrega };
}

export const conEvento = (o: Orden, texto: string): Orden => ({ ...o, historial: [{ fecha: new Date().toISOString(), texto }, ...o.historial] });

export interface Alerta { id: string; ordenId: string; texto: string; urgente: boolean; }

export function alertas(ordenes: Orden[], hoy = fechaLocal()): Alerta[] {
  const out: Alerta[] = [];
  for (const o of ordenes) {
    const et = etapaDe(o), v = `${o.vehiculo.marca} ${o.vehiculo.modelo}`, add = (k: string, texto: string, urgente = false) => out.push({ id: `${o.id}-${k}`, ordenId: o.id, texto: `${v}: ${texto}`, urgente });
    if (et !== 'entrega' && et !== 'entregado' && o.entrega < hoy) add('atraso', 'pasó su fecha de entrega', true);
    const f = o.factura, cia = o.pagador.aseguradora;
    if (f && !f.pagadaEl) {
      // Cobranza a la compañía: plazo legal de 30 días (Ley 19.983).
      const e = estadoFactura(f, hoy);
      if (e.estado === 'vencida') add('factura', `factura N.º ${f.numero} vencida hace ${-e.dias} días (${cia})`, true);
      else if (e.estado === 'por_vencer') add('factura', `factura N.º ${f.numero} ${e.dias === 0 ? 'vence hoy' : `vence en ${e.dias} días`} (${cia})`);
    }
    if (et === 'entregado' && !o.cobrada && o.pagador.tipo === 'aseguradora' && !f) add('cobro', `entregado sin facturar a ${cia}`, true);
    else if (et === 'entregado' && !o.cobrada && o.pagador.tipo === 'particular') add('cobro', 'entregado sin cobrar', true);
    if (et === 'entregado' && o.pagador.tipo === 'aseguradora' && totales(o).deducible > 0 && !o.deducibleCobradoEl) add('deducible', 'deducible por cobrar al cliente', true);
    if (o.cobrada) continue;
    const t = totales(o);
    if (t.faltan) add('monto', `${t.faltan} ${t.faltan === 1 ? 'trabajo' : 'trabajos'} sin monto`);
    if (o.aprobacion === 'enviada') add('aprobar', 'esperando aprobación');
    if (o.aprobacion === 'pendiente' && o.items.some(i => i.adicional)) add('adicional', 'trabajo adicional por aprobar', true);
    const pedir = o.repuestos.filter(r => r.estado === 'por_pedir');
    if (pedir.length) add('repuesto', `pedir ${pedir.map(r => r.nombre.toLowerCase()).join(', ')}`);
    for (const r of o.repuestos) {
      const e = estadoRepuesto(r, hoy);
      if (e.estado === 'atrasado') add(`rep-${r.id}`, `${r.nombre.toLowerCase()} atrasado ${e.atraso} ${e.atraso === 1 ? 'día' : 'días'}${r.proveedor ? ` (${r.proveedor})` : ''}`, true);
      else if (e.estado === 'llega_hoy') add(`rep-${r.id}`, `hoy llega ${r.nombre.toLowerCase()}${r.proveedor ? ` (${r.proveedor})` : ''}`);
    }
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
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Un rango de reportes: meses 'AAAA-MM', ambos incluidos. */
export type Periodo = { desde: string; hasta: string };
export type OpcionMes = { clave: string; corta: string; larga: string };

const dos = (n: number) => String(n).padStart(2, '0');
const mesDe = (fecha?: string | null) => (fecha ? fecha.slice(0, 7) : null);

/** ¿La fecha cae dentro del rango? Las órdenes sin entregar nunca entran: los ingresos se cuentan al entregar. */
export const enPeriodo = (fecha: string | null | undefined, p: Periodo) => {
  const m = mesDe(fecha);
  return !!m && m >= p.desde && m <= p.hasta;
};

/** Los meses del rango, en orden. `tope` evita barras de un píxel si alguien pide diez años. */
export function mesesDe(p: Periodo, tope = 36): (OpcionMes & { valor?: number })[] {
  const [ay, am] = p.desde.split('-').map(Number);
  const [by, bm] = p.hasta.split('-').map(Number);
  const n = Math.min(Math.max((by - ay) * 12 + (bm - am) + 1, 1), tope);
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(ay, am - 1 + k, 1);
    return {
      clave: `${d.getFullYear()}-${dos(d.getMonth() + 1)}`,
      corta: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      larga: `${MESES_LARGOS[d.getMonth()]} ${d.getFullYear()}`,
    };
  });
}

/** El rango por defecto: los últimos 6 meses hasta hoy, igual que la vista histórica de siempre. */
export function ultimosMeses(n: number, hoy = new Date()): Periodo {
  const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const ini = new Date(hoy.getFullYear(), hoy.getMonth() - (n - 1), 1);
  return { desde: `${ini.getFullYear()}-${dos(ini.getMonth() + 1)}`, hasta: `${fin.getFullYear()}-${dos(fin.getMonth() + 1)}` };
}

/** Los meses que vale la pena ofrecer: desde la orden más vieja guardada hasta el mes en curso. */
export function mesesElegibles(ordenes: Orden[], hoy = new Date()): OpcionMes[] {
  const claves = ordenes.flatMap(o => [mesDe(o.creada), mesDe(o.entregadaEl)]).filter((m): m is string => !!m).sort();
  const actual = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}`;
  const desde = claves[0] && claves[0] < actual ? claves[0] : actual;
  const hasta = claves.length && claves[claves.length - 1] > actual ? claves[claves.length - 1] : actual;
  return mesesDe({ desde, hasta });
}

export function metricas(ordenes: Orden[], hoy = new Date(), periodo?: Periodo) {
  const dentro = (o: Orden) => !periodo || enPeriodo(o.entregadaEl, periodo);
  const entregadas = ordenes.filter(o => o.entregadaEl && dentro(o));
  const cobradas = ordenes.filter(o => o.cobrada && dentro(o));
  const ingresos = cobradas.reduce((a, o) => a + totales(o).total, 0);
  const dias = entregadas.map(o => Math.round((Date.parse(o.entregadaEl!) - Date.parse(o.creada)) / 864e5));
  const seguro = cobradas.filter(o => o.pagador.tipo === 'aseguradora').reduce((a, o) => a + totales(o).total, 0);
  const meses = (periodo ? mesesDe(periodo) : mesesDe(ultimosMeses(6, hoy))).map(({ clave, corta }) => ({
    mes: corta,
    valor: cobradas.filter(o => o.entregadaEl?.startsWith(clave)).reduce((a, o) => a + totales(o).total, 0),
  }));
  // Los autos que siguen en taller son carga de hoy: cuentan solo si el rango llega hasta el mes en curso.
  const enCurso = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}`;
  const incluyeHoy = !periodo || periodo.hasta >= enCurso;
  const tipos = new Map<string, number>();
  for (const o of ordenes) if (o.entregadaEl ? dentro(o) : incluyeHoy) for (const i of o.items) if (i.trabajo !== 'general') tipos.set(i.trabajo, (tipos.get(i.trabajo) ?? 0) + 1);
  return {
    ingresos, ticket: cobradas.length ? Math.round(ingresos / cobradas.length) : 0,
    ciclo: dias.length ? Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10 : 0,
    pctSeguro: ingresos ? Math.round((seguro / ingresos) * 100) : 0,
    enTaller: ordenes.filter(o => !o.entregadaEl).length, entregadas: entregadas.length, cobradas: cobradas.length, abierto: incluyeHoy, meses,
    tipos: [...tipos.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/**
 * Tiempos de reparación de vehículos asegurados que publica la CMF (Circular 2236), 1.er semestre 2026:
 * 51,6 días desde la denuncia hasta el retiro; 29,8 de ellos antes de entrar al taller.
 * Dentro del taller quedan ≈ 21,8 días: es una resta propia (no un dato publicado), y así se rotula.
 */
export const CMF_REPARACION = { total: 51.6, antesDelTaller: 29.8, enTaller: 21.8, periodo: '1.er semestre de 2026' };

/** Días corridos que el vehículo lleva (o llevó) en el taller. */
export function diasEnTaller(o: Pick<Orden, 'creada' | 'entregadaEl'>, hoy = fechaLocal()) {
  const fin = o.entregadaEl ?? hoy;
  const d = (Date.parse(`${fin}T12:00:00`) - Date.parse(`${o.creada}T12:00:00`)) / 864e5;
  return Math.max(0, Math.round(d));
}

/** Semáforo frente al promedio nacional: verde bajo el 70 %, amarillo hasta el promedio, rojo sobre él. */
export function semaforoPlazo(dias: number) {
  const r = dias / CMF_REPARACION.enTaller;
  return r < .7 ? 'ok' : r <= 1 ? 'atento' : 'atrasado';
}
