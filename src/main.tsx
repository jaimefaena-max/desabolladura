import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/outfit';
import './styles.css';
import { AvisoSinGuardar, Barrera } from './components/Errores';
import { ir } from './components/ui';
import { aplicarMarca, sesion, useEmpresa } from './lib/store';
import Landing from './pages/Landing';

/*
 * Cada perfil baja solo sus pantallas: la portada no carga el código del administrador ni del
 * trabajador. Si el archivo no llega (versión nueva publicada con la pestaña abierta), se reintenta
 * una vez recargando la página; si vuelve a fallar, lo toma la barrera de errores.
 */
const cargar = <T,>(f: () => Promise<T>) => () => f().catch(e => {
  const clave = 'dp.recarga', ahora = Date.now();
  let previa = 0;
  try { previa = Number(sessionStorage.getItem(clave)); sessionStorage.setItem(clave, String(ahora)); } catch { /* sin almacenamiento */ }
  if (ahora - previa > 30_000) { location.reload(); return new Promise<T>(() => {}); }
  throw e;
});
const admin = cargar(() => import('./pages/Admin'));
const maestro = cargar(() => import('./pages/Maestro'));
const cliente = cargar(() => import('./pages/Cliente'));
const Tablero = lazy(() => admin().then(m => ({ default: m.Tablero })));
const Ordenes = lazy(() => admin().then(m => ({ default: m.Ordenes })));
const Reportes = lazy(() => admin().then(m => ({ default: m.Reportes })));
const Ajustes = lazy(() => admin().then(m => ({ default: m.Ajustes })));
const AdminOrden = lazy(() => admin().then(m => ({ default: m.AdminOrden })));
const Repuestos = lazy(() => cargar(() => import('./pages/Repuestos'))().then(m => ({ default: m.Repuestos })));
const Cobranza = lazy(() => cargar(() => import('./pages/Cobranza'))().then(m => ({ default: m.Cobranza })));
const ClienteAcceso = lazy(() => cliente().then(m => ({ default: m.ClienteAcceso })));
const ClientePortal = lazy(() => cliente().then(m => ({ default: m.ClientePortal })));
const Login = lazy(cargar(() => import('./pages/Login')));
const MaestroInicio = lazy(() => maestro().then(m => ({ default: m.MaestroInicio })));
const MaestroOrden = lazy(() => maestro().then(m => ({ default: m.MaestroOrden })));
const NuevoVehiculo = lazy(cargar(() => import('./pages/NuevoVehiculo')));

function Cargando() {
  return <div className="cargando-pantalla" role="status" aria-label="Cargando"><span className="esqueleto" /></div>;
}

const useRuta = () => useSyncExternalStore(
  f => { addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); },
  () => location.hash.replace(/^#/, '') || '/',
);

function Guardia({ rol, children }: { rol: 'maestro' | 'admin'; children: React.ReactNode }) {
  const u = sesion();
  const ok = u?.rol === rol;
  useEffect(() => { if (!ok) ir('/entrar'); }, [ok]);
  return ok ? <>{children}</> : null;
}

function Franja() {
  return <p className="demo-franja">Demostración: no ingreses datos reales. Los datos se guardan en este navegador.</p>;
}

function Rutas() {
  const ruta = useRuta();
  const empresa = useEmpresa();
  useEffect(() => { aplicarMarca(empresa); document.title = `${empresa.nombre} | Desabolladura Premium`; }, [empresa]);
  useEffect(() => { scrollTo(0, 0); }, [ruta]);
  const p = ruta.split('/').filter(Boolean);

  if (p[0] === 'entrar') return <Login />;
  if (p[0] === 'cliente') return p[1] ? <ClientePortal key={p[1]} codigo={p[1]} instantanea={p[2]} /> : <ClienteAcceso />;
  if (p[0] === 'maestro') {
    return (
      <Guardia rol="maestro">
        {p[1] === 'nuevo' ? <NuevoVehiculo /> : p[1] === 'ot' && p[2] ? <MaestroOrden key={p[2]} id={p[2]} /> : <MaestroInicio />}
      </Guardia>
    );
  }
  if (p[0] === 'admin') {
    return (
      <Guardia rol="admin">
        {p[1] === 'ajustes' ? <Ajustes /> : p[1] === 'ordenes' ? <Ordenes /> : p[1] === 'repuestos' ? <Repuestos /> : p[1] === 'reportes' ? <Reportes /> : p[1] === 'cobranza' ? <Cobranza /> : p[1] === 'ot' && p[2] ? <AdminOrden key={p[2]} id={p[2]} /> : <Tablero />}
      </Guardia>
    );
  }
  return <Landing />;
}

function App() {
  const ruta = useRuta();
  return <><Franja /><AvisoSinGuardar /><Barrera clave={ruta}><Suspense fallback={<Cargando />}><Rutas /></Suspense></Barrera></>;
}

createRoot(document.getElementById('root')!).render(<App />);
