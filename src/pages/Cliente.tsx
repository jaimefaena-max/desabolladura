import { useState } from 'react';
import { CheckCircle, Circle, CircleHalf, Check } from '@phosphor-icons/react';
import { Auto3D, Barra, Galeria, ir, Leyenda, Marca } from '../components/ui';
import { conEvento, ETAPAS, etapaDe } from '../lib/automatizacion';
import { clp, estadosPiezas, fecha, itemsCobrables, progreso, tituloItem, totales } from '../lib/piezas';
import { actualizar, buscarPorAcceso, useOrdenes } from '../lib/store';
import type { Orden } from '../lib/types';
import { verPatente } from '../lib/vehiculos';

export function ClienteAcceso() {
  const [patente, setPatente] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState(false);
  const entrar = (e: React.FormEvent) => {
    e.preventDefault();
    const o = buscarPorAcceso(patente, codigo);
    if (o) ir(`/cliente/${o.codigo}`); else setError(true);
  };
  return (
    <div className="login">
      <header className="login-top"><Marca /></header>
      <main className="login-caja angosta">
        <h1>¿Cómo va mi auto?</h1>
        <p className="sub">Escribe tu patente y el código que te entregó el taller.</p>
        <form className="formulario" onSubmit={entrar}>
          <label className="campo"><span>Patente</span><input value={patente} onChange={e => { setPatente(e.target.value.toUpperCase()); setError(false); }} autoComplete="off" required /></label>
          <label className="campo"><span>Código</span><input value={codigo} onChange={e => { setCodigo(e.target.value.toUpperCase()); setError(false); }} autoComplete="off" required /></label>
          {error && <p className="error" role="alert">No encontramos ese vehículo. Revisa la patente y el código.</p>}
          <button className="btn primario grande ancho">Ver mi auto</button>
        </form>
        <p className="pista">Ejemplo: patente DEMA-22, código COR7X2</p>
      </main>
    </div>
  );
}

/** Aprobación digital: el dueño decide desde su portal, sin llamadas. Solo aplica a particulares. */
function Presupuesto({ o }: { o: Orden }) {
  const t = totales(o);
  const responder = (ok: boolean) => actualizar(o.id, x => conEvento(
    { ...x, aprobacion: ok ? 'aprobada' : 'rechazada', items: ok ? x.items.map(i => ({ ...i, adicional: false })) : x.items },
    ok ? 'El cliente aprobó el presupuesto' : 'El cliente rechazó el presupuesto',
  ));
  return (
    <section className="presupuesto">
      <h2>Tu presupuesto</h2>
      <ul>{itemsCobrables(o).map(i => <li key={i.id}><span>{tituloItem(i, o.vehiculo.carroceria)}</span><b>{clp(i.monto ?? 0)}</b></li>)}</ul>
      <p className="presupuesto-total"><span>Total con IVA</span><b>{clp(t.total)}</b></p>
      <div>
        <button className="btn primario grande" onClick={() => responder(true)}><Check size={24} weight="bold" /> Aprobar</button>
        <button className="btn secundario grande" onClick={() => responder(false)}>Rechazar</button>
      </div>
    </section>
  );
}

export function ClientePortal({ codigo }: { codigo: string }) {
  const o = useOrdenes().find(x => x.codigo === codigo);
  if (!o) {
    return (
      <div className="login"><main className="login-caja angosta"><h1>No encontramos ese seguimiento</h1>
        <button className="btn primario grande" onClick={() => ir('/cliente')}>Volver</button></main></div>
    );
  }
  const v = o.vehiculo, pct = progreso(o.items), et = etapaDe(o);
  const hechas = o.items.filter(i => i.estado === 'listo').length;
  const orden = { proceso: 0, pendiente: 1, listo: 2 } as const;
  const tareas = [...o.items].sort((a, b) => orden[a.estado] - orden[b.estado]);
  const pasos = ETAPAS.filter(e => e.id !== 'repuestos' || et === 'repuestos');
  const actual = pasos.findIndex(e => e.id === et);
  const zaga = o.items.some(i => i.pieza === 'maletera' || i.pieza === 'parachoque_tras');

  return (
    <div className="portal">
      <header className="barra"><Marca /><span className="patente">{verPatente(v.patente)}</span></header>
      <main>
        <section className="portal-hero">
          <div className="portal-3d">
            <Auto3D carroceria={v.carroceria} color={v.colorHex} estados={estadosPiezas(o.items)} autoRotate angulo={zaga ? 228 : 40} etiqueta={`Tu ${v.marca} ${v.modelo} en 3D, con las piezas según su avance`} />
          </div>
          <div className="portal-resumen">
            <p className="sub">{v.marca} {v.modelo} {v.anio}</p>
            <p className="pct-grande">{pct}%</p>
            <Barra valor={pct} />
            <p className="portal-estado">{ETAPAS.find(e => e.id === et)!.cliente}. {pct === 100 ? '' : `${hechas} de ${o.items.length} tareas terminadas. Entrega estimada: ${fecha(o.entrega)}.`}</p>
            <Leyenda />
          </div>
        </section>
        <ol className="linea-etapas" aria-label="Etapas de la reparación">
          {pasos.map((e, i) => <li key={e.id} className={i < actual ? 'hecha' : i === actual ? 'actual' : ''} aria-current={i === actual ? 'step' : undefined}>{e.nombre}</li>)}
        </ol>
        <div className="portal-tareas">
          {o.aprobacion === 'enviada' && o.pagador.tipo === 'particular' && <Presupuesto o={o} />}
          <h2>Tareas para llegar al 100%</h2>
          <ul className="lista-tareas">
            {tareas.map(i => (
              <li key={i.id} className={i.estado}>
                {i.estado === 'listo' ? <CheckCircle size={32} weight="fill" /> : i.estado === 'proceso' ? <CircleHalf size={32} weight="fill" /> : <Circle size={32} />}
                <span>{tituloItem(i, v.carroceria)}</span>
                <small>{i.estado === 'listo' ? 'Terminada' : i.estado === 'proceso' ? 'En trabajo' : 'Por hacer'}</small>
              </li>
            ))}
          </ul>
          <Galeria fotos={o.fotos} />
        </div>
      </main>
    </div>
  );
}
