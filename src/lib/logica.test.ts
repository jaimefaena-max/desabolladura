import { describe, expect, it } from 'vitest';
import { extraerJSON } from './gemini';
import { interpretarPadron } from './padron';
import { estadosPiezas, fechaLocal, progreso, totales } from './piezas';
import { sugerir } from './precios';
import { ordenesDemo } from './seed';
import type { Item, Orden } from './types';
import { carroceriaDe, colorHex, patenteValida, verPatente } from './vehiculos';

const item = (c: Partial<Item>): Item => ({ id: 'x', trabajo: 'pintura', pieza: 'maletera', estado: 'pendiente', monto: null, ...c });

describe('padrón', () => {
  const texto = `CERTIFICADO DE INSCRIPCION
INSCRIPCION: DEMA.55-5
NOMBRE: CLIENTE DEMO CINCO
RUT: 10.000.005-1
MARCA: TOYOTA
MODELO: HILUX
AÑO: 2021
COLOR: PLATEADO
MOTOR: 2GD4471823
CHASIS: MR0KA3CD201234567`;

  it('rescata los datos del vehículo y del dueño', () => {
    expect(interpretarPadron(texto)).toEqual({
      patente: 'DEMA55', marca: 'TOYOTA', modelo: 'HILUX', anio: 2021, color: 'PLATEADO',
      motor: '2GD4471823', chasis: 'MR0KA3CD201234567', nombre: 'CLIENTE DEMO CINCO', rut: '10.000.005-1',
    });
  });
  it('acepta el valor en la línea siguiente a la etiqueta', () => {
    expect(interpretarPadron('MARCA\nFORD\nMODELO\nF-150\nAÑO\n2022').marca).toBe('FORD');
  });
  it('deja vacío lo que no reconoce', () => {
    expect(interpretarPadron('texto ilegible').patente).toBeUndefined();
  });
  it('lee patente antigua', () => {
    expect(interpretarPadron('PATENTE: AB-1234').patente).toBe('AB1234');
  });
});

describe('patente y catálogo', () => {
  it('valida formatos chilenos', () => {
    expect(patenteValida('RKTS-48')).toBe(true);
    expect(patenteValida('AB1234')).toBe(true);
    expect(patenteValida('123456')).toBe(false);
    expect(verPatente('RKTS48')).toBe('RKTS-48');
    expect(verPatente('AB1234')).toBe('AB-1234');
  });
  it('deduce carrocería y color', () => {
    expect(carroceriaDe('FORD', 'F-150')).toBe('pickup');
    expect(carroceriaDe('Toyota', 'COROLLA XEI')).toBe('sedan');
    expect(carroceriaDe('Desconocida', 'X')).toBeNull();
    expect(carroceriaDe('Mazda', 'CX-30')).toBeNull();
    expect(carroceriaDe('Mazda', '3')).toBe('sedan');
    expect(carroceriaDe('Mazda', '3 Sport')).toBe('sedan');
    expect(carroceriaDe('Mazda', 'CX-5')).toBe('suv');
    expect(carroceriaDe('Toyota', 'Corolla Cross')).toBe('suv');
    expect(colorHex('GRIS GRAFITO').nombre).toBe('Gris');
  });
});

describe('precio sugerido', () => {
  it('da 300 a 500 mil aprox. para puerta de F-150 2022', () => {
    const s = sugerir('desabolladura', 'puerta_tras_der', 'medio', { carroceria: 'pickup', modelo: 'F-150', anio: 2022 });
    expect(s.min).toBeGreaterThanOrEqual(280000);
    expect(s.max).toBeLessThanOrEqual(540000);
  });
  it('sube con la severidad', () => {
    const v = { carroceria: 'sedan' as const, modelo: 'Corolla', anio: 2015 };
    expect(sugerir('pintura', 'capot', 'fuerte', v).min).toBeGreaterThan(sugerir('pintura', 'capot', 'leve', v).min);
  });
});

describe('avance', () => {
  it('cuenta en proceso como la mitad', () => {
    expect(progreso([item({ estado: 'listo' }), item({ estado: 'proceso' }), item({}), item({})])).toBe(38);
    expect(progreso([])).toBe(0);
  });
  it('una pieza con pintura pendiente no se ve terminada', () => {
    expect(estadosPiezas([item({ trabajo: 'desabolladura', estado: 'listo' }), item({ estado: 'pendiente' })]).maletera).toBe('proceso');
    expect(estadosPiezas([item({ trabajo: 'desabolladura', estado: 'listo' }), item({ estado: 'listo' })]).maletera).toBe('listo');
    expect(estadosPiezas([item({})]).maletera).toBe('pendiente');
  });
});

describe('cobro', () => {
  const base = ordenesDemo()[1];
  const orden = (c: Partial<Orden>): Orden => ({ ...base, ...c });
  it('separa IVA, deducible y compañía', () => {
    const o = orden({ items: [item({ monto: 1000000 })], pagador: { tipo: 'aseguradora', aseguradora: 'X', deducible: 90000 } });
    expect(totales(o)).toMatchObject({ neto: 1000000, iva: 190000, total: 1190000, deducible: 90000, aseguradora: 1100000, faltan: 0 });
  });
  it('el deducible no supera el total y el particular paga todo', () => {
    expect(totales(orden({ items: [item({ monto: 1000 })], pagador: { tipo: 'aseguradora', deducible: 90000 } })).aseguradora).toBe(0);
    expect(totales(orden({ items: [item({ monto: 1000 })], pagador: { tipo: 'particular' } })).deducible).toBe(0);
  });
  it('cuenta los trabajos sin monto e ignora tareas generales', () => {
    expect(totales(orden({ items: [item({}), item({ trabajo: 'general' })] })).faltan).toBe(1);
  });
});

describe('datos de ejemplo', () => {
  const dv = (rut: string) => {
    let t = 0, m = 2;
    for (const c of rut.split('-')[0].replace(/\./g, '').split('').reverse()) { t += Number(c) * m; m = m === 7 ? 2 : m + 1; }
    const r = 11 - (t % 11);
    return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  };
  const ordenes = ordenesDemo();
  it('ningún RUT tiene dígito válido ni se repite', () => {
    const ruts = ordenes.map(o => o.cliente.rut);
    expect(new Set(ruts).size).toBe(ruts.length);
    ruts.forEach(r => expect(r.split('-')[1]).not.toBe(dv(r)));
  });
  it('las patentes llevan vocal, que las series chilenas no usan', () => {
    ordenes.forEach(o => expect(o.vehiculo.patente).toMatch(/[AEIOU]/));
  });
});

describe('fechas', () => {
  it('usa la fecha local', () => {
    const d = new Date();
    expect(fechaLocal()).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  });
});

describe('gemini', () => {
  it('extrae JSON aunque venga con texto alrededor', () => {
    expect(extraerJSON<{ min: number }>('Claro: ```json\n{"min": 5}\n```')).toEqual({ min: 5 });
    expect(() => extraerJSON('sin datos')).toThrow();
  });
});
