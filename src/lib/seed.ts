import { conEvento, sincronizar } from './automatizacion';
import { cobradaSeguro } from './cobranza';
import { horasEstimadas } from './rentabilidad';
import { fechaLocal, totales } from './piezas';
import { sugerir } from './precios';
import autosDemo from './autosDemo.json';
import { slugAuto } from './fichaModelo';
import type { Aprobacion, Carroceria, EstadoItem, FichaModelo, Item, Orden, Pagador, PiezaId, Severidad, Trabajo, Usuario, Vehiculo, Vista } from './types';

/**
 * Datos ficticios hechos para no coincidir con nadie: los RUT tienen dígito verificador inválido
 * y las patentes llevan vocales, que las series chilenas no usan.
 */
export const USUARIOS: Usuario[] = [
  { id: 'admin', nombre: 'Administrador', rol: 'admin', cargo: 'Administración' },
  { id: 'trabajador', nombre: 'Trabajador', rol: 'maestro', cargo: 'Desabollador' },
];

export const ASEGURADORAS = ['Compañía Demo Norte', 'Compañía Demo Sur', 'Compañía Demo Centro', 'Otra'];

export function tareasGenerales(recepcionLista = true): Item[] {
  return [
    { id: 'g-recepcion', trabajo: 'general', pieza: null, titulo: 'Recepción y revisión del vehículo', estado: recepcionLista ? 'listo' : 'pendiente', monto: null },
    { id: 'g-calidad', trabajo: 'general', pieza: null, titulo: 'Control de calidad', estado: 'pendiente', monto: null },
    { id: 'g-entrega', trabajo: 'general', pieza: null, titulo: 'Lavado y entrega', estado: 'pendiente', monto: null },
  ];
}

const dias = fechaLocal;

function rutDemo(n: number) {
  let t = 0, m = 2;
  for (const c of String(n).split('').reverse()) { t += Number(c) * m; m = m === 7 ? 2 : m + 1; }
  const r = 11 - (t % 11), valido = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  return `${String(n).replace(/\B(?=(\d{3})+$)/g, '.')}-${valido === '1' ? '2' : '1'}`;
}

type Fila = [Trabajo, PiezaId, Severidad, EstadoItem, number?];

/** Notas del maestro en los trabajos ya terminados de la demo: el cliente las ve en «Últimos avances». */
const NOTA_DEMO: Partial<Record<Item['trabajo'], string>> = {
  desabolladura: 'Abolladura reparada, lata pareja y lista para pintura',
  pintura: 'Pintura igualada al color original y barnizada',
  cambio: 'Pieza nueva instalada y probada',
  plastico: 'Plástico soldado y reforzado por dentro',
  pulido: 'Rayas eliminadas, brillo recuperado',
};

function items(v: Vehiculo, filas: Fila[], cierre: EstadoItem = 'pendiente'): Item[] {
  const [recepcion, ...fin] = tareasGenerales();
  const trabajos = filas.map(([trabajo, pieza, severidad, estado, monto], i): Item => ({
    id: `i${i}`, trabajo, pieza, severidad, estado, monto: monto ?? null, sugerido: sugerir(trabajo, pieza, severidad, v),
    ...(estado === 'listo' ? { nota: NOTA_DEMO[trabajo], terminadoEl: new Date(Date.now() - (filas.length - i) * 5 * 3600e3).toISOString() } : {}),
  }));
  // Lo terminado trae las horas que anotó el maestro (en la demo, las típicas de cada trabajo).
  const conHoras = (i: Item): Item => (i.estado === 'listo' ? { ...i, horas: horasEstimadas(i) } : i);
  return [recepcion, ...trabajos, ...fin.map(i => ({ ...i, estado: cierre }))].map(conHoras);
}

/** Ficha y fotos generadas por scripts/generar-autos-demo.ts. Si un modelo no tiene, queda con el 3D genérico. */
const FOTOS = autosDemo as Record<string, { ficha: FichaModelo; vistas: Partial<Record<Vista, string>> } | undefined>;

const auto = (marca: string, modelo: string, anio: number, n: number, color: string, colorHex: string, carroceria: Carroceria): Vehiculo =>
  ({ marca, modelo, anio, patente: `DEMA${String(n).padStart(2, '0')}`, color, colorHex, carroceria, ficha: FOTOS[slugAuto({ marca, modelo, anio })]?.ficha });

interface Base {
  numero: number; codigo: string; v: Vehiculo; desde: number; pagador: Pagador; aprobacion: Aprobacion;
  filas: Fila[]; cierre?: EstadoItem; entregadaHace?: number; cobrada?: boolean; notas?: string;
  /** Factura a la compañía: hace cuántos días se emitió y, si ya pagó, hace cuántos días. */
  factura?: { numero: number; emitidaHace: number; pagadaHace?: number; deduciblePendiente?: boolean };
  /** Repuesto del cambio de pieza (fila `item`): proveedor y días relativos a hoy (negativo = en el futuro). */
  parte?: { item: string; proveedor: string; pedidoHace: number; prometidoHace: number; recibidoHace?: number; costo?: number };
  /** Horas reales distintas a las típicas (p. ej. un repintado). */
  horas?: Record<string, number>;
}

function orden(b: Base): Orden {
  const o = sincronizar({
    id: `ot-${b.numero}`, numero: b.numero, codigo: b.codigo, creada: dias(-b.desde), entrega: '', maestroId: 'trabajador', vehiculo: b.v,
    cliente: { nombre: `Cliente Demo ${b.numero}`, rut: rutDemo(10000000 + b.numero), telefono: '+56 9 0000 0000' },
    pagador: b.pagador, items: items(b.v, b.filas, b.cierre), notas: b.notas ?? '', aprobacion: b.aprobacion,
    repuestos: [], fotos: [], historial: [], recepcion: { km: 40000 + b.numero * 37, combustible: 'Medio', observaciones: '' },
    entregadaEl: b.entregadaHace === undefined ? null : dias(-b.entregadaHace), cobrada: b.cobrada ?? false,
    deducibleCobradoEl: b.factura && !b.factura.deduciblePendiente && b.entregadaHace !== undefined ? dias(-b.entregadaHace) : null,
    vistas: FOTOS[slugAuto(b.v)]?.vistas,
  });
  if (b.horas) o.items = o.items.map(i => (b.horas![i.id] !== undefined ? { ...i, horas: b.horas![i.id] } : i));
  if (b.parte) {
    const p = b.parte;
    o.repuestos = o.repuestos.map(r => (r.itemId !== p.item ? r : {
      ...r, estado: p.recibidoHace === undefined ? 'pedido' : 'recibido', proveedor: p.proveedor,
      pedidoEl: dias(-p.pedidoHace), prometido: dias(-p.prometidoHace), ...(p.recibidoHace !== undefined ? { recibidoEl: dias(-p.recibidoHace) } : {}),
      ...(p.costo !== undefined ? { costo: p.costo } : {}),
    }));
    Object.assign(o, sincronizar(o));
  }
  if (b.factura) {
    const f = b.factura, monto = totales(o).aseguradora;
    o.factura = { numero: f.numero, emitida: dias(-f.emitidaHace), monto, ...(f.pagadaHace !== undefined ? { pagadaEl: dias(-f.pagadaHace) } : {}) };
    o.cobrada = cobradaSeguro(o);
  }
  return conEvento(o, 'Vehículo ingresado al taller');
}

const seguro = (aseguradora: string, n: number, deducible: number): Pagador => ({ tipo: 'aseguradora', aseguradora, siniestro: `DEMO-${n}`, deducible });
const particular: Pagador = { tipo: 'particular' };

export function ordenesDemo(): Orden[] {
  return [
    orden({
      numero: 1041, codigo: 'F150RJ', v: auto('Ford', 'F-150', 2020, 11, 'Rojo', '#a3121c', 'pickup'), desde: 4, aprobacion: 'aprobada', pagador: seguro('Compañía Demo Norte', 1041, 150000),
      filas: [['desabolladura', 'puerta_tras_der', 'medio', 'listo'], ['pintura', 'puerta_tras_der', 'medio', 'proceso'], ['desabolladura', 'costado_tras_der', 'medio', 'proceso'], ['pintura', 'costado_tras_der', 'medio', 'pendiente'], ['cambio', 'espejo_der', 'medio', 'pendiente']],
      notas: 'Choque lateral en estacionamiento.',
      // El espejo viene del concesionario y prometió llegar hace 2 días: atrasado.
      parte: { item: 'i4', proveedor: 'Concesionario de la marca', pedidoHace: 4, prometidoHace: 2 },
    }),
    orden({
      numero: 1042, codigo: 'COR7X2', v: auto('Toyota', 'Corolla', 2020, 22, 'Gris azulado', '#717f8b', 'sedan'), desde: 6, aprobacion: 'aprobada', pagador: seguro('Compañía Demo Centro', 1042, 90000),
      filas: [['desabolladura', 'maletera', 'medio', 'listo', 240000], ['pintura', 'maletera', 'medio', 'listo', 230000], ['plastico', 'parachoque_tras', 'medio', 'listo', 120000], ['pintura', 'parachoque_tras', 'medio', 'proceso', 190000]],
      notas: 'Alcance por atrás.',
    }),
    orden({
      numero: 1043, codigo: 'TUC9M4', v: auto('Hyundai', 'Tucson', 2023, 33, 'Azul', '#1d3f72', 'suv'), desde: 1, aprobacion: 'pendiente', pagador: particular,
      filas: [['desabolladura', 'capot', 'leve', 'pendiente'], ['pintura', 'capot', 'medio', 'pendiente'], ['pintura', 'parachoque_del', 'medio', 'pendiente']],
    }),
    orden({
      numero: 1044, codigo: 'RIO4H7', v: auto('Kia', 'Rio', 2021, 55, 'Gris', '#4a4f55', 'hatchback'), desde: 2, aprobacion: 'enviada', pagador: particular,
      filas: [['desabolladura', 'tapabarro_del_izq', 'leve', 'pendiente', 130000], ['pintura', 'tapabarro_del_izq', 'medio', 'pendiente', 170000]],
    }),
    orden({
      numero: 1040, codigo: 'SWF3K8', v: auto('Suzuki', 'Swift', 2019, 44, 'Blanco', '#e4e6e8', 'hatchback'), desde: 9, aprobacion: 'aprobada', pagador: particular, cierre: 'listo',
      filas: [['desabolladura', 'puerta_del_izq', 'leve', 'listo', 115000], ['pintura', 'puerta_del_izq', 'medio', 'listo', 165000]],
    }),
    ...historico(),
  ];
}

function historico(): Orden[] {
  const filas = (a: number, b: number, cambio: boolean): Fila[] => [
    ['desabolladura', 'puerta_del_der', 'medio', 'listo', a], ['pintura', 'puerta_del_der', 'medio', 'listo', b],
    ...(cambio ? [['cambio', 'espejo_der', 'medio', 'listo', 65000] as Fila] : []),
  ];
  // Historial de repuestos para medir a cada proveedor: [proveedor, pedido, prometido, recibido] en días atrás.
  const partes: Record<number, [string, number, number, number, number]> = {
    1034: ['Repuestos Demo Norte', 149, 146, 146, 26000], 1036: ['Autopartes Demo Centro', 91, 89, 86, 24000], 1037: ['Concesionario de la marca', 60, 57, 57, 38000],
    1038: ['Autopartes Demo Centro', 32, 30, 26, 24000], 1039: ['Repuestos Demo Norte', 17, 15, 16, 26000], 1032: ['Repuestos Demo Norte', 51, 48, 47, 26000],
  };
  // Cobranza de ejemplo: pagadas a tiempo, una pagada con atraso, una al día, una por vencer y una vencida.
  type Fac = Base['factura'];
  const datos: [number, string, number, number, number, number, Pagador, Fac][] = [
    [1034, 'Sail', 150, 143, 310000, 240000, seguro('Compañía Demo Sur', 1034, 120000), { numero: 2201, emitidaHace: 143, pagadaHace: 118 }],
    [1035, 'Tracker', 118, 112, 280000, 260000, particular, undefined],
    [1036, 'Onix', 92, 86, 190000, 170000, seguro('Compañía Demo Norte', 1036, 90000), { numero: 2202, emitidaHace: 86, pagadaHace: 48 }],
    [1037, 'Colorado', 61, 53, 420000, 380000, seguro('Compañía Demo Centro', 1037, 150000), { numero: 2203, emitidaHace: 53, pagadaHace: 25 }],
    [1038, 'Captiva', 33, 27, 260000, 230000, particular, undefined],
    [1039, 'Sail', 18, 12, 240000, 210000, seguro('Compañía Demo Sur', 1039, 90000), { numero: 2206, emitidaHace: 12, deduciblePendiente: true }],
    [1032, 'Tracker', 52, 44, 350000, 290000, seguro('Compañía Demo Centro', 1032, 120000), { numero: 2204, emitidaHace: 44 }],
    [1033, 'Onix', 34, 27, 210000, 190000, seguro('Compañía Demo Norte', 1033, 90000), { numero: 2205, emitidaHace: 27 }],
  ];
  return datos.map(([numero, modelo, desde, hace, a, b, pagador, factura], k) => {
    const p = partes[numero];
    return orden({
    numero, codigo: `HIS${k}0${k}`, v: auto('Chevrolet', modelo, 2018 + k, 60 + k, 'Plateado', '#a9aeb4', modelo === 'Colorado' ? 'pickup' : modelo === 'Onix' ? 'hatchback' : modelo === 'Sail' ? 'sedan' : 'suv'),
    desde, aprobacion: 'aprobada', pagador, filas: filas(a, b, !!p), cierre: 'listo', entregadaHace: hace, cobrada: pagador.tipo === 'particular', factura,
    parte: p && { item: 'i2', proveedor: p[0], pedidoHace: p[1], prometidoHace: p[2], recibidoHace: p[3], costo: p[4] },
    // El Onix 1036 tuvo que repintarse: la pintura tomó casi el doble de horas y se comió la ganancia.
    horas: numero === 1036 ? { i1: 11 } : undefined,
  });
  });
}

/**
 * Las fotos de la demo se agregan con el tiempo: quien ya la visitó tiene sus órdenes guardadas
 * en el navegador sin ellas. Se completan al cargar, sin borrar lo que el visitante hizo.
 */
export function conFotosDemo(guardadas: Orden[]): Orden[] {
  const frescas = new Map(ordenesDemo().map(o => [o.id, o]));
  const actualizadas = guardadas.map(o => {
    const f = frescas.get(o.id);
    if (!f || f.vehiculo.patente !== o.vehiculo.patente) return o;
    let n = o;
    // Fotos y ficha del modelo (medidas para el 3D).
    if (f.vistas && !(o.vistas && JSON.stringify(o.vehiculo.ficha) === JSON.stringify(f.vehiculo.ficha))) n = { ...n, vistas: f.vistas, vehiculo: f.vehiculo };
    // Cobranza de ejemplo: las órdenes históricas con seguro reciben su factura si aún no la tienen.
    if (f.factura && !o.factura && o.entregadaEl) n = { ...n, factura: f.factura, deducibleCobradoEl: f.deducibleCobradoEl, cobrada: f.cobrada };
    return n;
  });
  // Órdenes de ejemplo agregadas después (p. ej. facturas por vencer y vencidas).
  const ya = new Set(guardadas.map(o => o.id));
  const nuevas = [...frescas.values()].filter(o => !ya.has(o.id) && o.entregadaEl);
  return nuevas.length ? [...actualizadas, ...nuevas] : actualizadas;
}
