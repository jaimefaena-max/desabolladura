import { useState } from 'react';
import { ArrowsClockwise, CheckCircle, Gear, MagnifyingGlass, Printer } from '@phosphor-icons/react';
import { Auto3D, Barra, FotoAuto, ir, Pantalla } from '../components/ui';
import { buscarPrecioGemini, claveGemini, guardarClave, probarClave } from '../lib/gemini';
import { clp, estadosPiezas, fecha, itemsCobrables, progreso, tituloItem, totales } from '../lib/piezas';
import { USUARIOS } from '../lib/seed';
import { actualizar, restablecerDemo, useOrden, useOrdenes } from '../lib/store';
import type { Item, Orden } from '../lib/types';
import { verPatente } from '../lib/vehiculos';

export function AdminInicio() {
  const ordenes = useOrdenes();
  const activas = ordenes.filter(o => !o.cobrada);
  const sinPrecio = activas.reduce((a, o) => a + totales(o).faltan, 0);
  const porCobrar = activas.reduce((a, o) => a + totales(o).total, 0);
  const seguros = activas.filter(o => o.pagador.tipo === 'aseguradora').length;
  const [filtro, setFiltro] = useState<'activas' | 'cobradas'>('activas');
  const lista = ordenes.filter(o => (filtro === 'activas' ? !o.cobrada : o.cobrada)).sort((a, b) => totales(b).faltan - totales(a).faltan);

  return (
    <Pantalla titulo="Panel del taller" sub="Fija los montos y cobra cada orden." accion={<button className="btn secundario" onClick={() => ir('/admin/ajustes')}><Gear size={22} /> Ajustes</button>}>
      <dl className="kpis">
        <div><dt>Vehículos en taller</dt><dd>{activas.length}</dd></div>
        <div className={sinPrecio ? 'alerta' : ''}><dt>Trabajos sin monto</dt><dd>{sinPrecio}</dd></div>
        <div><dt>Monto cotizado por cobrar</dt><dd>{clp(porCobrar)}</dd></div>
        <div><dt>De aseguradoras</dt><dd>{seguros} de {activas.length}</dd></div>
      </dl>
      <div className="segmentos filtro">
        <button aria-pressed={filtro === 'activas'} className={filtro === 'activas' ? 'on' : ''} onClick={() => setFiltro('activas')}>Por cobrar</button>
        <button aria-pressed={filtro === 'cobradas'} className={filtro === 'cobradas' ? 'on' : ''} onClick={() => setFiltro('cobradas')}>Cobradas</button>
      </div>
      {lista.length === 0 && <p className="vacio">No hay órdenes en esta lista.</p>}
      <div className="filas-orden">
        {lista.map(o => {
          const t = totales(o), pct = progreso(o.items), v = o.vehiculo;
          return (
            <button key={o.id} className="fila-orden" onClick={() => ir(`/admin/ot/${o.id}`)}>
              <FotoAuto carroceria={v.carroceria} color={v.colorHex} estados={estadosPiezas(o.items)} ancho={360} alto={200} alt={`${v.marca} ${v.modelo}`} />
              <span className="fo-veh"><b>{v.marca} {v.modelo} {v.anio}</b><small>Orden {o.numero} · {verPatente(v.patente)}</small></span>
              <span className="fo-pag"><b>{o.pagador.tipo === 'aseguradora' ? o.pagador.aseguradora : 'Particular'}</b><small>{USUARIOS.find(u => u.id === o.maestroId)?.nombre}</small></span>
              <span className="fo-pct"><b>{pct}%</b><Barra valor={pct} /></span>
              <span className="fo-monto">{t.faltan ? <em>{t.faltan} sin monto</em> : <b>{clp(t.total)}</b>}</span>
            </button>
          );
        })}
      </div>
    </Pantalla>
  );
}

function FilaItem({ o, i }: { o: Orden; i: Item }) {
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const v = o.vehiculo, s = i.sugerido;
  const poner = (c: Partial<Item>) => actualizar(o.id, x => ({ ...x, items: x.items.map(y => (y.id === i.id ? { ...y, ...c } : y)) }));
  const titulo = tituloItem(i, v.carroceria);

  const buscar = async () => {
    setBuscando(true); setError('');
    try { poner({ sugerido: await buscarPrecioGemini(titulo, v) }); }
    catch (e) { setError((e as Error).message); }
    setBuscando(false);
  };

  return (
    <li className="precio-fila">
      <div className="pf-tit"><b>{titulo}</b>{i.severidad && <small>Daño {i.severidad}</small>}</div>
      <div className="pf-sug">
        {s && <><small>Sugerido</small><b>{clp(s.min)} a {clp(s.max)}</b><small className="fuente">{s.fuente}</small></>}
        {s?.enlaces?.map(u => <a key={u} href={u} target="_blank" rel="noreferrer noopener">Ver fuente</a>)}
        {claveGemini() && <button className="enlace" disabled={buscando} onClick={buscar}><MagnifyingGlass size={18} /> {buscando ? 'Buscando…' : 'Buscar en internet'}</button>}
        {error && <small className="error" role="alert">{error}</small>}
      </div>
      <div className="pf-monto">
        <label className="campo"><span>Monto final</span>
          <input inputMode="numeric" value={i.monto === null ? '' : i.monto.toLocaleString('es-CL')} placeholder="$0"
            disabled={o.cobrada} aria-label={`Monto final de ${titulo}`}
            onChange={e => { const n = e.target.value.replace(/\D/g, ''); poner({ monto: n ? Number(n) : null }); }} />
        </label>
        {s && !o.cobrada && <button className="enlace" onClick={() => poner({ monto: Math.round((s.min + s.max) / 10000) * 5000 })}>Usar valor medio</button>}
      </div>
    </li>
  );
}

export function AdminOrden({ id }: { id: string }) {
  const o = useOrden(id);
  if (!o) return <Pantalla volver="/admin" titulo="Orden no encontrada" />;
  const v = o.vehiculo, t = totales(o), pct = progreso(o.items), p = o.pagador;
  const maestro = USUARIOS.find(u => u.id === o.maestroId);

  return (
    <Pantalla volver="/admin" titulo={`Orden ${o.numero}`} sub={`${v.marca} ${v.modelo} ${v.anio} · ${verPatente(v.patente)}`}
      accion={<button className="btn secundario no-print" onClick={() => window.print()}><Printer size={22} /> Imprimir cotización</button>}>
      <div className="dos-col admin">
        <div className="no-print">
          <div className="escena"><Auto3D carroceria={v.carroceria} color={v.colorHex} estados={estadosPiezas(o.items)} etiqueta={`Modelo 3D de ${v.marca} ${v.modelo}`} /></div>
          {o.imagenIA && <img className="imagen-ia" src={o.imagenIA} alt="Imagen del vehículo generada con Gemini" />}
          <div className="avance-caja"><b className="pct">{pct}%</b><div><Barra valor={pct} /><p>Entrega: {fecha(o.entrega)}</p></div></div>
          <dl className="ficha">
            <div><dt>Maestro</dt><dd>{maestro?.nombre}</dd></div>
            <div><dt>Dueño</dt><dd>{o.cliente.nombre}</dd></div>
            <div><dt>RUT</dt><dd>{o.cliente.rut || 'Sin dato'}</dd></div>
            <div><dt>Teléfono</dt><dd>{o.cliente.telefono || 'Sin dato'}</dd></div>
            {p.tipo === 'aseguradora' && <div><dt>Compañía</dt><dd>{p.aseguradora}</dd></div>}
            {p.tipo === 'aseguradora' && <div><dt>Siniestro</dt><dd>{p.siniestro}</dd></div>}
            <div><dt>Código cliente</dt><dd className="codigo-chico">{o.codigo}</dd></div>
          </dl>
          <button className="enlace" onClick={() => ir(`/cliente/${o.codigo}`)}>Abrir el portal de este cliente</button>
        </div>
        <div>
          <div className="solo-print">
            <p><b>DEMOSTRACIÓN, SIN VALIDEZ COMERCIAL</b></p>
            <h2>Desabolladura Premium: cotización orden {o.numero}</h2>
            <p>{v.marca} {v.modelo} {v.anio}, patente {verPatente(v.patente)}. Cliente: {o.cliente.nombre}.{p.tipo === 'aseguradora' ? ` ${p.aseguradora}, siniestro ${p.siniestro}.` : ''}</p>
          </div>
          <h2 className="no-print">Costos por trabajo</h2>
          <ul className="precios">{itemsCobrables(o).map(i => <FilaItem key={i.id} o={o} i={i} />)}</ul>
          <dl className="totales">
            <div><dt>Neto</dt><dd>{clp(t.neto)}</dd></div>
            <div><dt>IVA 19%</dt><dd>{clp(t.iva)}</dd></div>
            <div className="total"><dt>Total</dt><dd>{clp(t.total)}</dd></div>
            {p.tipo === 'aseguradora' && <>
              <div><dt>Paga el cliente (deducible)</dt><dd>{clp(t.deducible)}</dd></div>
              <div><dt>Paga {p.aseguradora}</dt><dd>{clp(t.aseguradora)}</dd></div>
            </>}
          </dl>
          {t.faltan > 0 && <p className="pista no-print">Faltan {t.faltan} montos por definir.</p>}
          {o.cobrada ? (
            <p className="aviso-ok"><CheckCircle size={24} /> Orden cobrada</p>
          ) : (
            <button className="btn primario grande ancho no-print" disabled={t.faltan > 0} onClick={() => actualizar(id, x => ({ ...x, cobrada: true }))}>Marcar como cobrada</button>
          )}
        </div>
      </div>
    </Pantalla>
  );
}

export function Ajustes() {
  const [k, setK] = useState(claveGemini());
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [probando, setProbando] = useState(false);
  const guardar = async () => {
    guardarClave(k);
    setMsg(null);
    if (!k) { setMsg({ ok: true, t: 'Gemini desconectado.' }); return; }
    setProbando(true);
    try { await probarClave(); setMsg({ ok: true, t: 'Gemini conectado.' }); }
    catch (e) { setMsg({ ok: false, t: (e as Error).message }); }
    setProbando(false);
  };
  return (
    <Pantalla volver="/admin" titulo="Ajustes">
      <section className="formulario angosto">
        <h2>Conectar Gemini</h2>
        <p className="sub">Activa la lectura de padrón con IA, la búsqueda de precios en internet y las imágenes generadas. Sin clave, la foto se procesa en este equipo (el motor de lectura se descarga de internet) y los precios salen de una tabla orientativa.</p>
        <label className="campo"><span>Clave de API de Gemini</span>
          <input type="password" value={k} onChange={e => setK(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <p className="pista">La clave queda solo en este navegador. Con Gemini conectado, las fotos de padrón se envían a Google y pueden incluir nombre y RUT del dueño: usa solo el padrón de ejemplo.</p>
        <button className="btn primario grande" disabled={probando} onClick={guardar}>{probando ? 'Probando…' : 'Guardar y probar'}</button>
        {msg && <p className={msg.ok ? 'aviso-ok' : 'error'} role="status">{msg.t}</p>}
        <h2 className="seccion">Datos de ejemplo</h2>
        <button className="btn secundario grande" onClick={() => { if (confirm('Se borrarán los cambios y volverán los datos de ejemplo. ¿Continuar?')) restablecerDemo(); }}><ArrowsClockwise size={24} /> Restablecer demostración</button>
      </section>
    </Pantalla>
  );
}
