import { leerFicha, medidasValidas, promptVista, slugAuto } from './fichaModelo';
import { desempaquetar, empaquetar, mensajeAvance, mensajePresupuesto } from './seguimiento';
import { specDe } from '../three/carModel';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { extraerJSON } from './gemini';
import { interpretarPadron } from './padron';
import { clp, estadosPiezas, fechaLocal, progreso, totales } from './piezas';
import { sugerir } from './precios';
import { alertas, CMF_REPARACION, diasEnTaller, diasTrabajo, enlaceWhatsApp, etapaDe, mensajeCliente, metricas, semaforoPlazo, sincronizar, sumarHabiles } from './automatizacion';
import { conFotosDemo, ordenesDemo, USUARIOS } from './seed';
import { COSTO_HORA_DEFECTO, horasEstimadas, rentabilidad, resumenRentabilidad, semaforoMargen } from './rentabilidad';
import { diasEntre, estadoRepuesto, mensajeRepuesto, resumenRepuestos, textoEstado } from './repuestos';
import { cobradaSeguro, COMISION_COBRANZA, correoRecordatorio, estadoFactura, resumenCobranza, vencimiento } from './cobranza';
import type { Item, Orden } from './types';
import { carroceriaDe, colorHex, patenteValida, verPatente } from './vehiculos';

/*
 * Reloj fijo: los datos de ejemplo se fechan respecto de «hoy». Con el reloj real, una prueba que
 * fija su propio «hoy» deja de calzar al pasar los días y bloquea el despliegue (pasó el 10-nov-2026).
 */
const HOY = new Date(2026, 10, 5, 12);
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(HOY);
afterAll(() => { vi.useRealTimers(); });

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
MOTOR: DEMO000001
CHASIS: DEMO0000000000001`;

  it('rescata los datos del vehículo y del dueño', () => {
    expect(interpretarPadron(texto)).toEqual({
      patente: 'DEMA55', marca: 'TOYOTA', modelo: 'HILUX', anio: 2021, color: 'PLATEADO',
      motor: 'DEMO000001', chasis: 'DEMO0000000000001', nombre: 'CLIENTE DEMO CINCO', rut: '10.000.005-1',
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
    expect(carroceriaDe('Jeep', 'Grand Cherokee')).toBe('suv');
    expect(carroceriaDe('JEEP', 'Gladiator')).toBe('pickup');
    expect(carroceriaDe('Great Wall', 'Poer')).toBe('pickup');
    expect(carroceriaDe('MG', 'ZS')).toBe('suv');
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
    expect(textos).toMatch(/factura N\.º \d+ vencida hace \d+ días/);
    expect(textos).toMatch(/factura N\.º \d+ vence en \d+ días/);
    expect(alertas(ordenes).map(a => a.texto).join(' | ')).toContain('espejo derecho atrasado 2 días (Concesionario de la marca)');
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

describe('fotos de los autos demo', () => {
  it('el Corolla de la demo trae sus 3 fotos y sus medidas', () => {
    const o = ordenesDemo().find(x => x.codigo === 'COR7X2')!;
    expect(Object.keys(o.vistas ?? {})).toEqual(['frente', 'lado', 'cola']);
    expect(o.vehiculo.ficha?.medidas?.largo).toBe(4.63);
  });
  it('quien ya visitó la demo recibe las fotos sin perder sus cambios', () => {
    const vieja = ordenesDemo().map(o => ({ ...o, vistas: undefined, notas: 'cambio del visitante', vehiculo: { ...o.vehiculo, ficha: undefined } }));
    const nueva = conFotosDemo(vieja).find(x => x.codigo === 'COR7X2')!;
    expect(nueva.vistas?.frente).toBe('autos/toyota-corolla-2020-frente.webp');
    expect(nueva.notas).toBe('cambio del visitante');
  });
  it('no toca órdenes creadas por el visitante', () => {
    const propia = { ...ordenesDemo()[0], id: 'propia' };
    expect(conFotosDemo([propia])[0]).toBe(propia);
  });
});

describe('seguimiento por WhatsApp', () => {
  const base = () => {
    const o = ordenesDemo().find(x => x.codigo === 'COR7X2')!;
    return { ...o, cliente: { nombre: 'Carlos Morales', rut: '12.345.678-5', telefono: '+56 9 1234 5678' } };
  };
  it('el link lleva la orden y vuelve igual (tareas, notas y avance)', () => {
    const o = base(), d = desempaquetar(empaquetar(o, 'Taller Demo'))!;
    expect(d.codigo).toBe('COR7X2');
    expect(d.taller).toBe('Taller Demo');
    expect(d.items.map(i => [i.id, i.estado, i.nota])).toEqual(o.items.map(i => [i.id, i.estado, i.nota]));
    expect(progreso(d.items)).toBe(progreso(o.items));
  });
  it('el link no lleva nombre, RUT ni teléfono; sí los montos del presupuesto, sin precios sugeridos', () => {
    const o = base(), s = empaquetar(o, 'Taller Demo'), d = desempaquetar(s)!;
    expect(d.cliente).toEqual({ nombre: '', rut: '', telefono: '' });
    expect(d.items.map(i => i.monto)).toEqual(o.items.map(i => i.monto));
    expect(d.items.every(i => !i.sugerido)).toBe(true);
    expect(JSON.stringify(d)).not.toMatch(/Carlos|12\.345|1234 5678/);
    expect(s.length).toBeLessThan(2500);
  });
  it('un link dañado no rompe el portal', () => {
    expect(desempaquetar('no-es-un-link')).toBeNull();
  });
  it('el mensaje dice qué se terminó, cuánto avanzó y trae el link', () => {
    globalThis.location = { origin: 'https://ejemplo.cl', pathname: '/desabolladura/' } as Location;
    const o = base(), it = o.items.find(i => i.estado !== 'listo')!, antes = progreso(o.items);
    const hecho = { ...it, estado: 'listo' as const, nota: 'Pieza nueva instalada y probada' };
    const nueva = { ...o, items: o.items.map(i => (i.id === it.id ? hecho : i)) };
    const m = mensajeAvance(nueva, hecho, antes, { nombre: 'Taller Demo' });
    expect(m).toContain('Hola Carlos');
    expect(m).toContain(`de ${antes}% a ${progreso(nueva.items)}%`);
    expect(m).toContain('«Pieza nueva instalada y probada»');
    expect(m).toMatch(/https:\/\/ejemplo\.cl\/desabolladura\/#\/cliente\/COR7X2\/[\w-]+$/);
  });
  it('el presupuesto por WhatsApp trae total, link y cómo aprobar', () => {
    globalThis.location = { origin: 'https://ejemplo.cl', pathname: '/desabolladura/' } as Location;
    const o = base(), m = mensajePresupuesto(o, { nombre: 'Taller Demo', whatsapp: '+56 9 8765 4321' });
    expect(m).toContain('Hola Carlos');
    expect(m).toContain(`*${clp(totales(o).total)}*`);
    expect(m).toContain('responda *Apruebo*');
    const link = m.match(/https:\/\/\S+/)![0];
    expect(desempaquetar(link.split('/').pop()!)!.wspTaller).toBe('56987654321');
    expect(mensajePresupuesto(o, { nombre: 'T', whatsapp: '' }, true)).toContain('sigue esperando su respuesta');
  });
});

describe('plazo en taller frente a la CMF', () => {
  it('cuenta días corridos desde el ingreso hasta hoy o hasta la entrega', () => {
    expect(diasEnTaller({ creada: '2026-11-01', entregadaEl: null }, '2026-11-09')).toBe(8);
    expect(diasEnTaller({ creada: '2026-11-01', entregadaEl: '2026-11-04' }, '2026-11-30')).toBe(3);
    expect(diasEnTaller({ creada: '2026-11-09', entregadaEl: null }, '2026-11-09')).toBe(0);
  });
  it('semáforo: verde bajo el 70 % del promedio, amarillo hasta el promedio, rojo sobre él', () => {
    expect(CMF_REPARACION.enTaller).toBeCloseTo(CMF_REPARACION.total - CMF_REPARACION.antesDelTaller, 5);
    expect(semaforoPlazo(5)).toBe('ok');
    expect(semaforoPlazo(18)).toBe('atento');
    expect(semaforoPlazo(30)).toBe('atrasado');
  });
});

describe('cobranza a compañías (Ley 19.983)', () => {
  const f = { numero: 9, emitida: '2026-10-01', monto: 500000 };
  it('vence a los 30 días corridos y calcula el estado', () => {
    expect(vencimiento(f)).toBe('2026-10-31');
    expect(estadoFactura(f, '2026-10-10')).toMatchObject({ estado: 'al_dia', dias: 21 });
    expect(estadoFactura(f, '2026-10-26')).toMatchObject({ estado: 'por_vencer', dias: 5 });
    expect(estadoFactura(f, '2026-11-10')).toMatchObject({ estado: 'vencida', dias: -10, comision: 500000 * COMISION_COBRANZA });
    expect(estadoFactura({ ...f, pagadaEl: '2026-11-04' })).toMatchObject({ estado: 'pagada', diasPago: 34, atrasoPagado: 4 });
  });
  it('una orden con seguro queda cobrada solo con factura pagada y deducible cobrado', () => {
    const o = ordenesDemo().find(x => x.numero === 1039)!;
    expect(cobradaSeguro(o)).toBe(false);
    const pagada = { ...o, factura: { ...o.factura!, pagadaEl: '2026-11-09' } };
    expect(cobradaSeguro(pagada)).toBe(false); // falta el deducible del asegurado
    expect(cobradaSeguro({ ...pagada, deducibleCobradoEl: '2026-11-09' })).toBe(true);
  });
  it('resume lo por cobrar, lo vencido y el promedio de pago por compañía', () => {
    const r = resumenCobranza(ordenesDemo());
    expect(r.abiertas.length).toBe(3);
    expect(r.nVencidas).toBe(1);
    expect(r.porCobrar).toBe(r.abiertas.reduce((a, x) => a + x.f.monto, 0));
    expect(r.abiertas[0].e.estado).toBe('vencida');
    expect(r.companias.find(c => c.nombre === 'Compañía Demo Norte')!.diasPromedio).toBe(38);
  });
  it('el recordatorio cita la ley, los días de atraso y la comisión', () => {
    const r = resumenCobranza(ordenesDemo());
    const correo = decodeURIComponent(correoRecordatorio(r.abiertas[0], 'Taller Demo'));
    expect(correo).toMatch(/^mailto:\?subject=Factura N\.º \d+/);
    expect(correo).toContain('Ley 19.983');
    expect(correo).toMatch(/registra \d+ días de atraso/);
    expect(correo).toContain('comisión de cobranza de 1 %');
  });
});

describe('visitante que ya abrió la demo', () => {
  it('recibe las facturas de ejemplo y las órdenes históricas nuevas sin perder sus cambios', () => {
    const vieja = ordenesDemo().filter(o => o.numero !== 1032 && o.numero !== 1033)
      .map(o => ({ ...o, factura: undefined, deducibleCobradoEl: null, notas: 'cambio del visitante' }));
    const nueva = conFotosDemo(vieja);
    expect(nueva.find(o => o.numero === 1039)!.factura?.numero).toBe(2206);
    expect(nueva.find(o => o.numero === 1039)!.notas).toBe('cambio del visitante');
    expect(nueva.some(o => o.numero === 1032) && nueva.some(o => o.numero === 1033)).toBe(true);
    expect(resumenCobranza(nueva).abiertas.length).toBe(3);
  });
  it('no pisa una factura que el visitante ya emitió o pagó', () => {
    const o = ordenesDemo().find(x => x.numero === 1039)!;
    const propia = { ...o, factura: { ...o.factura!, pagadaEl: '2026-11-09' } };
    expect(conFotosDemo([propia])[0].factura?.pagadaEl).toBe('2026-11-09');
  });
});

describe('control de repuestos', () => {
  const buscar = (n: number) => ordenesDemo().find(o => o.numero === n)!;
  const r = { id: 'r', itemId: 'i', nombre: 'Espejo derecho', estado: 'pedido' as const, proveedor: 'P', pedidoEl: '2026-11-01', prometido: '2026-11-05' };
  it('sabe si viene en camino, llega hoy, se atrasó o llegó tarde', () => {
    expect(estadoRepuesto(r, '2026-11-03')).toMatchObject({ estado: 'en_camino', faltan: 2 });
    expect(estadoRepuesto(r, '2026-11-05').estado).toBe('llega_hoy');
    expect(estadoRepuesto(r, '2026-11-08')).toMatchObject({ estado: 'atrasado', atraso: 3 });
    expect(estadoRepuesto({ ...r, estado: 'recibido', recibidoEl: '2026-11-07' })).toMatchObject({ estado: 'tarde', atraso: 2 });
    expect(estadoRepuesto({ ...r, estado: 'recibido', recibidoEl: '2026-11-04' }).estado).toBe('a_tiempo');
    // Si el proveedor movió la fecha, se le mide contra su primera promesa.
    expect(estadoRepuesto({ ...r, estado: 'recibido', prometido: '2026-11-12', prometidoInicial: '2026-11-05', recibidoEl: '2026-11-10' })).toMatchObject({ estado: 'tarde', atraso: 5 });
    expect(textoEstado(r, '2026-11-08')).toBe('Atrasado 3 días');
    expect(diasEntre('2026-11-01', '2026-11-05')).toBe(4);
  });
  it('un repuesto atrasado corre la fecha de entrega y nunca la adelanta', () => {
    const o = buscar(1041), rep = o.repuestos.find(x => x.proveedor)!;
    const lejos = sincronizar({ ...o, repuestos: o.repuestos.map(x => (x.id === rep.id ? { ...x, prometido: sumarHabiles(fechaLocal(), 15) } : x)) });
    expect(lejos.entrega > o.entrega).toBe(true);
    expect(sincronizar({ ...lejos, repuestos: o.repuestos }).entrega).toBe(lejos.entrega);
  });
  it('resume autos detenidos y el cumplimiento de cada proveedor', () => {
    const r2 = resumenRepuestos(ordenesDemo());
    expect(r2.atrasados).toBe(1);
    expect(r2.detenidos[0].o.numero).toBe(1041);
    expect(r2.filas[0].e.estado).toBe('atrasado');
    const norte = r2.proveedores.find(p => p.nombre === 'Repuestos Demo Norte')!;
    expect(norte).toMatchObject({ pedidos: 3, cumplimiento: 67, atrasoPromedio: .3 });
    expect(r2.proveedores.find(p => p.nombre === 'Autopartes Demo Centro')!.cumplimiento).toBe(0);
  });
  it('el aviso al cliente explica el atraso y trae la nueva fecha y el link', () => {
    globalThis.location = { origin: 'https://ejemplo.cl', pathname: '/desabolladura/' } as Location;
    const o = buscar(1041), rep = o.repuestos.find(x => x.proveedor)!, m = mensajeRepuesto(o, rep, { nombre: 'Taller Demo' });
    expect(m).toContain('*espejo derecho*');
    // Atrasado sin fecha nueva: no promete una fecha ya pasada.
    expect(m).toMatch(/Debía llegar el .+ y aún no lo recibimos/);
    expect(m).not.toContain('Ahora llega');
    const nueva = mensajeRepuesto(o, { ...rep, prometido: sumarHabiles(fechaLocal(), 4) }, { nombre: 'Taller Demo' });
    expect(nueva).toMatch(/Ahora llega el .+ nueva fecha estimada de entrega/);
    expect(m).toMatch(/https:\/\/ejemplo\.cl\/desabolladura\/#\/cliente\/F150RJ\//);
  });
});

describe('rentabilidad por orden', () => {
  const orden = (n: number) => ordenesDemo().find(o => o.numero === n)!;
  it('ganancia = cobrado neto − mano de obra − pintura e insumos − repuestos', () => {
    const o = orden(1042), r = rentabilidad(o, {});
    expect(r.ingreso).toBe(totales(o).neto);
    expect(r.manoObra).toBe(Math.round(r.horas * COSTO_HORA_DEFECTO));
    expect(r.ganancia).toBe(r.ingreso - r.manoObra - r.insumos - r.repuestos);
    expect(r.margen).toBe(Math.round((r.ganancia / r.ingreso) * 100));
  });
  it('usa las horas que anotó el maestro y el costo real del repuesto cuando existen', () => {
    const o = orden(1036), r = rentabilidad(o, {});
    expect(r.lineas.find(l => l.item.id === 'i1')!.horas).toBe(11);
    expect(r.repuestos).toBe(24000);
    expect(r.estimado).toBe(false);
    expect(r.semaforo).toBe('perdida');
  });
  it('el costo de la hora del taller cambia la cuenta', () => {
    const o = orden(1042);
    expect(rentabilidad(o, { costoHora: 10000 }).ganancia).toBeGreaterThan(rentabilidad(o, { costoHora: 20000 }).ganancia);
  });
  it('semáforo y estimados', () => {
    expect([semaforoMargen(35), semaforoMargen(20), semaforoMargen(5), semaforoMargen(-3)]).toEqual(['buena', 'justa', 'baja', 'perdida']);
    expect(horasEstimadas({ id: 'x', trabajo: 'pintura', pieza: 'capot', severidad: 'fuerte', estado: 'pendiente', monto: null })).toBe(8);
  });
  it('resumen: margen total, por trabajo y por quién paga; órdenes sin montos no cuentan', () => {
    const s = resumenRentabilidad(ordenesDemo(), {});
    expect(s.filas.some(x => x.o.numero === 1041)).toBe(false);
    expect(s.peores[0].o.numero).toBe(1036);
    expect(s.tipos[0].nombre).toBe('Desabolladura');
    expect(s.pagadores.at(-1)!.nombre).toBe('Compañía Demo Norte');
    expect(s.margen).toBe(Math.round((s.ganancia / s.ingreso) * 100));
  });
});

describe('los datos de ejemplo no dependen del día en que se abren', () => {
  afterAll(() => { vi.setSystemTime(HOY); });
  // Fin de febrero, cambio de año, fin de semana, madrugada y noche (cuando UTC ya cambió de día).
  const fechas = [new Date(2026, 10, 10, 9), new Date(2027, 1, 28, 23, 30), new Date(2028, 1, 29, 0, 30), new Date(2026, 11, 31, 22), new Date(2027, 0, 1, 1), new Date(2027, 3, 4, 12), new Date(2027, 8, 5, 12)];
  it.each(fechas)('cobranza, repuestos y alertas el %s', dia => {
    vi.setSystemTime(dia);
    const ordenes = ordenesDemo();
    const c = resumenCobranza(ordenes);
    expect(c.abiertas).toHaveLength(3);
    expect(c.nVencidas).toBe(1);
    const textos = alertas(ordenes).map(a => a.texto).join(' | ');
    expect(textos).toMatch(/factura N\.º 2204 vencida hace 14 días/);
    expect(textos).toMatch(/factura N\.º 2205 vence en 3 días/);
    expect(textos).toContain('espejo derecho atrasado 2 días');
    expect(textos).not.toMatch(/NaN|Invalid|undefined/);
  });
});
