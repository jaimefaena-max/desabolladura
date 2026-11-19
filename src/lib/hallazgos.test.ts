import { describe, expect, it } from 'vitest';
import {
  agregarHallazgo, anularHallazgo, CATEGORIAS, darConformidad, hallazgoAlLink, hallazgoDelLink, marcarDevuelto, MAX_HALLAZGOS,
  mensajeObjeto, nuevoHallazgo, objetosPorDevolver, puedeEntregar, repararHallazgo, resumenHallazgo, UBICACIONES, vigentes,
} from './hallazgos';
import { conFotosDemo, ordenesDemo } from './seed';
import type { Hallazgo, Orden } from './types';

const base = (): Orden => ({ ...ordenesDemo()[0], hallazgos: [], conformidadRecepcion: null, historial: [] });
const dano = (id = 'd1'): Hallazgo => nuevoHallazgo({ tipo: 'dano', categoria: 'Rayón', ubicacion: 'Capot', detalle: 'rayón de 10 cm', fotos: ['fd1'], autor: 'Ana', noRepara: true }, id);
const objeto = (id = 'o1'): Hallazgo => nuevoHallazgo({ tipo: 'objeto', categoria: 'Cartera o bolso', ubicacion: 'Guantera', detalle: 'cartera negra', fotos: ['fo1', 'fo2'], autor: 'Ana', resguardo: 'taller', devueltoEl: null }, id);

describe('alta de hallazgos', () => {
  it('agrega con evento privado y el nombre de quien lo registró', () => {
    const o = agregarHallazgo(base(), dano());
    expect(o.hallazgos).toHaveLength(1);
    expect(o.historial[0]).toMatchObject({ texto: 'Hallazgo registrado por Ana: Rayón en Capot', privado: true });
  });
  it('respeta el tope de hallazgos por orden', () => {
    let o = base();
    for (let k = 0; k < MAX_HALLAZGOS + 2; k++) o = agregarHallazgo(o, dano(`d${k}`));
    expect(o.hallazgos).toHaveLength(MAX_HALLAZGOS);
  });
  it('recorta el detalle a 300 caracteres', () => {
    expect(nuevoHallazgo({ ...dano(), detalle: 'x'.repeat(500) }, 'z1').detalle).toHaveLength(300);
  });
});

describe('conformidad del cliente', () => {
  it('se registra con quién la anotó, como evento privado', () => {
    const o = darConformidad(agregarHallazgo(base(), dano()), 'Jefe Demo');
    expect(o.conformidadRecepcion).toBeTruthy();
    expect(o.historial[0]).toMatchObject({ texto: 'Conformidad del cliente al acta de recepción (respuesta por WhatsApp), registrada por Jefe Demo', privado: true });
  });
  it('un hallazgo nuevo la anula y el evento lo dice', () => {
    const o = agregarHallazgo(darConformidad(agregarHallazgo(base(), dano()), 'Jefe'), objeto());
    expect(o.conformidadRecepcion).toBeNull();
    expect(o.historial[0].texto).toMatch(/ · conformidad anterior anulada$/);
  });
  it('anular un hallazgo la anula y el evento lo dice', () => {
    const o = anularHallazgo(darConformidad(agregarHallazgo(base(), dano()), 'Jefe'), 'd1', 'Jefe', 'mal registrado');
    expect(o.conformidadRecepcion).toBeNull();
    expect(o.historial[0].texto).toBe('Hallazgo anulado por Jefe: Rayón en Capot · motivo: mal registrado · conformidad anterior anulada');
  });
  it('sin conformidad previa, el evento no lleva el sufijo', () => {
    expect(agregarHallazgo(base(), dano()).historial[0].texto).not.toMatch(/conformidad/);
  });
});

describe('anulación: la evidencia no se borra', () => {
  it('sin motivo no cambia nada', () => {
    const o = agregarHallazgo(base(), dano());
    expect(anularHallazgo(o, 'd1', 'Jefe', '   ')).toBe(o);
  });
  it('con motivo queda anulado, conserva sus fotos y sale de los vigentes', () => {
    const o = anularHallazgo(agregarHallazgo(base(), dano()), 'd1', 'Jefe', 'duplicado');
    expect(o.hallazgos![0]).toMatchObject({ anulado: { por: 'Jefe', motivo: 'duplicado' }, fotos: ['fd1'] });
    expect(vigentes(o)).toHaveLength(0);
  });
});

describe('devolución de objetos y entrega', () => {
  it('solo los objetos vigentes sin devolver bloquean la entrega', () => {
    let o = agregarHallazgo(agregarHallazgo(base(), dano()), objeto());
    expect(objetosPorDevolver(o).map(h => h.id)).toEqual(['o1']);
    expect(puedeEntregar(o)).toBe(false);
    const r = marcarDevuelto(o, 'o1');
    expect(r.fotos).toEqual(['fo1', 'fo2']);
    expect(r.orden.hallazgos!.find(h => h.id === 'o1')).toMatchObject({ fotos: [] });
    expect(r.orden.hallazgos!.find(h => h.id === 'o1')!.devueltoEl).toBeTruthy();
    expect(r.orden.historial[0]).toMatchObject({ texto: 'Objeto de valor devuelto; fotos borradas', privado: true });
    expect(puedeEntregar(r.orden)).toBe(true);
    o = anularHallazgo(agregarHallazgo(base(), objeto('o2')), 'o2', 'Jefe', 'no era del cliente');
    expect(puedeEntregar(o)).toBe(true);
  });
  it('marcar devuelto un daño no hace nada', () => {
    const o = agregarHallazgo(base(), dano());
    expect(marcarDevuelto(o, 'd1')).toEqual({ orden: o, fotos: [] });
  });
});

describe('aviso por WhatsApp de un objeto', () => {
  it('es genérico: no dice qué objeto ni dónde', () => {
    const m = mensajeObjeto({ nombre: 'Taller Demo' });
    expect(m).toContain('Taller Demo');
    for (const x of [...CATEGORIAS.objeto, ...UBICACIONES.objeto]) expect(m).not.toContain(x);
  });
});

describe('hallazgos en el link del cliente', () => {
  it('un daño viaja sin autor, detalle ni ids de fotos', () => {
    const l = hallazgoAlLink(dano());
    expect(JSON.stringify(l)).not.toMatch(/Ana|rayón de 10|fd1/);
    expect(hallazgoDelLink(l)).toMatchObject({ tipo: 'dano', categoria: 'Rayón', ubicacion: 'Capot', noRepara: true, fotosEnTaller: 1, detalle: '', autor: '', fotos: [] });
  });
  it('un objeto viaja sin qué ni dónde', () => {
    const l = hallazgoAlLink(objeto());
    expect(JSON.stringify(l)).not.toMatch(/Cartera|Guantera|taller|cartera/);
    expect(hallazgoDelLink(l)).toMatchObject({ tipo: 'objeto', categoria: '', ubicacion: '', fotosEnTaller: 2 });
    expect(resumenHallazgo(hallazgoDelLink(l)!)).toBe('Objeto de valor');
  });
  it.each([
    ['categoría fuera de lista', { ...hallazgoAlLink(dano()), c: 'Explosión' }],
    ['ubicación fuera de lista', { ...hallazgoAlLink(dano()), u: 'Motor' }],
    ['«no se repara» en un objeto', { ...hallazgoAlLink(objeto()), n: 1 }],
    ['categoría en un objeto', { ...hallazgoAlLink(objeto()), c: 'Dinero' }],
    ['4 fotos', { ...hallazgoAlLink(dano()), f: 4 }],
    ['id con símbolos', { ...hallazgoAlLink(dano()), i: '<img>' }],
    ['fecha inválida', { ...hallazgoAlLink(dano()), r: 'ayer' }],
    ['tipo desconocido', { ...hallazgoAlLink(dano()), t: 'x' }],
  ])('rechaza %s', (_n, x) => { expect(hallazgoDelLink(x)).toBeNull(); });
});

describe('saneo de lo guardado', () => {
  it('descarta lo que no tiene la forma mínima', () => {
    expect(repararHallazgo({})).toBeNull();
    expect(repararHallazgo(null)).toBeNull();
    expect(repararHallazgo({ id: 'a1', tipo: 'dano' })).toBeNull();
  });
  it('completa los campos que faltan y el resumen no dice «undefined»', () => {
    const h = repararHallazgo({ id: 'a1', tipo: 'dano', creado: '2026-11-19T10:00:00Z', fotos: 'x' })!;
    expect(h).toMatchObject({ fotos: [], categoria: '', ubicacion: '', detalle: '', autor: '' });
    expect(resumenHallazgo(h)).toBe('Daño');
  });
});

describe('acta de ejemplo de la demo', () => {
  it('COR7X2 trae un daño preexistente de ejemplo', () => {
    const cor = ordenesDemo().find(o => o.codigo === 'COR7X2')!;
    expect(cor.hallazgos).toEqual([expect.objectContaining({ id: 'demoh1', tipo: 'dano', categoria: 'Rayón', ubicacion: 'Parachoque delantero', noRepara: true })]);
  });
  it('llega también a quien ya tenía la demo guardada, salvo que haya anulado hallazgos', () => {
    const cor = ordenesDemo().find(o => o.codigo === 'COR7X2')!;
    const vieja = { ...cor, hallazgos: [] };
    expect(conFotosDemo([vieja])[0].hallazgos!.map(h => h.id)).toEqual(['demoh1']);
    const conAnulacion = { ...vieja, historial: [{ fecha: '2026-11-19T10:00:00Z', texto: 'Hallazgo anulado por Jefe: Rayón en Parachoque delantero · motivo: x', privado: true as const }, ...vieja.historial] };
    expect(conFotosDemo([conAnulacion])[0].hallazgos).toEqual([]);
  });
});
