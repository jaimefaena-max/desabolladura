import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { CaretLeft, Camera, ChartBar, CurrencyCircleDollar, Gear, Kanban, ListChecks, Moon, Package, SignOut, Sun } from '@phosphor-icons/react';
import { alternarTema, useTema } from '../lib/tema';
import { Barrera } from './Errores';
import { etapaDe, nombreEtapa } from '../lib/automatizacion';
import { guardarFoto, leerFoto } from '../lib/fotos';
import { reducirImagen } from '../lib/padron';
import { cerrarSesion, sesion, uid, useEmpresa } from '../lib/store';
import { VISTAS } from '../lib/fichaModelo';
import type { Carroceria, EstadoPieza, FotoRef, Medidas, Modelo3D, Orden, PiezaId, Vehiculo, Vista } from '../lib/types';
import { useVista, vistasDe } from '../lib/vistas';
import { estadosPiezas, progreso } from '../lib/piezas';
import { verPatente } from '../lib/vehiculos';

export const Viewer3D = lazy(() => import('../three/Viewer3D'));

export const ir = (ruta: string) => { location.hash = ruta; };

/** Espacio de logo: cada taller carga el suyo en Ajustes. */
export function Logo() {
  const e = useEmpresa();
  return e.logo ? <img className="logo-img" src={e.logo} alt={`Logo de ${e.nombre}`} /> : <span className="logo-vacio">TU LOGO<br />AQUÍ</span>;
}

/** Interruptor de modo día y noche: un solo botón que muestra el modo activo. */
export function InterruptorTema() {
  const tema = useTema(), claro = tema === 'claro';
  return (
    <button type="button" className="interruptor-tema" role="switch" aria-checked={claro} onClick={alternarTema}
      aria-label={claro ? 'Modo día activado. Cambiar a modo noche' : 'Modo noche activado. Cambiar a modo día'}>
      <span className={claro ? '' : 'on'}><Moon size={18} weight={claro ? 'regular' : 'fill'} /></span>
      <span className={claro ? 'on' : ''}><Sun size={18} weight={claro ? 'fill' : 'regular'} /></span>
    </button>
  );
}

export function Marca({ onClick }: { onClick?: () => void }) {
  const e = useEmpresa();
  return (
    <button className="marca" onClick={onClick ?? (() => ir('/'))} aria-label={`${e.nombre}, inicio`}>
      <Logo />
      <span className="marca-txt"><b>{e.nombre}</b><small>Desabolladura Premium</small></span>
    </button>
  );
}

const NAV_ADMIN = [
  { ruta: '/admin', nombre: 'Tablero', Icono: Kanban },
  { ruta: '/admin/ordenes', nombre: 'Órdenes', Icono: ListChecks },
  { ruta: '/admin/repuestos', nombre: 'Repuestos', Icono: Package },
  { ruta: '/admin/cobranza', nombre: 'Cobranza', Icono: CurrencyCircleDollar },
  { ruta: '/admin/reportes', nombre: 'Reportes', Icono: ChartBar },
  { ruta: '/admin/ajustes', nombre: 'Ajustes', Icono: Gear },
];

export function Pantalla({ children, volver, titulo, sub, accion }: { children?: ReactNode; volver?: string; titulo?: string; sub?: string; accion?: ReactNode }) {
  const u = sesion();
  const ruta = location.hash.replace(/^#/, '');
  return (
    <div className="app">
      <header className="barra">
        <Marca onClick={() => ir(u ? (u.rol === 'admin' ? '/admin' : '/maestro') : '/')} />
        {u?.rol === 'admin' && (
          <nav className="nav-admin" aria-label="Secciones">
            {NAV_ADMIN.map(({ ruta: r, nombre, Icono }) => (
              <button key={r} className={ruta === r ? 'on' : ''} aria-current={ruta === r ? 'page' : undefined} onClick={() => ir(r)}><Icono size={24} /> {nombre}</button>
            ))}
          </nav>
        )}
        {!u && <InterruptorTema />}
        {u && (
          <div className="barra-usuario">
            <InterruptorTema />
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
      <li><i style={{ background: 'var(--acento)' }} /> Por reparar</li>
      <li><i style={{ background: 'color-mix(in srgb, var(--acento) 28%, #6b7078)' }} /> En trabajo</li>
      <li><i className="pintado" /> Terminada</li>
    </ul>
  );
}

/** Lo que el 3D necesita de un vehículo: su tipo, sus medidas reales si se conocen y su color. */
export const forma = (v: Vehiculo) => ({ carroceria: v.carroceria, medidas: v.ficha?.medidas, modelo: v.ficha?.modelo3d, color: v.colorHex });

export function Auto3D(p: { acento?: string; carroceria: Carroceria; medidas?: Medidas; modelo?: Modelo3D; color: string; estados?: Partial<Record<PiezaId, EstadoPieza>>; seleccion?: PiezaId | null; onPick?: (id: PiezaId) => void; autoRotate?: boolean; angulo?: number; etiqueta: string }) {
  return (
    <Barrera alternativa={<div className="viewer viewer-fallo"><p>No se pudo cargar el modelo 3D. Recarga la página para verlo.</p></div>}>
      <Suspense fallback={<div className="viewer esqueleto" />}>
        <Viewer3D acento={useEmpresa().acento} {...p} />
      </Suspense>
    </Barrera>
  );
}

/** Foto de tarjeta: la imagen generada del modelo si existe; si no, una vista del 3D. */
export function FotoOrden({ o, ancho, alto }: { o: Orden; ancho?: number; alto?: number }) {
  const v = o.vehiculo, src = useVista(vistasDe(o)?.frente), alt = `${v.marca} ${v.modelo}`;
  if (src) return <img className="foto foto-real" src={src} alt={alt} loading="lazy" decoding="async" />;
  return <FotoAuto {...forma(v)} estados={estadosPiezas(o.items)} ancho={ancho} alto={alto} alt={alt} />;
}

/** Las tres vistas generadas del modelo, con miniaturas para cambiar entre ellas. */
export function GaleriaVistas({ o }: { o: Orden }) {
  const vistas = vistasDe(o), v = o.vehiculo;
  const disponibles = VISTAS.filter(x => vistas?.[x.id]);
  const [actual, setActual] = useState<Vista>('frente');
  const elegida = disponibles.find(x => x.id === actual) ?? disponibles[0];
  const src = useVista(elegida && vistas?.[elegida.id]);
  if (!elegida) return null;
  return (
    <figure className="galeria">
      <div className="galeria-foto">
        {src ? <img key={src} src={src} alt={`${v.marca} ${v.modelo} ${v.anio}, vista ${elegida.nombre.toLowerCase()}`} /> : <div className="esqueleto" />}
      </div>
      {disponibles.length > 1 && (
        <div className="galeria-vistas" role="group" aria-label="Vistas del vehículo">
          {disponibles.map(x => <Miniatura key={x.id} ref_={vistas![x.id]!} nombre={x.nombre} on={x.id === elegida.id} onClick={() => setActual(x.id)} />)}
        </div>
      )}
      <figcaption>Imagen referencial creada con IA{v.ficha ? ` · ${v.ficha.generacion}` : ''}</figcaption>
    </figure>
  );
}

function Miniatura({ ref_, nombre, on, onClick }: { ref_: string; nombre: string; on: boolean; onClick: () => void }) {
  const src = useVista(ref_);
  return (
    <button className={on ? 'on' : ''} aria-pressed={on} onClick={onClick}>
      {src ? <img src={src} alt="" /> : <span className="esqueleto" />}
      <span>{nombre}</span>
    </button>
  );
}

export function FotoAuto({ carroceria, medidas, color, estados, angulo, alt, ancho, alto }: { carroceria: Carroceria; medidas?: Medidas; color: string; estados?: Partial<Record<PiezaId, EstadoPieza>>; angulo?: number; alt: string; ancho?: number; alto?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const acento = useEmpresa().acento;
  const clave = JSON.stringify([carroceria, medidas, color, acento, estados, angulo]);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      const { foto } = await import('../three/snapshot');
      const url = foto({ carroceria, medidas, color, acento, estados, angulo, ancho, alto });
      if (vivo) setSrc(url);
    }, 30);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return src ? <img className="foto" src={src} alt={alt} /> : <div className="foto esqueleto" role="img" aria-label={alt} />;
}

export function TarjetaOrden({ o, destino }: { o: Orden; destino: string }) {
  const pct = progreso(o.items), v = o.vehiculo;
  return (
    <button className="tarjeta-orden" onClick={() => ir(destino)}>
      <FotoOrden o={o} />
      <div className="tarjeta-datos">
        <div className="tarjeta-tit"><b>{v.marca} {v.modelo}</b><span className="patente">{verPatente(v.patente)}</span></div>
        <p>{nombreEtapa(etapaDe(o))}</p>
        <div className="tarjeta-pct"><Barra valor={pct} /><b>{pct}%</b></div>
      </div>
    </button>
  );
}

/** Foto guardada en el equipo (IndexedDB). */
export function FotoGuardada({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState<string | null>();
  useEffect(() => { let vivo = true; leerFoto(id).then(s => { if (vivo) setSrc(s ?? null); }, () => { if (vivo) setSrc(null); }); return () => { vivo = false; }; }, [id]);
  // null = la foto no está en este equipo (link abierto en otro teléfono): sin servidor no viaja.
  if (src === null) return <div className="foto-taller" role="img" aria-label={alt}><Camera size={26} weight="light" /><span>Foto en el sistema del taller</span></div>;
  return src ? <img src={src} alt={alt} loading="lazy" /> : <div className="esqueleto" role="img" aria-label={alt} />;
}

/** Fotos del antes y el después. Con `onAgregar`, el trabajador las sube desde la cámara. */
export function Galeria({ fotos, onAgregar }: { fotos: FotoRef[]; onAgregar?: (f: FotoRef) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const momento = useRef<FotoRef['momento']>('antes');
  const [error, setError] = useState('');
  const abrir = (m: FotoRef['momento']) => { momento.current = m; input.current?.click(); };
  const grupos: { id: FotoRef['momento']; nombre: string }[] = [{ id: 'antes', nombre: 'Antes' }, { id: 'despues', nombre: 'Después' }];
  if (!onAgregar && !fotos.length) return null;
  return (
    <section className="galeria">
      <h2>Fotos del trabajo</h2>
      {grupos.map(g => {
        const lista = fotos.filter(f => f.momento === g.id);
        if (!onAgregar && !lista.length) return null;
        return (
          <div key={g.id}>
            <p className="etiqueta">{g.nombre}</p>
            <div className="fotos">
              {lista.map((f, i) => <FotoGuardada key={f.id} id={f.id} alt={`Foto ${g.nombre.toLowerCase()} ${i + 1}`} />)}
              {onAgregar && <button className="foto-mas" aria-label={`Agregar foto de ${g.nombre.toLowerCase()}`} onClick={() => abrir(g.id)}><Camera size={34} weight="light" /> Sacar foto</button>}
            </div>
          </div>
        );
      })}
      {error && <p className="error" role="alert">{error}</p>}
      {onAgregar && (
        <input ref={input} type="file" accept="image/*" capture="environment" hidden aria-label="Foto del trabajo" onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const id = uid();
            await guardarFoto(id, await reducirImagen(f, 1100));
            onAgregar({ id, momento: momento.current });
            setError('');
          } catch { setError('No se pudo guardar la foto. Intenta otra vez.'); }
        }} />
      )}
    </section>
  );
}

/**
 * Monta su contenido recién cuando está por entrar en pantalla. La portada tiene tres autos 3D:
 * abrir los tres contextos gráficos al cargar compite con el auto principal y traba el primer segundo.
 */
export function CuandoSeVea({ children, className, alto }: { children: ReactNode; className?: string; alto?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [ver, setVer] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (ver || !caja.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVer(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(caja.current);
    return () => io.disconnect();
  }, [ver]);
  return <div ref={caja} className={className} style={ver ? undefined : { minHeight: alto }}>{ver ? children : null}</div>;
}
