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
    // ---------- En taller -------------------------------------------------
    orden({
      numero: 1050, codigo: 'QAS2N1', v: auto('Nissan', 'Qashqai', 2022, 81, 'Blanco', '#e9eaec', 'suv'), desde: 0, aprobacion: 'pendiente', pagador: particular,
      filas: [['pintura', 'parachoque_del', 'leve', 'pendiente'], ['desabolladura', 'capot', 'leve', 'pendiente']],
      notas: 'Rayón del parachoque delantero y un abollón chico en el capot.',
    }),
    orden({
      numero: 1051, codigo: 'DUS5R2', v: auto('Renault', 'Duster', 2019, 82, 'Naranja', '#c65a1e', 'suv'), desde: 1, aprobacion: 'enviada', pagador: particular,
      filas: [['desabolladura', 'puerta_del_der', 'medio', 'pendiente', 225000], ['pintura', 'puerta_del_der', 'medio', 'pendiente', 265000]],
      notas: 'Golpe en la puerta del conductor.',
    }),
    orden({
      numero: 1043, codigo: 'TUC9M4', v: auto('Hyundai', 'Tucson', 2023, 33, 'Azul', '#1d3f72', 'suv'), desde: 1, aprobacion: 'pendiente', pagador: particular,
      filas: [['desabolladura', 'capot', 'leve', 'pendiente'], ['pintura', 'capot', 'medio', 'pendiente'], ['pintura', 'parachoque_del', 'medio', 'pendiente']],
    }),
    orden({
      numero: 1044, codigo: 'RIO4H7', v: auto('Kia', 'Rio', 2021, 55, 'Gris', '#4a4f55', 'hatchback'), desde: 2, aprobacion: 'enviada', pagador: particular,
      filas: [['desabolladura', 'tapabarro_del_izq', 'leve', 'pendiente', 200000], ['pintura', 'tapabarro_del_izq', 'medio', 'pendiente', 250000]],
    }),
    orden({
      numero: 1052, codigo: 'PEU8K3', v: auto('Peugeot', '208', 2020, 83, 'Rojo', '#b3202a', 'hatchback'), desde: 3, aprobacion: 'aprobada', pagador: particular,
      filas: [['cambio', 'espejo_izq', 'medio', 'pendiente', 175000], ['pulido', 'puerta_del_izq', 'leve', 'pendiente', 70000]],
      notas: 'Espejo quebrado en un estacionamiento.',
      // Pedido hace dos días, el proveedor promete para pasado mañana: el auto espera la pieza.
      parte: { item: 'i0', proveedor: 'Autopartes Demo Centro', pedidoHace: 2, prometidoHace: -2 },
    }),
    orden({
      numero: 1053, codigo: 'L2006T', v: auto('Mitsubishi', 'L200', 2021, 84, 'Gris', '#4a4f55', 'pickup'), desde: 5, aprobacion: 'aprobada', pagador: seguro('Compañía Demo Centro', 1053, 120000),
      filas: [['desabolladura', 'puerta_tras_izq', 'fuerte', 'proceso'], ['pintura', 'puerta_tras_izq', 'medio', 'pendiente'], ['desabolladura', 'costado_tras_izq', 'medio', 'proceso']],
      notas: 'Costado izquierdo por roce con pilar.',
    }),
    orden({
      numero: 1041, codigo: 'F150RJ', v: auto('Ford', 'F-150', 2020, 11, 'Rojo', '#a3121c', 'pickup'), desde: 4, aprobacion: 'aprobada', pagador: seguro('Compañía Demo Norte', 1041, 150000),
      filas: [['desabolladura', 'puerta_tras_der', 'medio', 'listo'], ['pintura', 'puerta_tras_der', 'medio', 'proceso'], ['desabolladura', 'costado_tras_der', 'medio', 'proceso'], ['pintura', 'costado_tras_der', 'medio', 'pendiente'], ['cambio', 'espejo_der', 'medio', 'pendiente']],
      notas: 'Choque lateral en estacionamiento.',
      // El espejo viene del concesionario y prometió llegar hace 2 días: atrasado.
      parte: { item: 'i4', proveedor: 'Concesionario de la marca', pedidoHace: 4, prometidoHace: 2 },
    }),
    orden({
      numero: 1054, codigo: 'CX57M4', v: auto('Mazda', 'CX-5', 2021, 85, 'Rojo', '#a3121c', 'suv'), desde: 6, aprobacion: 'aprobada', pagador: particular,
      filas: [['desabolladura', 'capot', 'medio', 'listo', 235000], ['pintura', 'capot', 'medio', 'proceso', 265000], ['pulido', 'capot', 'leve', 'pendiente', 65000]],
      notas: 'Granizada sobre el capot.',
    }),
    orden({
      numero: 1042, codigo: 'COR7X2', v: auto('Toyota', 'Corolla', 2020, 22, 'Gris azulado', '#717f8b', 'sedan'), desde: 6, aprobacion: 'aprobada', pagador: seguro('Compañía Demo Centro', 1042, 90000),
      filas: [['desabolladura', 'maletera', 'medio', 'listo', 240000], ['pintura', 'maletera', 'medio', 'listo', 230000], ['plastico', 'parachoque_tras', 'medio', 'listo', 120000], ['pintura', 'parachoque_tras', 'medio', 'proceso', 230000]],
      notas: 'Alcance por atrás.',
    }),
    orden({
      numero: 1055, codigo: 'ONX3H5', v: auto('Chevrolet', 'Onix', 2022, 86, 'Azul', '#1d3f72', 'hatchback'), desde: 8, aprobacion: 'aprobada', pagador: particular,
      filas: [['desabolladura', 'puerta_del_izq', 'medio', 'listo', 195000], ['pintura', 'puerta_del_izq', 'medio', 'listo', 245000], ['cambio', 'espejo_der', 'leve', 'listo', 80000]],
      notas: 'Puerta y espejo del lado del conductor.',
      // Repuesto recibido ayer: el proveedor cumplió la fecha.
      parte: { item: 'i2', proveedor: 'Repuestos Demo Norte', pedidoHace: 11, prometidoHace: 1, recibidoHace: 1, costo: 22000 },
    }),
    orden({
      numero: 1057, codigo: 'ELA2P7', v: auto('Hyundai', 'Elantra', 2020, 87, 'Blanco', '#e4e6e8', 'sedan'), desde: 9, aprobacion: 'aprobada', pagador: particular,
      filas: [['desabolladura', 'tapabarro_del_der', 'medio', 'listo', 210000], ['pintura', 'tapabarro_del_der', 'medio', 'listo', 240000], ['pulido', 'tapabarro_del_der', 'leve', 'pendiente', 65000]],
      notas: 'Falta solo el pulido final.',
    }),
    orden({
      numero: 1056, codigo: 'CMP9L6', v: auto('Jeep', 'Compass', 2020, 88, 'Gris oscuro', '#3a3f45', 'suv'), desde: 10, aprobacion: 'aprobada', pagador: seguro('Compañía Demo Sur', 1056, 150000), cierre: 'listo',
      filas: [['desabolladura', 'parachoque_tras', 'medio', 'listo', 235000], ['pintura', 'parachoque_tras', 'medio', 'listo', 255000], ['pulido', 'maletera', 'leve', 'listo', 70000]],
      notas: 'Alcance menor por atrás.',
    }),
    orden({
      numero: 1040, codigo: 'SWF3K8', v: auto('Suzuki', 'Swift', 2019, 44, 'Blanco', '#e4e6e8', 'hatchback'), desde: 9, aprobacion: 'aprobada', pagador: particular, cierre: 'listo',
      filas: [['desabolladura', 'puerta_del_izq', 'leve', 'listo', 175000], ['pintura', 'puerta_del_izq', 'medio', 'listo', 235000]],
    }),
    ...historico(),
  ];
}

/** Un auto que ya salió del taller, con lo que se le cobró y quién pagó. */
interface Salida {
  numero: number; marca: string; modelo: string; anio: number; carroceria: Carroceria;
  color: string; colorHex: string;
  /** Días atrás que ingresó y que se entregó. */
  desde: number; hace: number;
  /** Neto cobrado por la desabolladura y por la pintura. */
  a: number; b: number;
  cambio?: boolean; pagador: Pagador; factura?: Base['factura'];
  /** Repuesto: proveedor, pedido, prometido y recibido (días atrás) y su costo. */
  parte?: [string, number, number, number, number];
  /** Horas reales distintas a las típicas (p. ej. un repintado). */
  horas?: Record<string, number>;
}

const SALIDAS: Salida[] = [
  // ----- Este mes -------------------------------------------------------
  { numero: 1045, marca: 'Kia', modelo: 'Sportage', anio: 2020, carroceria: 'suv', color: 'Blanco', colorHex: '#e9eaec', desde: 18, hace: 9, a: 385000, b: 345000, pagador: particular },
  { numero: 1048, marca: 'Toyota', modelo: 'Hilux', anio: 2020, carroceria: 'pickup', color: 'Gris', colorHex: '#4a4f55', desde: 20, hace: 7, a: 480000, b: 400000, pagador: particular },
  { numero: 1049, marca: 'Kia', modelo: 'Morning', anio: 2021, carroceria: 'hatchback', color: 'Rojo', colorHex: '#a3121c', desde: 24, hace: 3, a: 260000, b: 220000, pagador: particular },
  { numero: 1058, marca: 'Nissan', modelo: 'Navara', anio: 2021, carroceria: 'pickup', color: 'Azul', colorHex: '#1d3f72', desde: 7, hace: 1, a: 520000, b: 430000, pagador: seguro('Compañía Demo Centro', 1058, 150000), factura: { numero: 2221, emitidaHace: 1, pagadaHace: 1 } },
  { numero: 1046, marca: 'Toyota', modelo: 'Yaris', anio: 2019, carroceria: 'hatchback', color: 'Rojo', colorHex: '#a3121c', desde: 15, hace: 5, a: 300000, b: 260000, pagador: seguro('Compañía Demo Sur', 1046, 100000), factura: { numero: 2214, emitidaHace: 5 } },
  { numero: 1047, marca: 'Ford', modelo: 'Ranger', anio: 2021, carroceria: 'pickup', color: 'Gris', colorHex: '#4a4f55', desde: 22, hace: 2, a: 455000, b: 395000, cambio: true, pagador: seguro('Compañía Demo Centro', 1047, 150000), factura: { numero: 2215, emitidaHace: 2 }, parte: ['Concesionario de la marca', 24, 10, 10, 48000] },
  // ----- Mes pasado -----------------------------------------------------
  { numero: 1028, marca: 'Nissan', modelo: 'X-Trail', anio: 2020, carroceria: 'suv', color: 'Plateado', colorHex: '#a9aeb4', desde: 30, hace: 16, a: 500000, b: 440000, pagador: particular },
  { numero: 1029, marca: 'Mazda', modelo: '3', anio: 2019, carroceria: 'sedan', color: 'Azul', colorHex: '#1d3f72', desde: 70, hace: 60, a: 335000, b: 290000, pagador: seguro('Compañía Demo Norte', 1029, 90000), factura: { numero: 2216, emitidaHace: 60, pagadaHace: 22 } },
  { numero: 1038, marca: 'Chevrolet', modelo: 'Captiva', anio: 2019, carroceria: 'suv', color: 'Plateado', colorHex: '#a9aeb4', desde: 33, hace: 27, a: 260000, b: 230000, pagador: particular },
  { numero: 1033, marca: 'Chevrolet', modelo: 'Onix', anio: 2020, carroceria: 'hatchback', color: 'Plateado', colorHex: '#a9aeb4', desde: 34, hace: 27, a: 210000, b: 190000, pagador: seguro('Compañía Demo Norte', 1033, 90000), factura: { numero: 2205, emitidaHace: 27 } },
  { numero: 1039, marca: 'Chevrolet', modelo: 'Sail', anio: 2020, carroceria: 'sedan', color: 'Plateado', colorHex: '#a9aeb4', desde: 18, hace: 12, a: 240000, b: 210000, cambio: true, pagador: seguro('Compañía Demo Sur', 1039, 90000), factura: { numero: 2206, emitidaHace: 12, deduciblePendiente: true }, parte: ['Repuestos Demo Norte', 17, 15, 16, 26000] },
  // ----- Hace dos meses -------------------------------------------------
  { numero: 1026, marca: 'Peugeot', modelo: '3008', anio: 2021, carroceria: 'suv', color: 'Gris', colorHex: '#4a4f55', desde: 60, hace: 48, a: 425000, b: 365000, pagador: seguro('Compañía Demo Centro', 1026, 120000), factura: { numero: 2217, emitidaHace: 48, pagadaHace: 20 } },
  { numero: 1027, marca: 'Honda', modelo: 'HR-V', anio: 2020, carroceria: 'suv', color: 'Blanco', colorHex: '#e9eaec', desde: 72, hace: 60, a: 300000, b: 270000, pagador: particular },
  { numero: 1037, marca: 'Chevrolet', modelo: 'Colorado', anio: 2021, carroceria: 'pickup', color: 'Plateado', colorHex: '#a9aeb4', desde: 61, hace: 53, a: 420000, b: 380000, cambio: true, pagador: seguro('Compañía Demo Centro', 1037, 150000), factura: { numero: 2203, emitidaHace: 53, pagadaHace: 25 }, parte: ['Concesionario de la marca', 60, 57, 57, 38000] },
  { numero: 1032, marca: 'Chevrolet', modelo: 'Tracker', anio: 2019, carroceria: 'suv', color: 'Plateado', colorHex: '#a9aeb4', desde: 52, hace: 44, a: 350000, b: 290000, cambio: true, pagador: seguro('Compañía Demo Centro', 1032, 120000), factura: { numero: 2204, emitidaHace: 44 }, parte: ['Repuestos Demo Norte', 51, 48, 47, 26000] },
  // ----- Hace tres meses ------------------------------------------------
  { numero: 1024, marca: 'Mitsubishi', modelo: 'Outlander', anio: 2019, carroceria: 'suv', color: 'Negro', colorHex: '#23262a', desde: 92, hace: 80, a: 400000, b: 350000, pagador: seguro('Compañía Demo Sur', 1024, 150000), factura: { numero: 2218, emitidaHace: 80, pagadaHace: 50 } },
  { numero: 1025, marca: 'Chery', modelo: 'Tiggo 4', anio: 2022, carroceria: 'suv', color: 'Blanco', colorHex: '#e9eaec', desde: 108, hace: 96, a: 255000, b: 225000, pagador: particular },
  // El Onix tuvo que repintarse: la pintura tomó casi el doble de horas y se comió la ganancia.
  { numero: 1036, marca: 'Chevrolet', modelo: 'Onix', anio: 2018, carroceria: 'hatchback', color: 'Plateado', colorHex: '#a9aeb4', desde: 92, hace: 86, a: 190000, b: 170000, cambio: true, pagador: seguro('Compañía Demo Norte', 1036, 90000), factura: { numero: 2202, emitidaHace: 86, pagadaHace: 48 }, parte: ['Autopartes Demo Centro', 91, 89, 86, 24000], horas: { i1: 11 } },
  // ----- Hace cuatro meses ----------------------------------------------
  { numero: 1022, marca: 'Renault', modelo: 'Logan', anio: 2020, carroceria: 'sedan', color: 'Gris', colorHex: '#4a4f55', desde: 122, hace: 110, a: 355000, b: 315000, cambio: true, pagador: seguro('Compañía Demo Centro', 1022, 100000), factura: { numero: 2219, emitidaHace: 110, pagadaHace: 80 }, parte: ['Autopartes Demo Centro', 118, 110, 110, 26000] },
  { numero: 1023, marca: 'MG', modelo: 'ZS', anio: 2021, carroceria: 'suv', color: 'Rojo', colorHex: '#a3121c', desde: 138, hace: 126, a: 280000, b: 250000, pagador: particular },
  { numero: 1035, marca: 'Chevrolet', modelo: 'Tracker', anio: 2020, carroceria: 'suv', color: 'Plateado', colorHex: '#a9aeb4', desde: 118, hace: 112, a: 280000, b: 260000, pagador: particular },
  // ----- Hace cinco meses -----------------------------------------------
  { numero: 1020, marca: 'Volkswagen', modelo: 'Gol', anio: 2018, carroceria: 'hatchback', color: 'Blanco', colorHex: '#e9eaec', desde: 152, hace: 140, a: 335000, b: 295000, pagador: seguro('Compañía Demo Sur', 1020, 90000), factura: { numero: 2220, emitidaHace: 140, pagadaHace: 112 } },
  { numero: 1021, marca: 'Suzuki', modelo: 'Baleno', anio: 2020, carroceria: 'hatchback', color: 'Gris', colorHex: '#4a4f55', desde: 168, hace: 156, a: 265000, b: 235000, pagador: particular },
  { numero: 1034, marca: 'Chevrolet', modelo: 'Sail', anio: 2020, carroceria: 'sedan', color: 'Plateado', colorHex: '#a9aeb4', desde: 150, hace: 143, a: 310000, b: 240000, cambio: true, pagador: seguro('Compañía Demo Sur', 1034, 120000), factura: { numero: 2201, emitidaHace: 143, pagadaHace: 118 }, parte: ['Repuestos Demo Norte', 149, 146, 146, 26000] },
];

function historico(): Orden[] {
  return SALIDAS.map((d, k) => orden({
    numero: d.numero, codigo: `HS${d.numero}`,
    v: auto(d.marca, d.modelo, d.anio, 60 + k, d.color, d.colorHex, d.carroceria),
    desde: d.desde, aprobacion: 'aprobada', pagador: d.pagador,
    filas: [['desabolladura', 'puerta_del_der', 'medio', 'listo', d.a], ['pintura', 'puerta_del_der', 'medio', 'listo', d.b],
      ...(d.cambio ? [['cambio', 'espejo_der', 'medio', 'listo', 65000] as Fila] : [])],
    cierre: 'listo', entregadaHace: d.hace, cobrada: d.pagador.tipo === 'particular', factura: d.factura,
    parte: d.parte && { item: 'i2', proveedor: d.parte[0], pedidoHace: d.parte[1], prometidoHace: d.parte[2], recibidoHace: d.parte[3], costo: d.parte[4] },
    horas: d.horas,
  }));
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
