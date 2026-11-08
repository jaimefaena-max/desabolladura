import { ArrowRight, Briefcase, Wrench } from '@phosphor-icons/react';
import { ir, Marca } from '../components/ui';
import { entrarDemo } from '../lib/store';
import type { Usuario } from '../lib/types';

const PERFILES: { rol: Usuario['rol']; titulo: string; detalle: string; destino: string; Icono: typeof Wrench }[] = [
  { rol: 'admin', titulo: 'Demo Administrador', detalle: 'Tablero, órdenes, precios, cobros y reportes', destino: '/admin', Icono: Briefcase },
  { rol: 'maestro', titulo: 'Demo Trabajador', detalle: 'Ingresar vehículos, marcar daños y avance', destino: '/maestro', Icono: Wrench },
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
            <button key={rol} className="perfil" onClick={() => { entrarDemo(rol); ir(destino); }}>
              <span className="avatar claro" aria-hidden="true"><Icono size={32} weight="duotone" /></span>
              <span><b>{titulo}</b><small>{detalle}</small></span>
              <ArrowRight size={24} className="perfil-flecha" aria-hidden="true" />
            </button>
          ))}
        </div>
        <button className="enlace centrado" onClick={() => ir('/cliente')}>Soy cliente: ver cómo va mi auto</button>
      </main>
    </div>
  );
}
