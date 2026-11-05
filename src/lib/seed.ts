import { sugerir } from './precios';
import type { EstadoItem, Item, Orden, PiezaId, Severidad, Trabajo, Usuario, Vehiculo } from './types';

/** Todos los datos son ficticios: nombres, RUT, patentes y aseguradoras no corresponden a nadie real. */
export const USUARIOS: Usuario[] = [
  { id: 'hector', nombre: 'Héctor Araya', rol: 'maestro', cargo: 'Maestro desabollador', pin: '1234' },
  { id: 'luis', nombre: 'Luis Quezada', rol: 'maestro', cargo: 'Maestro pintor', pin: '1234' },
  { id: 'paula', nombre: 'Paula Fuentealba', rol: 'admin', cargo: 'Administradora', pin: '4321' },
];

export const ASEGURADORAS = ['Aseguradora Cordillera', 'Seguros Pacífico Sur', 'Andes Seguros', 'Otra'];

export function tareasGenerales(recepcionLista = true): Item[] {
  return [
    { id: 'g-recepcion', trabajo: 'general', pieza: null, titulo: 'Recepción y revisión del vehículo', estado: recepcionLista ? 'listo' : 'pendiente', monto: null },
    { id: 'g-calidad', trabajo: 'general', pieza: null, titulo: 'Control de calidad', estado: 'pendiente', monto: null },
    { id: 'g-entrega', trabajo: 'general', pieza: null, titulo: 'Lavado y entrega', estado: 'pendiente', monto: null },
  ];
}

const dias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

type Fila = [Trabajo, PiezaId, Severidad, EstadoItem, number?];

/** Orden natural de la lista: recepción, trabajos y cierre. */
function items(v: Vehiculo, filas: Fila[], cierre: EstadoItem = 'pendiente'): Item[] {
  const [recepcion, ...fin] = tareasGenerales();
  const trabajos = filas.map(([trabajo, pieza, severidad, estado, monto], i): Item => ({
    id: `i${i}`, trabajo, pieza, severidad, estado, monto: monto ?? null, sugerido: sugerir(trabajo, pieza, severidad, v),
  }));
  return [recepcion, ...trabajos, ...fin.map(i => ({ ...i, estado: cierre }))];
}

export function ordenesDemo(): Orden[] {
  const f150: Vehiculo = { marca: 'Ford', modelo: 'F-150', anio: 2022, patente: 'RTKW52', color: 'Rojo', colorHex: '#a3121c', carroceria: 'pickup' };
  const corolla: Vehiculo = { marca: 'Toyota', modelo: 'Corolla', anio: 2020, patente: 'LFZD31', color: 'Plateado', colorHex: '#a9aeb4', carroceria: 'sedan' };
  const tucson: Vehiculo = { marca: 'Hyundai', modelo: 'Tucson', anio: 2023, patente: 'SHPB17', color: 'Azul', colorHex: '#1d3f72', carroceria: 'suv' };
  const swift: Vehiculo = { marca: 'Suzuki', modelo: 'Swift', anio: 2019, patente: 'KXVR84', color: 'Blanco', colorHex: '#e4e6e8', carroceria: 'hatchback' };

  return [
    {
      id: 'ot-1041', numero: 1041, codigo: 'F150RJ', creada: dias(-4), entrega: dias(3), maestroId: 'hector', vehiculo: f150,
      cliente: { nombre: 'Rodrigo Alarcón Muñoz', rut: '11.111.111-1', telefono: '+56 9 5550 1041' },
      pagador: { tipo: 'aseguradora', aseguradora: 'Aseguradora Cordillera', siniestro: 'SN-2026-48213', liquidador: 'Marcela Toro', deducible: 150000 },
      items: items(f150, [
        ['desabolladura', 'puerta_tras_der', 'medio', 'listo'],
        ['pintura', 'puerta_tras_der', 'medio', 'proceso'],
        ['desabolladura', 'costado_tras_der', 'medio', 'proceso'],
        ['pintura', 'costado_tras_der', 'medio', 'pendiente'],
        ['cambio', 'espejo_der', 'medio', 'pendiente'],
      ]),
      notas: 'Choque lateral en estacionamiento. Repuesto de espejo en camino.', cobrada: false,
    },
    {
      id: 'ot-1042', numero: 1042, codigo: 'COR7X2', creada: dias(-6), entrega: dias(1), maestroId: 'luis', vehiculo: corolla,
      cliente: { nombre: 'Valentina Sepúlveda Rojas', rut: '22.222.222-2', telefono: '+56 9 5550 1042' },
      pagador: { tipo: 'aseguradora', aseguradora: 'Andes Seguros', siniestro: 'AS-77120', liquidador: 'Tomás Olave', deducible: 90000 },
      items: items(corolla, [
        ['desabolladura', 'maletera', 'medio', 'listo', 240000],
        ['pintura', 'maletera', 'medio', 'listo', 230000],
        ['plastico', 'parachoque_tras', 'medio', 'listo', 120000],
        ['pintura', 'parachoque_tras', 'medio', 'proceso', 190000],
      ]),
      notas: 'Alcance por atrás.', cobrada: false,
    },
    {
      id: 'ot-1043', numero: 1043, codigo: 'TUC9M4', creada: dias(-1), entrega: dias(6), maestroId: 'hector', vehiculo: tucson,
      cliente: { nombre: 'Ignacio Bravo Lagos', rut: '12.345.678-5', telefono: '+56 9 5550 1043' },
      pagador: { tipo: 'particular' },
      items: items(tucson, [
        ['desabolladura', 'capot', 'leve', 'pendiente'],
        ['pintura', 'capot', 'medio', 'pendiente'],
        ['pintura', 'parachoque_del', 'medio', 'pendiente'],
      ]),
      notas: '', cobrada: false,
    },
    {
      id: 'ot-1040', numero: 1040, codigo: 'SWF3K8', creada: dias(-9), entrega: dias(0), maestroId: 'luis', vehiculo: swift,
      cliente: { nombre: 'Francisca Mella Oyarzún', rut: '11.111.111-1', telefono: '+56 9 5550 1040' },
      pagador: { tipo: 'particular' },
      items: items(swift, [
        ['desabolladura', 'puerta_del_izq', 'leve', 'listo', 115000],
        ['pintura', 'puerta_del_izq', 'medio', 'listo', 165000],
      ], 'listo'),
      notas: '', cobrada: true,
    },
  ];
}
