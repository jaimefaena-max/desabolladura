import { conEvento, sincronizar } from './automatizacion';
import { fechaLocal } from './piezas';
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

function items(v: Vehiculo, filas: Fila[], cierre: EstadoItem = 'pendiente'): Item[] {
  const [recepcion, ...fin] = tareasGenerales();
  const trabajos = filas.map(([trabajo, pieza, severidad, estado, monto], i): Item => ({
    id: `i${i}`, trabajo, pieza, severidad, estado, monto: monto ?? null, sugerido: sugerir(trabajo, pieza, severidad, v),
  }));
  return [recepcion, ...trabajos, ...fin.map(i => ({ ...i, estado: cierre }))];
}

/** Ficha y fotos generadas por scripts/generar-autos-demo.ts. Si un modelo no tiene, queda con el 3D genérico. */
const FOTOS = autosDemo as Record<string, { ficha: FichaModelo; vistas: Partial<Record<Vista, string>> } | undefined>;

const auto = (marca: string, modelo: string, anio: number, n: number, color: string, colorHex: string, carroceria: Carroceria): Vehiculo =>
  ({ marca, modelo, anio, patente: `DEMA${String(n).padStart(2, '0')}`, color, colorHex, carroceria, ficha: FOTOS[slugAuto({ marca, modelo, anio })]?.ficha });

interface Base {
  numero: number; codigo: string; v: Vehiculo; desde: number; pagador: Pagador; aprobacion: Aprobacion;
  filas: Fila[]; cierre?: EstadoItem; entregadaHace?: number; cobrada?: boolean; notas?: string;
}

function orden(b: Base): Orden {
  const o = sincronizar({
    id: `ot-${b.numero}`, numero: b.numero, codigo: b.codigo, creada: dias(-b.desde), entrega: '', maestroId: 'trabajador', vehiculo: b.v,
    cliente: { nombre: `Cliente Demo ${b.numero}`, rut: rutDemo(10000000 + b.numero), telefono: '+56 9 0000 0000' },
    pagador: b.pagador, items: items(b.v, b.filas, b.cierre), notas: b.notas ?? '', aprobacion: b.aprobacion,
    repuestos: [], fotos: [], historial: [], recepcion: { km: 40000 + b.numero * 37, combustible: 'Medio', observaciones: '' },
    entregadaEl: b.entregadaHace === undefined ? null : dias(-b.entregadaHace), cobrada: b.cobrada ?? false,
    vistas: FOTOS[slugAuto(b.v)]?.vistas,
  });
  return conEvento(o, 'Vehículo ingresado al taller');
}

const seguro = (aseguradora: string, n: number, deducible: number): Pagador => ({ tipo: 'aseguradora', aseguradora, siniestro: `DEMO-${n}`, deducible });
const particular: Pagador = { tipo: 'particular' };

export function ordenesDemo(): Orden[] {
  return [
    orden({
      numero: 1041, codigo: 'F150RJ', v: auto('Ford', 'F-150', 2022, 11, 'Rojo', '#a3121c', 'pickup'), desde: 4, aprobacion: 'aprobada', pagador: seguro('Compañía Demo Norte', 1041, 150000),
      filas: [['desabolladura', 'puerta_tras_der', 'medio', 'listo'], ['pintura', 'puerta_tras_der', 'medio', 'proceso'], ['desabolladura', 'costado_tras_der', 'medio', 'proceso'], ['pintura', 'costado_tras_der', 'medio', 'pendiente'], ['cambio', 'espejo_der', 'medio', 'pendiente']],
      notas: 'Choque lateral en estacionamiento.',
    }),
    orden({
      numero: 1042, codigo: 'COR7X2', v: auto('Toyota', 'Corolla', 2020, 22, 'Plateado', '#a9aeb4', 'sedan'), desde: 6, aprobacion: 'aprobada', pagador: seguro('Compañía Demo Centro', 1042, 90000),
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
  const filas = (a: number, b: number): Fila[] => [['desabolladura', 'puerta_del_der', 'medio', 'listo', a], ['pintura', 'puerta_del_der', 'medio', 'listo', b]];
  const datos: [number, string, number, number, number, number, Pagador][] = [
    [1034, 'Sail', 150, 143, 310000, 240000, seguro('Compañía Demo Sur', 1034, 120000)],
    [1035, 'Tracker', 118, 112, 280000, 260000, particular],
    [1036, 'Onix', 92, 86, 190000, 170000, seguro('Compañía Demo Norte', 1036, 90000)],
    [1037, 'Colorado', 61, 53, 420000, 380000, seguro('Compañía Demo Centro', 1037, 150000)],
    [1038, 'Captiva', 33, 27, 260000, 230000, particular],
    [1039, 'Sail', 18, 12, 240000, 210000, seguro('Compañía Demo Sur', 1039, 90000)],
  ];
  return datos.map(([numero, modelo, desde, hace, a, b, pagador], k) => orden({
    numero, codigo: `HIS${k}0${k}`, v: auto('Chevrolet', modelo, 2018 + k, 60 + k, 'Plateado', '#a9aeb4', modelo === 'Colorado' ? 'pickup' : modelo === 'Onix' ? 'hatchback' : modelo === 'Sail' ? 'sedan' : 'suv'),
    desde, aprobacion: 'aprobada', pagador, filas: filas(a, b), cierre: 'listo', entregadaHace: hace, cobrada: numero !== 1039,
  }));
}
