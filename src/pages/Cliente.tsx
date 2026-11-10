import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Car, WhatsappLogo, CheckCircle, Circle, CircleHalf, Check } from '@phosphor-icons/react';
import { Auto3D, Barra, forma, FotoGuardada, Galeria, GaleriaVistas, InterruptorTema, ir, Leyenda, Marca } from '../components/ui';
import { conEvento, enlaceWhatsApp, ETAPAS, etapaDe } from '../lib/automatizacion';
import { clp, estadosPiezas, fecha, itemsCobrables, progreso, tituloItem, totales } from '../lib/piezas';
import { actualizar, buscarPorAcceso, sesion, useOrdenes } from '../lib/store';
import { desempaquetar } from '../lib/seguimiento';
import type { Item, Orden } from '../lib/types';
import { verPatente } from '../lib/vehiculos';

/** Seguimiento de muestra: el visitante entra sin escribir nada. Si esa orden se borró, sirve cualquiera. */
const CODIGO_DEMO = 'COR7X2';
const ordenDemo = (os: Orden[]) => os.find(o => o.codigo === CODIGO_DEMO) ?? os[0];

export function ClienteAcceso() {
  const demo = ordenDemo(useOrdenes());
  const [conCodigo, setConCodigo] = useState(false);
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
      <header className="login-top"><Marca /><InterruptorTema /></header>
      <main className="login-caja angosta">
        <h1>¿Cómo va mi auto?</h1>
        <p className="sub">Mira el seguimiento de un auto de prueba. No necesitas escribir nada.</p>
        {demo && (
          <div className="perfiles">
            <button className="perfil" onClick={() => ir('/cliente/demo')}>
              <span className="avatar claro" aria-hidden="true"><Car size={32} weight="duotone" /></span>
              <span><b>Demo Cliente</b><small>{demo.vehiculo.marca} {demo.vehiculo.modelo} · patente {verPatente(demo.vehiculo.patente)}</small></span>
              <ArrowRight size={24} className="perfil-flecha" aria-hidden="true" />
            </button>
          </div>
        )}
        {!conCodigo ? (
          <button className="enlace centrado" onClick={() => setConCodigo(true)}>Tengo la patente y el código del taller</button>
        ) : (
          <form className="formulario" onSubmit={entrar}>
            <label className="campo"><span>Patente</span><input value={patente} onChange={e => { setPatente(e.target.value.toUpperCase()); setError(false); }} autoComplete="off" autoFocus required /></label>
            <label className="campo"><span>Código</span><input value={codigo} onChange={e => { setCodigo(e.target.value.toUpperCase()); setError(false); }} autoComplete="off" required /></label>
            {error && <p className="error" role="alert">No encontramos ese vehículo. Revisa la patente y el código.</p>}
            <button className="btn primario grande ancho">Ver mi auto</button>
          </form>
        )}
      </main>
    </div>
  );
}

/**
 * Aprobación digital: el dueño decide desde su portal, sin llamadas. Solo aplica a particulares.
 * Desde el link de WhatsApp (sin servidor) el presupuesto se ve, pero se aprueba respondiendo el mensaje.
 */
function Presupuesto({ o, soloLectura, wspTaller, onRespuesta }: { o: Orden; soloLectura: boolean; wspTaller?: string; onRespuesta: (ok: boolean) => void }) {
  const t = totales(o);
  const [rechazando, setRechazando] = useState(false);
  const responder = (ok: boolean) => {
    actualizar(o.id, x => conEvento(
      { ...x, aprobacion: ok ? 'aprobada' : 'rechazada', items: ok ? x.items.map(i => ({ ...i, adicional: false })) : x.items },
      ok ? 'El cliente aprobó el presupuesto en su portal' : 'El cliente rechazó el presupuesto en su portal',
    ));
    onRespuesta(ok);
  };
  return (
    <section className="presupuesto">
      <h2>Tu presupuesto</h2>
      <ul>{itemsCobrables(o).map(i => <li key={i.id}><span>{tituloItem(i, o.vehiculo.carroceria)}</span><b>{clp(i.monto ?? 0)}</b></li>)}</ul>
      <p className="presupuesto-total"><span>Total con IVA</span><b>{clp(t.total)}</b></p>
      {soloLectura ? (
        <div className="presupuesto-wsp">
          <p>Para aprobarlo, responde <b>«Apruebo»</b> al WhatsApp del taller.</p>
          {wspTaller && <a className="btn primario grande" href={enlaceWhatsApp(wspTaller, `Apruebo el presupuesto de la orden ${o.numero} por ${clp(t.total)}.`)} target="_blank" rel="noreferrer noopener"><WhatsappLogo size={24} /> Responder «Apruebo»</a>}
        </div>
      ) : rechazando ? (
        <div className="presupuesto-confirmar">
          <p>¿Seguro que no quieres hacer el trabajo? El taller te contactará para conversarlo.</p>
          <div>
            <button className="btn secundario grande" onClick={() => responder(false)}>Sí, rechazar</button>
            <button className="btn primario grande" onClick={() => setRechazando(false)}>Volver</button>
          </div>
        </div>
      ) : (
        <div>
          <button className="btn primario grande" onClick={() => responder(true)}><Check size={24} weight="bold" /> Aprobar</button>
          <button className="btn secundario grande" onClick={() => setRechazando(true)}>Rechazar</button>
        </div>
      )}
    </section>
  );
}

const hora = (iso: string) => {
  const d = new Date(iso), hoy = new Date();
  const dia = d.toDateString() === hoy.toDateString() ? 'Hoy' : d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  return `${dia}, ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Lo último que terminó el taller: nota del maestro y fotos de antes y después. */
function Avances({ o }: { o: Orden }) {
  const hechos = o.items.filter((i): i is Item & { terminadoEl: string } => i.estado === 'listo' && !!i.terminadoEl)
    .sort((a, b) => b.terminadoEl.localeCompare(a.terminadoEl));
  if (!hechos.length) return null;
  const foto = (id: string | undefined, nombre: string) => !id ? null : (
    <figure>
      <FotoGuardada id={id} alt={`Foto ${nombre}`} />
      <figcaption>{nombre}</figcaption>
    </figure>
  );
  return (
    <section className="avances">
      <h2>Últimos avances</h2>
      <ol>
        {hechos.map(i => (
          <li key={i.id}>
            <CheckCircle size={28} weight="fill" aria-hidden="true" />
            <div>
              <p className="av-tit"><b>{tituloItem(i, o.vehiculo.carroceria)}</b><time>{hora(i.terminadoEl)}</time></p>
              {i.nota && <p className="av-nota">«{i.nota}»</p>}
              {(i.fotoAntes || i.fotoDespues) && <div className="av-fotos">{foto(i.fotoAntes, 'Antes')}{foto(i.fotoDespues, 'Después')}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ClientePortal({ codigo, instantanea }: { codigo: string; instantanea?: string }) {
  const ordenes = useOrdenes();
  const local = codigo === 'demo' ? ordenDemo(ordenes) : ordenes.find(x => x.codigo === codigo.toUpperCase());
  // Abierto desde el link de WhatsApp: manda lo que trae el link (el avance al momento del aviso).
  // En otro teléfono la demo tiene sus propios autos de ejemplo, que no saben de este avance.
  const delLink = useMemo(() => (instantanea ? desempaquetar(instantanea) : null), [instantanea]);
  const o = delLink ?? local;
  const soloLectura = !!delLink;
  const [respuesta, setRespuesta] = useState<boolean | null>(null);
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
      <header className="barra"><Marca /><span className="barra-usuario"><span className="patente">{verPatente(v.patente)}</span><InterruptorTema /></span></header>
      {/* El administrador que entró con «Ver como cliente» vuelve a su orden con un toque. */}
      {sesion()?.rol === 'admin' && !soloLectura && (
        <p className="vista-cliente">Estás viendo lo que ve el cliente.<button className="enlace" onClick={() => ir(`/admin/ot/${o.id}`)}><ArrowLeft size={18} /> Volver a la orden</button></p>
      )}
      {/* El link lo arma quien lo envía: el cliente debe confirmar con su taller antes de responder o pagar. */}
      {delLink && <p className="vista-cliente">Copia del avance que envió {delLink.taller}. Antes de responder o pagar, confirma que el número sea el de tu taller.</p>}
      <main>
        <section className="portal-hero">
          <div className="portal-3d">
            <Auto3D {...forma(v)} estados={estadosPiezas(o.items)} autoRotate angulo={zaga ? 228 : 40} etiqueta={`Tu ${v.marca} ${v.modelo} en 3D, con las piezas según su avance`} />
          </div>
          <div className="portal-resumen">
            <p className="sub">{v.marca} {v.modelo} {v.anio}</p>
            <p className="pct-grande">{pct}%</p>
            <Barra valor={pct} />
            <p className="portal-estado">{ETAPAS.find(e => e.id === et)!.cliente}. {pct === 100 ? '' : `${hechas} de ${o.items.length} tareas terminadas. Entrega estimada: ${fecha(o.entrega)}.`}</p>
            <Leyenda />
          </div>
        </section>
        <div className="portal-galeria"><GaleriaVistas o={o} /></div>
        <Avances o={o} />
        <ol className="linea-etapas" aria-label="Etapas de la reparación">
          {pasos.map((e, i) => <li key={e.id} className={i < actual ? 'hecha' : i === actual ? 'actual' : ''} aria-current={i === actual ? 'step' : undefined}>{e.nombre}</li>)}
        </ol>
        <div className="portal-tareas">
          {respuesta === true && <p className="aviso-ok" role="status"><CheckCircle size={26} weight="fill" /> ¡Gracias! Aprobaste el presupuesto. El taller ya puede comenzar tu reparación.</p>}
          {o.aprobacion === 'rechazada' && <p className="aviso-rechazo" role="status">Rechazaste el presupuesto. El taller te contactará para conversarlo.</p>}
          {o.aprobacion === 'enviada' && o.pagador.tipo === 'particular' && <Presupuesto o={o} soloLectura={soloLectura} wspTaller={delLink?.wspTaller} onRespuesta={setRespuesta} />}
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
