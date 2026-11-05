import { useState } from 'react';
import { CheckCircle, Circle, CircleHalf } from '@phosphor-icons/react';
import { Auto3D, Barra, ir, Leyenda, Marca } from '../components/ui';
import { estadosPiezas, fecha, progreso, tituloItem } from '../lib/piezas';
import { buscarPorAcceso, useOrdenes } from '../lib/store';
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
        <p className="pista">Ejemplo: patente LFZD-31, código COR7X2</p>
      </main>
    </div>
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
  const v = o.vehiculo, pct = progreso(o.items);
  const hechas = o.items.filter(i => i.estado === 'listo').length;
  const orden = { proceso: 0, pendiente: 1, listo: 2 } as const;
  const tareas = [...o.items].sort((a, b) => orden[a.estado] - orden[b.estado]);

  return (
    <div className="portal">
      <header className="barra"><Marca /><span className="patente">{verPatente(v.patente)}</span></header>
      <main>
        <section className="portal-hero">
          <div className="portal-3d">
            <Auto3D carroceria={v.carroceria} color={v.colorHex} estados={estadosPiezas(o.items)} autoRotate angulo={o.items.some(i => i.pieza === 'maletera' || i.pieza === 'parachoque_tras') ? 228 : 40} etiqueta={`Tu ${v.marca} ${v.modelo} en 3D, con las piezas según su avance`} />
          </div>
          <div className="portal-resumen">
            <p className="sub">{v.marca} {v.modelo} {v.anio}</p>
            <p className="pct-grande">{pct}%</p>
            <Barra valor={pct} />
            <p className="portal-estado">{pct === 100 ? 'Tu auto está listo para retirar.' : `${hechas} de ${o.items.length} tareas terminadas. Entrega estimada: ${fecha(o.entrega)}.`}</p>
            <Leyenda />
          </div>
        </section>
        <section className="portal-tareas">
          <h2>Tareas para llegar al 100%</h2>
          <ul>
            {tareas.map(i => (
              <li key={i.id} className={i.estado}>
                {i.estado === 'listo' ? <CheckCircle size={32} weight="fill" /> : i.estado === 'proceso' ? <CircleHalf size={32} weight="fill" /> : <Circle size={32} />}
                <span>{tituloItem(i, v.carroceria)}</span>
                <small>{i.estado === 'listo' ? 'Terminada' : i.estado === 'proceso' ? 'En trabajo' : 'Por hacer'}</small>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
