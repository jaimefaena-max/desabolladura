import { deflateSync, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { inflateSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { anularHallazgo, nuevoHallazgo, UBICACIONES } from './hallazgos';
import { ordenesDemo } from './seed';
import type { Hallazgo } from './types';
import { desempaquetar, empaquetar } from './seguimiento';

/** Arma un link a mano, como lo haría alguien que quiere engañar al portal. */
const armar = (d: unknown) => {
  let s = '';
  deflateSync(strToU8(typeof d === 'string' ? d : JSON.stringify(d)), { level: 9 }).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const base = () => {
  const o = ordenesDemo().find(x => x.numero === 1042)!;
  return { ...o, vehiculo: { ...o.vehiculo, motor: '2GD4471823', chasis: 'DEMO0000000000000' } };
};
const bueno = () => ({
  t: 'Taller Demo', w: '+56 9 8765 4321', n: 1042, c: 'COR7X2', e: '2026-11-11', a: 'enviada', p: 'particular',
  v: { marca: 'Toyota', modelo: 'Corolla', anio: 2020, patente: 'DEMA22', color: 'Gris', colorHex: '#717f8b', carroceria: 'sedan' },
  vi: { frente: 'autos/toyota-corolla-2020-frente.webp' },
  i: [{ id: 'i0', trabajo: 'pintura', pieza: 'maletera', estado: 'listo', monto: 230000, nota: 'Lista' }],
});

describe('link de seguimiento: lo que viaja', () => {
  it('no lleva motor, chasis ni horas internas, y vuelve igual', () => {
    const o = base(), d = desempaquetar(empaquetar(o, 'Taller Demo', '+56 9 8765 4321'))!;
    expect(d.vehiculo.motor).toBeUndefined();
    expect(d.vehiculo.chasis).toBeUndefined();
    expect(JSON.stringify(d)).not.toMatch(/2GD4471823|DEMO0000000000000|"horas"/);
    expect(d.vehiculo).toMatchObject({ marca: o.vehiculo.marca, modelo: o.vehiculo.modelo, patente: o.vehiculo.patente, colorHex: o.vehiculo.colorHex });
    expect(d.vehiculo.ficha?.medidas).toEqual(o.vehiculo.ficha?.medidas);
    const clave = (i: typeof o.items[number]) => [i.id, i.trabajo, i.pieza, i.estado, i.monto, i.nota];
    expect(d.items.map(clave)).toEqual(o.items.map(clave));
    expect(d.vistas).toEqual(o.vistas);
    expect(d).toMatchObject({ taller: 'Taller Demo', wspTaller: '56987654321', codigo: o.codigo, entrega: o.entrega, aprobacion: o.aprobacion });
  });
  it('un link bien formado hecho a mano se acepta', () => {
    expect(desempaquetar(armar(bueno()))).toMatchObject({ codigo: 'COR7X2', wspTaller: '56987654321', items: [{ id: 'i0', monto: 230000 }] });
  });
});

describe('link de seguimiento: lo que se rechaza o se limpia', () => {
  const rotos: [string, unknown][] = [
    ['no es un objeto', [1, 2]],
    ['sin tareas', { ...bueno(), i: undefined }],
    ['tareas que no son lista', { ...bueno(), i: { length: 1 } }],
    ['tarea con trabajo inventado', { ...bueno(), i: [{ id: 'x', trabajo: 'robo', pieza: 'capot', estado: 'listo', monto: 1 }] }],
    ['tarea con pieza inventada', { ...bueno(), i: [{ id: 'x', trabajo: 'pintura', pieza: '__proto__', estado: 'listo', monto: 1 }] }],
    ['tarea con estado inventado', { ...bueno(), i: [{ id: 'x', trabajo: 'pintura', pieza: 'capot', estado: 'pagado', monto: 1 }] }],
    ['demasiadas tareas', { ...bueno(), i: Array.from({ length: 61 }, (_, k) => ({ id: `i${k}`, trabajo: 'pintura', pieza: 'capot', estado: 'listo', monto: 1 })) }],
    ['sin vehículo', { ...bueno(), v: null }],
    ['vehículo sin año', { ...bueno(), v: { marca: 'X', modelo: 'Y' } }],
    ['código con símbolos', { ...bueno(), c: '<script>' }],
    ['fecha de entrega inválida', { ...bueno(), e: 'mañana' }],
    ['de otra versión', { version: 2, datos: {} }],
  ];
  it.each(rotos)('%s: el link completo no vale', (_n, d) => {
    expect(desempaquetar(armar(d))).toBeNull();
  });
  it('texto que no es un link, JSON roto o un link gigante', () => {
    expect(desempaquetar('no-es-un-link')).toBeNull();
    expect(desempaquetar('')).toBeNull();
    expect(desempaquetar(armar('{"t":'))).toBeNull();
    expect(desempaquetar('A'.repeat(8001))).toBeNull();
    // Bomba de compresión: pocos bytes que se inflan a varios megas.
    expect(desempaquetar(armar({ ...bueno(), t: 'x'.repeat(3_000_000) }))).toBeNull();
  });
  it('un WhatsApp, un color o un monto raros no pasan al portal', () => {
    const d = desempaquetar(armar({
      ...bueno(), t: 'T'.repeat(500), w: 'javascript:alert(1)', n: 'mil', a: 'regalada', p: 'nadie',
      v: {
        ...bueno().v, colorHex: 'url(//malo)', carroceria: 'nave', motor: 'M1X', chasis: 'C1X',
        ficha: { generacion: 'G', rasgos: 'secreto', medidas: { largo: 99, ancho: 1, alto: 1, entreEjes: 1 }, modelo3d: { url: 'https://malo.example/x.glb' }, fuentes: ['https://malo.example'] },
      },
      i: [{ ...bueno().i[0], monto: -5, sugerido: { min: 1, max: 2, fuente: 'x' }, horas: 9, terminadoEl: 'ayer', nota: 'n'.repeat(900) }],
    }))!;
    expect(d.taller).toHaveLength(60);
    expect(d).toMatchObject({ wspTaller: '', numero: 0, aprobacion: 'pendiente', pagador: { tipo: 'particular' } });
    expect(d.vehiculo).toMatchObject({ colorHex: '#8a8f96', carroceria: 'sedan' });
    expect(d.vehiculo.ficha).toEqual({ generacion: 'G', rasgos: '' });
    expect(JSON.stringify(d)).not.toMatch(/malo\.example|M1X|C1X|secreto|sugerido|horas/);
    expect(d.items[0]).toMatchObject({ monto: null });
    expect(d.items[0].terminadoEl).toBeUndefined();
    expect(d.items[0].nota).toHaveLength(300);
  });
  it('las fotos y el modelo 3D solo pueden ser archivos del propio sitio', () => {
    const con = (vi: unknown, url: unknown) => desempaquetar(armar({ ...bueno(), vi, v: { ...bueno().v, ficha: { generacion: 'G', modelo3d: { url, giro: 90 } } } }))!;
    const malo = con({ frente: 'https://malo.example/a.webp', lado: '//malo.example/a.webp', cola: 'data:image/png;base64,AAAA', otra: 'autos/x.webp' }, '../../x.glb');
    expect(malo.vistas).toEqual({});
    expect(malo.vehiculo.ficha?.modelo3d).toBeUndefined();
    const sano = con({ frente: 'autos/a.webp', lado: 'autos/b.JPG' }, 'autos/modelo.glb');
    expect(sano.vistas).toEqual({ frente: 'autos/a.webp', lado: 'autos/b.JPG' });
    expect(sano.vehiculo.ficha?.modelo3d).toEqual({ url: 'autos/modelo.glb', giro: 90 });
  });
});

/** Contenido del link en claro, para revisar que no se cuele nada privado. */
const abrir = (link: string) => strFromU8(inflateSync(Uint8Array.from(atob(link.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
const azar = (n: number) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

describe('link de seguimiento: acta de recepción', () => {
  const dano = nuevoHallazgo({ tipo: 'dano', categoria: 'Rayón', ubicacion: 'Capot', detalle: 'rayón largo cerca del foco', fotos: ['fotodano1'], autor: 'Ana Demo', noRepara: true }, 'hd1');
  const objeto = nuevoHallazgo({ tipo: 'objeto', categoria: 'Dinero', ubicacion: 'Guantera', detalle: 'billetera con documentos', fotos: ['fotoobj1'], autor: 'Ana Demo', resguardo: 'vehiculo', devueltoEl: null }, 'ho1');

  it('viaja el daño (sin detalle ni autor) y el objeto (sin qué ni dónde); lo anulado no viaja', () => {
    const anulado = nuevoHallazgo({ ...dano, detalle: 'anulado' }, 'hx1');
    const o = anularHallazgo({ ...base(), hallazgos: [dano, objeto, anulado], conformidadRecepcion: '2026-11-19T12:00:00.000Z' }, 'hx1', 'Jefe', 'duplicado');
    const link = empaquetar({ ...o, conformidadRecepcion: '2026-11-19T12:00:00.000Z' }, 'Taller Demo');
    const claro = abrir(link);
    for (const x of ['Ana Demo', 'rayón largo', 'billetera', 'fotodano1', 'fotoobj1', 'Dinero', 'Guantera', 'vehiculo', 'hx1', 'duplicado']) expect(claro).not.toContain(x);
    const d = desempaquetar(link)!;
    expect(d.actaEnTaller).toBe(false);
    expect(d.conformidadRecepcion).toBe('2026-11-19T12:00:00.000Z');
    expect(d.hallazgos).toEqual([
      expect.objectContaining({ id: 'hd1', tipo: 'dano', categoria: 'Rayón', ubicacion: 'Capot', noRepara: true, fotosEnTaller: 1, detalle: '', autor: '' }),
      expect.objectContaining({ id: 'ho1', tipo: 'objeto', categoria: '', ubicacion: '', fotosEnTaller: 1 }),
    ]);
  });

  it('un link sin acta (como los de antes) sigue abriendo, sin hallazgos', () => {
    const d = desempaquetar(empaquetar({ ...base(), hallazgos: [] }, 'Taller Demo'))!;
    expect(d.hallazgos).toEqual([]);
    expect(d.actaEnTaller).toBe(false);
  });

  it('un acta mal formada se descarta sola: el resto del link sigue válido', () => {
    const paquete = JSON.parse(abrir(empaquetar({ ...base(), hallazgos: [dano] }, 'Taller Demo')));
    paquete.h.push({ i: 'malo', t: 'd', c: 'Explosión', u: 'Capot', f: 0, r: '2026-11-19T10:00:00Z' });
    const d = desempaquetar(armar(paquete))!;
    expect(d).not.toBeNull();
    expect(d.items.length).toBeGreaterThan(0);
    expect(d.hallazgos).toEqual([]);
    expect(d.actaEnTaller).toBe(true);
  });

  it('30 hallazgos al máximo caben en el link', () => {
    const largo = [...UBICACIONES.dano].sort((a, b) => b.length - a.length)[0];
    const hs: Hallazgo[] = Array.from({ length: 30 }, () => nuevoHallazgo({ tipo: 'dano', categoria: 'Pieza suelta o rota', ubicacion: largo, detalle: azar(300), fotos: ['a', 'b', 'c'], autor: 'Ana', noRepara: true }, azar(20)));
    const link = empaquetar({ ...base(), hallazgos: hs }, 'Taller Demo');
    expect(link.length).toBeLessThanOrEqual(8000);
    const d = desempaquetar(link)!;
    expect(d.hallazgos).toHaveLength(30);
  });

  it('si el acta no cabe, no se recorta: el link dice que está en el taller y no lleva conformidad', () => {
    const o = { ...base(), hallazgos: [dano, objeto], conformidadRecepcion: '2026-11-19T12:00:00.000Z' };
    const limite = empaquetar({ ...base(), hallazgos: [] }, 'Taller Demo').length + 10;
    const link = empaquetar(o, 'Taller Demo', '', limite);
    const paquete = JSON.parse(abrir(link));
    expect(paquete.h).toBeUndefined();
    expect(paquete.k).toBeUndefined();
    const d = desempaquetar(link)!;
    expect(d.actaEnTaller).toBe(true);
    expect(d.hallazgos).toEqual([]);
    expect(d.conformidadRecepcion).toBeNull();
  });
});
