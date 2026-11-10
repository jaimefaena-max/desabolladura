/**
 * Prueba de humo: cada pantalla de los tres perfiles se dibuja completa, sin errores y sin textos
 * rotos (NaN, «Invalid Date», «undefined»). Corre en cada push antes de publicar.
 * Se dibuja a texto con react-dom/server: sin navegador, sin dependencias extra. El 3D queda en su
 * esqueleto de carga (se prueba a mano y con el checklist).
 */
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

const sesion = new Map<string, string>();
const almacen = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } });

// Antes de importar la app: el almacén toma el navegador (simulado) al cargarse.
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date(2026, 10, 5, 12));
vi.stubGlobal('localStorage', almacen(new Map()));
vi.stubGlobal('sessionStorage', almacen(sesion));
vi.stubGlobal('location', { hash: '#/', origin: 'https://ejemplo.cl', pathname: '/desabolladura/', search: '' });
vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
afterAll(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

/** Texto visible de la pantalla (sin etiquetas ni comentarios de React). */
function dibujar(el: ReactElement, rol?: 'admin' | 'trabajador', ruta = '/') {
  if (rol) sesion.set('dp.sesion', rol); else sesion.delete('dp.sesion');
  (globalThis.location as { hash: string }).hash = `#${ruta}`;
  const html = renderToString(el);
  return html.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

const roto = /NaN|Invalid Date|\bundefined\b|\bnull\b|\[object Object\]|Infinity/;

describe('cada pantalla se dibuja completa', async () => {
  const { default: Landing } = await import('./pages/Landing');
  const { default: Login } = await import('./pages/Login');
  const { Tablero, Ordenes, Reportes, Ajustes, AdminOrden } = await import('./pages/Admin');
  const { Repuestos } = await import('./pages/Repuestos');
  const { Cobranza } = await import('./pages/Cobranza');
  const { MaestroInicio, MaestroOrden } = await import('./pages/Maestro');
  const { default: NuevoVehiculo } = await import('./pages/NuevoVehiculo');
  const { ClienteAcceso, ClientePortal } = await import('./pages/Cliente');
  const { instantanea } = await import('./lib/store');
  const { empaquetar } = await import('./lib/seguimiento');
  const ordenes = instantanea().ordenes;

  const pantallas: [string, () => ReactElement, 'admin' | 'trabajador' | undefined, RegExp][] = [
    ['portada', () => <Landing />, undefined, /Tu taller, en piloto automático/],
    ['entrar', () => <Login />, undefined, /Demo Administrador.*Demo Trabajador.*Demo Cliente/],
    ['tablero', () => <Tablero />, 'admin', /Tablero del taller/],
    ['órdenes', () => <Ordenes />, 'admin', /Órdenes.*Orden 1041/],
    ['repuestos', () => <Repuestos />, 'admin', /Repuestos/],
    ['cobranza', () => <Cobranza />, 'admin', /Cobranza.*2204/],
    ['reportes', () => <Reportes />, 'admin', /Reportes/],
    ['ajustes', () => <Ajustes />, 'admin', /Ajustes/],
    ['orden inexistente (admin)', () => <AdminOrden id="NOEXISTE" />, 'admin', /Orden no encontrada/],
    ['inicio del trabajador', () => <MaestroInicio />, 'trabajador', /Mis vehículos/],
    ['ingresar vehículo', () => <NuevoVehiculo />, 'trabajador', /Ingresar vehículo.*padrón de ejemplo/],
    ['orden inexistente (trabajador)', () => <MaestroOrden id="NOEXISTE" />, 'trabajador', /Orden no encontrada/],
    ['acceso cliente', () => <ClienteAcceso />, undefined, /Cómo va mi auto/],
    ['portal demo', () => <ClientePortal codigo="demo" />, undefined, /Tareas para llegar al 100%/],
    ['código malo', () => <ClientePortal codigo="CODIGOMALO" />, undefined, /No encontramos ese seguimiento/],
    ['link dañado', () => <ClientePortal codigo="X" instantanea="basura" />, undefined, /No encontramos ese seguimiento/],
  ];
  it.each(pantallas)('%s', (_n, el, rol, espera) => {
    const texto = dibujar(el(), rol);
    expect(texto).toMatch(espera);
    expect(texto).not.toMatch(roto);
  });

  it.each(ordenes.map(o => [o.numero, o] as const))('orden %s en los tres perfiles y por link', (_n, o) => {
    for (const [el, rol] of [[<AdminOrden id={o.id} />, 'admin'], [<MaestroOrden id={o.id} />, 'trabajador'], [<ClientePortal codigo={o.codigo} />, undefined]] as const) {
      const texto = dibujar(el, rol);
      expect(texto).toContain(o.vehiculo.modelo);
      expect(texto).not.toMatch(roto);
    }
    const porLink = dibujar(<ClientePortal codigo={o.codigo} instantanea={empaquetar(o, 'Taller Demo', '+56 9 1111 1111')} />);
    expect(porLink).toMatch(/Copia del avance que envió Taller Demo/);
    expect(porLink).not.toMatch(roto);
  });
});

// Va al final: revisa los íconos que se dibujaron en todas las pantallas de arriba.
describe('íconos', () => {
  it('ninguno pide un grosor que no se generó (scripts/generar-iconos.ts)', async () => {
    const { faltantes } = await import('./components/iconos');
    expect([...faltantes]).toEqual([]);
  });
});
