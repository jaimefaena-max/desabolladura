import { useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/outfit';
import './styles.css';
import { ir } from './components/ui';
import { aplicarMarca, sesion, useEmpresa } from './lib/store';
import { AdminOrden, Ajustes, Ordenes, Reportes, Repuestos, Tablero } from './pages/Admin';
import { Cobranza } from './pages/Cobranza';
import { ClienteAcceso, ClientePortal } from './pages/Cliente';
import Landing from './pages/Landing';
import Login from './pages/Login';
import { MaestroInicio, MaestroOrden } from './pages/Maestro';
import NuevoVehiculo from './pages/NuevoVehiculo';

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
  return <p className="demo-franja">Demostración: no ingreses datos reales. Todo queda solo en este navegador.</p>;
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

createRoot(document.getElementById('root')!).render(<><Franja /><Rutas /></>);
