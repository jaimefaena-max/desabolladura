import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowsHorizontal, Bell, Camera, ChatCircleDots, CurrencyCircleDollar, Kanban, Package, Scales, ShieldCheck, Storefront, UsersThree, WhatsappLogo } from '@phosphor-icons/react';
import { Auto3D, Barra, CuandoSeVea, FotoAuto, InterruptorTema, ir, Leyenda, Marca } from '../components/ui';
import { useEmpresa } from '../lib/store';
import type { EstadoPieza, PiezaId } from '../lib/types';
import type { Fase } from '../three/HeroAuto';

const HeroAuto = lazy(() => import('../three/HeroAuto'));

const TEXTO_FASE: Record<Fase, string> = { reparado: 'Reparado y barnizado', pendiente: 'Capot: por reparar', proceso: 'Capot: en trabajo' };

/*
 * Lo que la app hace mientras el auto gira, en el mismo compás que el capot: la orden avanza y el
 * aviso al cliente se escribe solo. En escritorio flota alrededor del auto; en celular no se muestra.
 */
const VIVO: Record<Fase, { pct: number; etapa: string; aviso: string }> = {
  pendiente: { pct: 15, etapa: 'Esperando aprobación', aviso: 'Recibimos su auto. El presupuesto ya está en su portal.' },
  proceso: { pct: 60, etapa: 'En pintura', aviso: 'Su auto avanzó a 60 %: el capot está en pintura.' },
  reparado: { pct: 100, etapa: 'Listo para entregar', aviso: 'Su auto está listo: reparado y barnizado. Véalo en 3D.' },
};

function EnVivo({ fase }: { fase: Fase }) {
  const v = VIVO[fase];
  return (
    <>
      <div className="vivo vivo-orden" aria-hidden="true">
        <p className="vivo-tit"><b>Orden 1045</b><span>Auto clásico 1969</span></p>
        <Barra valor={v.pct} />
        <p className="vivo-pie"><b>{v.pct} %</b> · {v.etapa}</p>
      </div>
      <div className="vivo vivo-wsp" aria-hidden="true" key={fase}>
        <p className="vivo-tit"><WhatsappLogo size={20} weight="fill" /><b>Aviso al cliente</b><span>se escribió solo</span></p>
        <p className="vivo-msj">{v.aviso}</p>
      </div>
    </>
  );
}

/** Lo esencial a la vista sin hacer scroll: hechos del producto, no promesas. */
const CONFIANZA = [
  { Icono: UsersThree, t: 'Tres perfiles conectados', d: 'Trabajador, administrador y cliente' },
  { Icono: Scales, t: 'Plazo legal bajo control', d: 'Facturas a compañías a 30 días' },
  { Icono: WhatsappLogo, t: 'Avisos que se escriben solos', d: 'Cada etapa, lista para enviar' },
  { Icono: Storefront, t: 'Tu marca, tus datos', d: 'Logo, color y datos separados' },
];

/** Conexión lenta o ahorro de datos: se queda con la foto, sin bajar el modelo 3D. */
function conexionLenta() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  // Solo 2G o ahorro de datos: en 3G la foto cubre la espera y el 3D aparece al terminar de bajar.
  return !!c && (!!c.saveData || /(^|-)2g$/.test(c.effectiveType ?? ''));
}

/**
 * Auto de la portada. La foto aparece al instante; el 3D (≈0,6 MB) se carga después y la reemplaza
 * con un fundido. Con conexión lenta o sin WebGL queda la foto; con «reducir movimiento», el 3D quieto.
 */
function HeroMustang() {
  const empresa = useEmpresa();
  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [fase, setFase] = useState<Fase>('reparado');
  const [girado, setGirado] = useState(false);
  const lento = useMemo(conexionLenta, []);
  const quieto = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  // El modelo pesa: se empieza a bajar cuando la página ya cargó y el navegador está libre,
  // para no competir con el texto, la foto y los botones del primer vistazo.
  const [arrancar, setArrancar] = useState(false);
  useEffect(() => {
    let id = 0, t = 0;
    const ya = () => setArrancar(true);
    const libre = () => { id = typeof requestIdleCallback === 'function' ? requestIdleCallback(ya, { timeout: 1500 }) : setTimeout(ya, 300) as unknown as number; };
    if (document.readyState === 'complete') libre(); else addEventListener('load', libre, { once: true });
    t = window.setTimeout(ya, 4000);
    return () => { removeEventListener('load', libre); clearTimeout(t); if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id); clearTimeout(id); };
  }, []);
  return (
    <div className="hero-3d hero-auto">
      <img className={`hero-poster ${listo ? 'oculto' : ''}`} src={`${import.meta.env.BASE_URL}portada/mustang-poster.webp`}
        alt="Auto clásico amarillo con franjas negras" fetchPriority="high" decoding="async" />
      {arrancar && !lento && !fallo && (
        <Suspense fallback={null}>
          <HeroAuto acento={empresa.acento} quieto={quieto} onListo={() => setListo(true)} onFase={setFase} onError={() => setFallo(true)} onGirar={() => setGirado(true)} />
        </Suspense>
      )}
      {listo && !girado && <p className="hero-girar" aria-hidden="true"><ArrowsHorizontal size={18} weight="bold" /> Arrastra para girar</p>}
      {listo && <p className={`hero-fase ${fase}`} aria-live="polite"><i aria-hidden="true" />{TEXTO_FASE[fase]}</p>}
      {listo && <EnVivo fase={fase} />}
    </div>
  );
}

const ETAPAS: { hasta: number; texto: string; e: Partial<Record<PiezaId, EstadoPieza>> }[] = [
  { hasta: 24, texto: 'Recibido. La maletera y el parachoque esperan reparación.', e: { maletera: 'pendiente', parachoque_tras: 'pendiente' } },
  { hasta: 49, texto: 'Desabolladura en curso: la maletera ya está en aparejo.', e: { maletera: 'proceso', parachoque_tras: 'pendiente' } },
  { hasta: 74, texto: 'Maletera pintada. El parachoque entra a preparación.', e: { maletera: 'listo', parachoque_tras: 'proceso' } },
  { hasta: 99, texto: 'Todas las piezas pintadas. Falta control de calidad.', e: { maletera: 'listo', parachoque_tras: 'listo' } },
  { hasta: 100, texto: 'Listo para retirar.', e: { maletera: 'listo', parachoque_tras: 'listo' } },
];

const ESTADOS_SUV: Partial<Record<PiezaId, EstadoPieza>> = { capot: 'pendiente', parachoque_del: 'pendiente' };

const FUNCIONES = [
  { Icono: Kanban, t: 'Tablero que se mueve solo', d: 'Cada vehículo cambia de etapa cuando el trabajador marca su avance.' },
  { Icono: Bell, t: 'Alertas del día', d: 'Atrasos, repuestos por pedir, montos faltantes y autos listos, en una lista.' },
  { Icono: Package, t: 'Repuestos automáticos', d: 'Un cambio de pieza crea el repuesto y frena la etapa hasta recibirlo.' },
  { Icono: Camera, t: 'Fotos antes y después', d: 'Quedan en la orden como respaldo para el cliente y la compañía.' },
  { Icono: CurrencyCircleDollar, t: 'Trabajos adicionales', d: 'Lo que aparece al desarmar vuelve a pedir aprobación antes de seguir.' },
  { Icono: ChatCircleDots, t: 'Avisos por WhatsApp', d: 'El mensaje de cada etapa se escribe solo. Tú solo lo envías.' },
];

export default function Landing() {
  const [pct, setPct] = useState(58);
  const etapa = useMemo(() => ETAPAS.find(e => pct <= e.hasta)!, [pct]);

  return (
    <div className="landing">
      <header className="nav">
        <Marca />
        <nav>
          <button className="nav-link solo-escritorio" onClick={() => document.getElementById('funciones')?.scrollIntoView({ behavior: 'smooth' })}>Funciones</button>
          <button className="nav-link" onClick={() => ir('/cliente')}>Seguimiento</button>
          <InterruptorTema />
          <button className="btn primario" onClick={() => ir('/entrar')}>Entrar</button>
        </nav>
      </header>

      <main>
      <section className="hero">
        <div className="hero-texto">
          <h1>Tu taller, en piloto automático.</h1>
          <p>Recibe, cotiza y repara cada vehículo en una sola app. Tu cliente sigue el avance en 3D.</p>
          <div className="hero-cta">
            <button className="btn primario grande" onClick={() => ir('/entrar')}>Probar la demo <ArrowRight size={24} weight="bold" /></button>
            <button className="btn secundario grande" onClick={() => ir('/cliente/demo')}>Ver un seguimiento</button>
          </div>
        </div>
        <HeroMustang />
      </section>
      <section className="confianza" aria-label="Lo principal">
        {CONFIANZA.map(({ Icono, t, d }) => (
          <div key={t}><Icono size={28} weight="duotone" aria-hidden="true" /><p><b>{t}</b><span>{d}</span></p></div>
        ))}
      </section>

      <section className="demo">
        <CuandoSeVea className="demo-3d revelar">
          <Auto3D carroceria="sedan" color="#a9aeb4" estados={etapa.e} angulo={232} etiqueta="Sedán visto desde atrás, con su maletera y parachoque según el avance" />
        </CuandoSeVea>
        <div className="demo-panel revelar">
          <h2>El cliente ve su auto, no un estado en texto</h2>
          <p className="pct-grande" aria-live="polite">{pct}%</p>
          <p className="demo-etapa">{etapa.texto}</p>
          <label className="campo">
            <span>Mueve la barra para simular el avance</span>
            <input type="range" min={0} max={100} value={pct} onChange={e => setPct(Number(e.target.value))} />
          </label>
          <Leyenda />
        </div>
      </section>

      <section className="bento">
        <h2>Una app, tres miradas</h2>
        <div className="bento-grid">
          <article className="celda maestro revelar">
            <CuandoSeVea className="celda-foto" alto="340px"><FotoAuto carroceria="suv" color="#1d3f72" estados={ESTADOS_SUV} angulo={58} ancho={1100} alto={560} alt="SUV con capot y parachoque marcados por reparar" /></CuandoSeVea>
            <div>
              <h3>El trabajador</h3>
              <p>Saca una foto al padrón, toca la pieza dañada y anota el trabajo. Texto grande y botones claros.</p>
            </div>
          </article>
          <article className="celda admin revelar">
            <CurrencyCircleDollar size={44} weight="light" />
            <h3>El administrador</h3>
            <p>Ve el taller completo, fija cada monto y cobra separando deducible y compañía.</p>
          </article>
          <article className="celda cliente revelar">
            <CuandoSeVea className="celda-foto" alto="300px"><FotoAuto carroceria="hatchback" color="#e4e6e8" angulo={320} ancho={760} alto={420} alt="Hatchback blanco terminado" /></CuandoSeVea>
            <div>
              <h3>El cliente</h3>
              <p>Entra con su patente y un código. Ve avance, fotos y aprueba su presupuesto.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="funciones" id="funciones">
        <h2>Lo que antes dependía de la memoria, ahora pasa solo</h2>
        <div className="funciones-grid">
          {FUNCIONES.map(({ Icono, t, d }) => (
            <article key={t} className="revelar"><Icono size={36} weight="light" /><h3>{t}</h3><p>{d}</p></article>
          ))}
        </div>
      </section>

      <section className="marca-blanca">
        <div className="revelar">
          <ShieldCheck size={44} weight="light" />
          <h2>Una plataforma, cada taller con su marca</h2>
          <p>Cada empresa entra con su logo, su color y sus datos separados.</p>
        </div>
      </section>

      </main>

      <footer className="pie">
        <h2>Pruébala con datos de ejemplo</h2>
        <button className="btn primario grande" onClick={() => ir('/entrar')}>Entrar <ArrowRight size={24} weight="bold" /></button>
        <p>Demostración con datos ficticios.</p>
      </footer>
    </div>
  );
}
