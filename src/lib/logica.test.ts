import { leerFicha, medidasValidas, promptVista, slugAuto } from './fichaModelo';
import { specDe } from '../three/carModel';
import { describe, expect, it } from 'vitest';
import { extraerJSON } from './gemini';
import { interpretarPadron } from './padron';
import { estadosPiezas, fechaLocal, progreso, totales } from './piezas';
import { sugerir } from './precios';
import { alertas, diasTrabajo, enlaceWhatsApp, etapaDe, mensajeCliente, metricas, sincronizar, sumarHabiles } from './automatizacion';
import { ordenesDemo, USUARIOS } from './seed';
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
    expect(carroceriaDe('Toyota', 'Corolla')).toBe('sedan');
    expect(carroceriaDe('Toyota', 'Corolla Cross')).toBe('suv');
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

describe('automatización', () => {
  const ordenes = ordenesDemo();
  const buscar = (n: number) => ordenes.find(o => o.numero === n)!;
  const con = (n: number, c: Partial<Orden>): Orden => ({ ...buscar(n), ...c });

  it('ubica cada vehículo en su etapa', () => {
    expect(etapaDe(buscar(1043))).toBe('aprobar');
    expect(etapaDe(buscar(1041))).toBe('desabolladura');
    expect(etapaDe(buscar(1042))).toBe('pintura');
    expect(etapaDe(buscar(1040))).toBe('entrega');
    expect(etapaDe(buscar(1034))).toBe('entregado');
  });
  it('espera repuestos antes de partir y pasa a calidad al terminar', () => {
    const o = buscar(1043);
    const r = { id: 'r', itemId: 'i0', nombre: 'Capot', estado: 'pedido' as const };
    expect(etapaDe({ ...o, aprobacion: 'aprobada', repuestos: [r] })).toBe('repuestos');
    expect(etapaDe({ ...o, aprobacion: 'aprobada', repuestos: [{ ...r, estado: 'recibido' }] })).toBe('desabolladura');
    const lista = o.items.map(i => (i.trabajo === 'general' ? i : { ...i, estado: 'listo' as const }));
    expect(etapaDe({ ...o, items: lista, aprobacion: 'aprobada' })).toBe('calidad');
  });
  it('un cambio de pieza crea su repuesto una sola vez', () => {
    const o = buscar(1041);
    expect(o.repuestos.map(r => r.nombre)).toEqual(['Espejo derecho']);
    expect(sincronizar(o).repuestos).toHaveLength(1);
  });
  it('la fecha salta fines de semana y nunca se adelanta', () => {
    expect(sumarHabiles('2026-11-06', 1)).toBe('2026-11-09');
    expect(diasTrabajo([item({ severidad: 'medio' })])).toBe(2);
    const o = con(1043, { entrega: '2099-01-01' });
    expect(sincronizar(o).entrega).toBe('2099-01-01');
  });
  it('alerta atrasos, cobros, repuestos y entregas', () => {
    const textos = alertas(ordenes, '2026-11-05').map(a => a.texto).join(' | ');
    expect(textos).toContain('entregado sin cobrar');
    expect(textos).toContain('pedir espejo derecho');
    expect(textos).toContain('listo, avisa al cliente');
    expect(alertas([con(1041, { entrega: '2020-01-01' })], '2026-11-05')[0]).toMatchObject({ urgente: true });
  });
  it('escribe el aviso de WhatsApp según la etapa', () => {
    expect(mensajeCliente(buscar(1040), { nombre: 'Taller' })).toContain('listo para retirar');
    expect(mensajeCliente(buscar(1042), { nombre: 'Taller' })).toContain('en pintura');
    expect(enlaceWhatsApp('+56 9 1234 5678', 'hola mundo')).toBe('https://wa.me/56912345678?text=hola%20mundo');
  });
  it('calcula métricas solo con lo cobrado', () => {
    const m = metricas(ordenes);
    expect(m.ingresos).toBeGreaterThan(0);
    expect(m.ciclo).toBeGreaterThan(0);
    expect(m.meses).toHaveLength(6);
    expect(metricas([])).toMatchObject({ ingresos: 0, ticket: 0, ciclo: 0 });
  });
  it('tiene un perfil de demo por rol, sin credenciales', () => {
    expect(USUARIOS.map(u => [u.id, u.rol])).toEqual([['admin', 'admin'], ['trabajador', 'maestro']]);
    expect(USUARIOS.every(u => !('clave' in u) && !('usuario' in u))).toBe(true);
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

describe('ficha del modelo con IA', () => {
  const corolla = { generacion: 'E210 (2019-2025)', carroceria: 'Sedan', rasgos: 'Focos delgados', largo_mm: 4630, ancho_mm: 1780, alto_mm: 1435, entre_ejes_mm: 2700 };
  it('lee la ficha y pasa las medidas a metros', () => {
    const { ficha, carroceria } = leerFicha(corolla, ['https://a', 'https://b', 'https://c', 'https://d']);
    expect(carroceria).toBe('sedan');
    expect(ficha.medidas).toEqual({ largo: 4.63, ancho: 1.78, alto: 1.435, entreEjes: 2.7 });
    expect(ficha.fuentes).toHaveLength(3);
  });
  it('descarta medidas imposibles en vez de deformar el 3D', () => {
    expect(medidasValidas({ ...corolla, largo_mm: 463 })).toBeUndefined();
    expect(medidasValidas({ ...corolla, entre_ejes_mm: 5000 })).toBeUndefined();
    expect(medidasValidas({ ...corolla, alto_mm: undefined })).toBeUndefined();
  });
  it('exige generación y rasgos', () => {
    expect(() => leerFicha({ ...corolla, generacion: '' })).toThrow();
  });
  it('arma las vistas como el mismo auto', () => {
    const v = { marca: 'Toyota', modelo: 'Corolla', anio: 2020, color: 'Plateado' };
    const { ficha } = leerFicha(corolla);
    expect(promptVista(v, ficha, 'frente')).toContain('Toyota Corolla 2020 (E210 (2019-2025))');
    expect(promptVista(v, ficha, 'cola')).toContain('mismo auto de la imagen de referencia');
    expect(slugAuto(v)).toBe('toyota-corolla-2020');
  });
});

describe('3D con medidas reales', () => {
  it('toma largo, ancho y distancia entre ejes del modelo', () => {
    const s = specDe('sedan', { largo: 4.63, ancho: 1.78, alto: 1.435, entreEjes: 2.7 });
    expect(s.L).toBeCloseTo(4.63);
    expect(s.W).toBeCloseTo(1.78);
    expect((s.axleR - s.axleF) * s.L).toBeCloseTo(2.7);
    // Las puertas siguen dentro de la distancia entre ejes, en orden.
    expect(s.doors[0]).toBeGreaterThan(s.axleF);
    expect(s.doors[2]).toBeLessThan(s.axleR);
    expect([...s.top.map(p => p[0])]).toEqual([...s.top.map(p => p[0])].sort((a, b) => a - b));
  });
  it('acota un dato exagerado', () => {
    const s = specDe('hatchback', { largo: 9, ancho: 3, alto: 4, entreEjes: 2.5 });
    expect(s.L).toBeCloseTo(4.0 * 1.2);
    expect(s.W).toBeCloseTo(1.74 * 1.1);
  });
  it('sin medidas, queda igual que antes', () => {
    expect(specDe('suv')).toBe(specDe('suv', undefined));
  });
});
