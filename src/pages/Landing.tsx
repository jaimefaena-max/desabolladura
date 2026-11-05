import { useMemo, useState } from 'react';
import { ArrowRight, Camera, CurrencyCircleDollar, Cube, ShieldCheck } from '@phosphor-icons/react';
import { Auto3D, FotoAuto, ir, Leyenda, Marca } from '../components/ui';
import type { EstadoPieza, PiezaId } from '../lib/types';

const ETAPAS: { hasta: number; texto: string; e: Partial<Record<PiezaId, EstadoPieza>> }[] = [
  { hasta: 24, texto: 'Recibido. La maletera y el parachoque esperan reparación.', e: { maletera: 'pendiente', parachoque_tras: 'pendiente' } },
  { hasta: 49, texto: 'Desabolladura en curso: la maletera ya está en aparejo.', e: { maletera: 'proceso', parachoque_tras: 'pendiente' } },
  { hasta: 74, texto: 'Maletera pintada. El parachoque entra a preparación.', e: { maletera: 'listo', parachoque_tras: 'proceso' } },
  { hasta: 99, texto: 'Todas las piezas pintadas. Falta control de calidad.', e: { maletera: 'listo', parachoque_tras: 'listo' } },
  { hasta: 100, texto: 'Listo para retirar.', e: { maletera: 'listo', parachoque_tras: 'listo' } },
];

export default function Landing() {
  const [pct, setPct] = useState(58);
  const etapa = useMemo(() => ETAPAS.find(e => pct <= e.hasta)!, [pct]);

  return (
    <div className="landing">
      <header className="nav">
        <Marca />
        <nav>
          <button className="nav-link" onClick={() => ir('/cliente')}>Seguimiento</button>
          <button className="btn primario" onClick={() => ir('/entrar')}>Entrar</button>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-texto">
          <h1>Cada pieza del auto, a la vista.</h1>
          <p>Recibe, cotiza y repara desde una sola app. Tu cliente sigue el avance en 3D.</p>
          <div className="hero-cta">
            <button className="btn primario grande" onClick={() => ir('/entrar')}>Entrar <ArrowRight size={24} weight="bold" /></button>
            <button className="btn secundario grande" onClick={() => ir('/cliente/COR7X2')}>Ver un seguimiento</button>
          </div>
        </div>
        <div className="hero-3d">
          <Auto3D carroceria="pickup" color="#a3121c" autoRotate angulo={52} etiqueta="Camioneta en 3D girando en un estudio oscuro" />
        </div>
      </section>

      <section className="demo">
        <div className="demo-3d">
          <Auto3D carroceria="sedan" color="#a9aeb4" estados={etapa.e} angulo={232} etiqueta="Sedán visto desde atrás, con su maletera y parachoque según el avance" />
        </div>
        <div className="demo-panel">
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
          <article className="celda maestro">
            <FotoAuto carroceria="suv" color="#1d3f72" estados={{ capot: 'pendiente', parachoque_del: 'pendiente' }} angulo={58} ancho={1100} alto={560} alt="SUV con capot y parachoque marcados por reparar" />
            <div>
              <h3>El maestro</h3>
              <p>Saca una foto al padrón, toca la pieza dañada y anota el trabajo. Texto grande, pensado para usar con guantes.</p>
            </div>
          </article>
          <article className="celda admin">
            <CurrencyCircleDollar size={44} weight="light" />
            <h3>El administrador</h3>
            <p>Recibe cada trabajo con un rango sugerido y decide el monto final al lado.</p>
          </article>
          <article className="celda cliente">
            <FotoAuto carroceria="hatchback" color="#e4e6e8" angulo={320} ancho={760} alto={420} alt="Hatchback blanco terminado" />
            <div>
              <h3>El cliente</h3>
              <p>Entra con su patente y un código. Ve porcentaje, tareas y piezas pintadas.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="seguros">
        <h2>Hecho para trabajar con aseguradoras</h2>
        <div className="seguros-grid">
          <div><ShieldCheck size={36} weight="light" /><h3>Siniestro y deducible</h3><p>Cada orden guarda compañía, número de siniestro y deducible.</p></div>
          <div><CurrencyCircleDollar size={36} weight="light" /><h3>Cobro separado</h3><p>Calcula neto, IVA, deducible del cliente y saldo de la compañía.</p></div>
          <div><Camera size={36} weight="light" /><h3>Ingreso con foto</h3><p>Propone los datos del padrón para que el maestro los revise.</p></div>
          <div><Cube size={36} weight="light" /><h3>Menos llamadas</h3><p>El dueño del auto revisa el avance sin preguntar al taller.</p></div>
        </div>
      </section>

      <footer className="pie">
        <h2>Pruébala con datos de ejemplo</h2>
        <button className="btn primario grande" onClick={() => ir('/entrar')}>Entrar <ArrowRight size={24} weight="bold" /></button>
        <p>Demostración con datos ficticios. Desarrollo de solucionesconia.cl</p>
      </footer>
    </div>
  );
}
