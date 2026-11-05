import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { CaretLeft, SignOut } from '@phosphor-icons/react';
import { cerrarSesion, sesion } from '../lib/store';
import type { Carroceria, EstadoPieza, Orden, PiezaId } from '../lib/types';
import { estadosPiezas, progreso } from '../lib/piezas';
import { verPatente } from '../lib/vehiculos';

export const Viewer3D = lazy(() => import('../three/Viewer3D'));

export const ir = (ruta: string) => { location.hash = ruta; };

export function Marca({ onClick }: { onClick?: () => void }) {
  return (
    <button className="marca" onClick={onClick ?? (() => ir('/'))} aria-label="Desabolladura Premium, inicio">
      <span className="marca-signo" aria-hidden="true" />
      <span>Desabolladura <b>Premium</b></span>
    </button>
  );
}

export function Pantalla({ children, volver, titulo, sub, accion }: { children?: ReactNode; volver?: string; titulo?: string; sub?: string; accion?: ReactNode }) {
  const u = sesion();
  return (
    <div className="app">
      <header className="barra">
        <Marca onClick={() => ir(u ? (u.rol === 'admin' ? '/admin' : '/maestro') : '/')} />
        {u && (
          <div className="barra-usuario">
            <span className="barra-nombre"><b>{u.nombre}</b><small>{u.cargo}</small></span>
            <button className="icono" aria-label="Cerrar sesión" onClick={() => { cerrarSesion(); ir('/entrar'); }}><SignOut size={26} /></button>
          </div>
        )}
      </header>
      <main className="contenido">
        {volver && <button className="volver" onClick={() => ir(volver)}><CaretLeft size={24} weight="bold" /> Volver</button>}
        {titulo && (
          <div className="titulo-fila">
            <div><h1>{titulo}</h1>{sub && <p className="sub">{sub}</p>}</div>
            {accion}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export function Barra({ valor }: { valor: number }) {
  return <div className="barra-avance" role="progressbar" aria-valuenow={valor} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${valor}%` }} /></div>;
}

export function Leyenda() {
  return (
    <ul className="leyenda" aria-label="Significado de los colores">
      <li><i style={{ background: 'var(--dano)' }} /> Por reparar</li>
      <li><i style={{ background: '#6b7078' }} /> En trabajo</li>
      <li><i className="pintado" /> Terminada</li>
    </ul>
  );
}

export function Auto3D(p: { carroceria: Carroceria; color: string; estados?: Partial<Record<PiezaId, EstadoPieza>>; seleccion?: PiezaId | null; onPick?: (id: PiezaId) => void; autoRotate?: boolean; angulo?: number; etiqueta: string }) {
  return (
    <Suspense fallback={<div className="viewer esqueleto" />}>
      <Viewer3D {...p} />
    </Suspense>
  );
}

export function FotoAuto({ carroceria, color, estados, angulo, alt, ancho, alto }: { carroceria: Carroceria; color: string; estados?: Partial<Record<PiezaId, EstadoPieza>>; angulo?: number; alt: string; ancho?: number; alto?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const clave = JSON.stringify([carroceria, color, estados, angulo]);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      const { foto } = await import('../three/snapshot');
      const url = foto({ carroceria, color, estados, angulo, ancho, alto });
      if (vivo) setSrc(url);
    }, 30);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return src ? <img className="foto" src={src} alt={alt} /> : <div className="foto esqueleto" role="img" aria-label={alt} />;
}

export function TarjetaOrden({ o, destino, pie }: { o: Orden; destino: string; pie?: ReactNode }) {
  const pct = progreso(o.items), v = o.vehiculo;
  return (
    <button className="tarjeta-orden" onClick={() => ir(destino)}>
      <FotoAuto carroceria={v.carroceria} color={v.colorHex} estados={estadosPiezas(o.items)} alt={`${v.marca} ${v.modelo}`} />
      <div className="tarjeta-datos">
        <div className="tarjeta-tit"><b>{v.marca} {v.modelo}</b><span className="patente">{verPatente(v.patente)}</span></div>
        <p>{v.anio} · {o.pagador.tipo === 'aseguradora' ? o.pagador.aseguradora : 'Particular'}</p>
        <div className="tarjeta-pct"><Barra valor={pct} /><b>{pct}%</b></div>
        {pie}
      </div>
    </button>
  );
}
