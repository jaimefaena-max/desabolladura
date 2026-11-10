import { afterEach, describe, expect, it, vi } from 'vitest';
import { ordenesDemo } from './seed';

/** Almacén de navegador simulado: puede venir con datos dañados, lleno o bloqueado. */
function almacenFalso(inicial: Record<string, string> = {}, modo: 'normal' | 'lleno' | 'bloqueado' = 'normal') {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k: string) => { if (modo === 'bloqueado') throw new Error('SecurityError'); return datos.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (modo !== 'normal') throw new Error('QuotaExceededError'); datos.set(k, v); },
    removeItem: (k: string) => { datos.delete(k); },
  };
}

async function arrancar(local: unknown, sesion: unknown = almacenFalso()) {
  vi.resetModules();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', sesion);
  return import('./store');
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('la demostración arranca aunque lo guardado esté dañado', () => {
  const basura = ['null', '{}', '[]', '{', '5', '"texto"', '[null]', '[{"id":1}]', '[[]]', 'true'];
  it.each(basura)('empresas guardadas como %s', async valor => {
    const s = await arrancar(almacenFalso({ 'dp.empresas.v2': valor, 'dp.empresa.actual': 'no-existe' }));
    expect(s.instantanea().actual).toMatchObject({ id: 'demo', nombre: 'Taller Demo' });
    expect(s.instantanea().ordenes.length).toBeGreaterThan(0);
  });
  it.each(basura)('órdenes guardadas como %s', async valor => {
    const s = await arrancar(almacenFalso({ 'dp.ordenes.v2.demo': valor }));
    const { ordenes } = s.instantanea();
    expect(ordenes.length).toBeGreaterThan(0);
    expect(ordenes.every(o => Array.isArray(o.items) && Array.isArray(o.repuestos) && Array.isArray(o.historial) && !!o.vehiculo)).toBe(true);
    expect(s.siguienteNumero()).toBeGreaterThan(1000);
  });
  it('un color de marca inválido vuelve al de fábrica', async () => {
    const s = await arrancar(almacenFalso({ 'dp.empresas.v2': JSON.stringify([{ id: 'x', nombre: 'Taller X', acento: 'javascript:alert(1)' }]) }));
    expect(s.instantanea().actual).toMatchObject({ id: 'x', acento: '#ff7a2f', whatsapp: '' });
  });
  it('una orden de una versión anterior, sin sus listas, se completa y no se pierde', async () => {
    const { repuestos: _r, historial: _h, fotos: _f, ...vieja } = { ...ordenesDemo()[0], notas: 'cambio del visitante' };
    const s = await arrancar(almacenFalso({ 'dp.ordenes.v2.demo': JSON.stringify([vieja, { roto: true }]) }));
    const o = s.instantanea().ordenes.find(x => x.id === vieja.id)!;
    expect(o).toMatchObject({ notas: 'cambio del visitante', repuestos: [], historial: [], fotos: [] });
  });
});

describe('guardar no se cae si el navegador no deja', () => {
  it('sin espacio: la orden queda en memoria y se avisa', async () => {
    const s = await arrancar(almacenFalso({}, 'lleno'));
    const nueva = { ...ordenesDemo()[0], id: 'nueva', numero: 2000 };
    expect(() => s.guardarOrden(nueva)).not.toThrow();
    expect(s.instantanea().sinGuardar).toBe(true);
    expect(s.instantanea().ordenes[0].id).toBe('nueva');
    expect(() => s.editarEmpresa({ nombre: 'Otro nombre' })).not.toThrow();
    expect(s.instantanea().actual.nombre).toBe('Otro nombre');
  });
  it('almacenamiento bloqueado: la app funciona en memoria, con sesión incluida', async () => {
    const s = await arrancar(almacenFalso({}, 'bloqueado'), almacenFalso({}, 'bloqueado'));
    expect(s.instantanea().ordenes.length).toBeGreaterThan(0);
    expect(s.entrarDemo('admin').rol).toBe('admin');
    expect(s.sesion()?.id).toBe('admin');
    s.cerrarSesion();
    expect(s.sesion()).toBeNull();
  });
  it('sin almacenamiento en absoluto (el acceso mismo lanza)', async () => {
    vi.resetModules();
    const lanza = { configurable: true, get() { throw new Error('SecurityError'); } };
    Object.defineProperty(globalThis, 'localStorage', lanza);
    Object.defineProperty(globalThis, 'sessionStorage', lanza);
    try {
      const s = await import('./store');
      expect(s.instantanea().actual.id).toBe('demo');
      expect(() => s.restablecerDemo()).not.toThrow();
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
      Reflect.deleteProperty(globalThis, 'sessionStorage');
    }
  });
  it('un guardado normal queda escrito y sin aviso', async () => {
    const local = almacenFalso();
    const s = await arrancar(local);
    s.guardarOrden({ ...ordenesDemo()[0], id: 'a', numero: 2001 });
    expect(s.instantanea().sinGuardar).toBe(false);
    expect(JSON.parse(local.datos.get('dp.ordenes.v2.demo')!)[0].id).toBe('a');
  });
});
