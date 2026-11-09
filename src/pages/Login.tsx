import { ArrowRight, Briefcase, Car, Wrench } from '@phosphor-icons/react';
import { ir, Marca } from '../components/ui';
import { entrarDemo } from '../lib/store';
import type { Usuario } from '../lib/types';

/** El cliente no tiene sesión: entra directo al seguimiento de un auto de prueba. */
const PERFILES: { rol?: Usuario['rol']; titulo: string; detalle: string; destino: string; Icono: typeof Wrench }[] = [
  { rol: 'admin', titulo: 'Demo Administrador', detalle: 'Tablero, órdenes, precios, cobros y reportes', destino: '/admin', Icono: Briefcase },
  { rol: 'maestro', titulo: 'Demo Trabajador', detalle: 'Ingresar vehículos, marcar daños y avance', destino: '/maestro', Icono: Wrench },
  { titulo: 'Demo Cliente', detalle: 'Seguir el avance de su auto en 3D y aprobar', destino: '/cliente/demo', Icono: Car },
];

export default function Login() {
  return (
    <div className="login">
      <header className="login-top"><Marca onClick={() => ir('/')} /></header>
      <main className="login-caja">
        <h1>Entrar a la demo</h1>
        <p className="sub">Elige un perfil. No necesitas usuario ni clave.</p>
        <div className="perfiles">
          {PERFILES.map(({ rol, titulo, detalle, destino, Icono }) => (
            <button key={titulo} className="perfil" onClick={() => { if (rol) entrarDemo(rol); ir(destino); }}>
              <span className="avatar claro" aria-hidden="true"><Icono size={32} weight="duotone" /></span>
              <span><b>{titulo}</b><small>{detalle}</small></span>
              <ArrowRight size={24} className="perfil-flecha" aria-hidden="true" />
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
