import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwise, Bell, Camera, Check, CheckCircle, CurrencyCircleDollar, FilePdf, Receipt, FolderOpen, Timer, Eye, HourglassMedium, MagnifyingGlass, PaperPlaneTilt, PencilSimple, Phone, Plus, Printer, Truck, WarningCircle, WhatsappLogo, XCircle } from '../components/iconos';
import { Auto3D, Barra, forma, FotoGuardada, FotoOrden, Galeria, GaleriaVistas, ir, Logo, Pantalla } from '../components/ui';
import { CotizacionDoc, imprimirDocumento } from '../components/Cotizacion';
import FilaRepuesto from '../components/FilaRepuesto';
import Rentabilidad, { TEXTO_SEMAFORO } from '../components/Rentabilidad';
import { resumenRentabilidad } from '../lib/rentabilidad';
import Costos from '../components/Costos';
import { costoHoraDelMes, restablecerCostos } from '../lib/costos';
import { ExpedienteDoc } from '../components/Expediente';
import { cobradaSeguro, estadoFactura, nombreEstado, siguienteFactura, vencimiento } from '../lib/cobranza';
import { enlaceSeguimiento, mensajePresupuesto } from '../lib/seguimiento';
import { alertas, CMF_REPARACION, conEvento, diasEnTaller, enlaceWhatsApp, semaforoPlazo, ETAPAS, etapaDe, mensajeCliente, metricas, nombreEtapa } from '../lib/automatizacion';
import { buscarPrecioGemini, claveGemini, guardarClave, probarClave } from '../lib/gemini';
import { reducirImagen } from '../lib/padron';
import { clp, estadosPiezas, fecha, fechaLocal, itemsCobrables, progreso, TRABAJOS, tituloItem, totales } from '../lib/piezas';
import { USUARIOS } from '../lib/seed';
import { actualizar, cambiarEmpresa, crearEmpresa, editarEmpresa, restablecerDemo, useEmpresa, useEmpresas, useOrden, useOrdenes } from '../lib/store';
import type { Item, Orden } from '../lib/types';
import { verPatente } from '../lib/vehiculos';

export function Tablero() {
  const ordenes = useOrdenes();
  const activas = ordenes.filter(o => !o.entregadaEl);
  const avisos = useMemo(() => alertas(ordenes), [ordenes]);
  const columnas = ETAPAS.filter(e => e.id !== 'entregado');
  return (
    <Pantalla titulo="Tablero del taller" sub="Cada vehículo cambia de etapa solo, según el avance del trabajador.">
      {avisos.length > 0 && (
        <section className="avisos" aria-label="Alertas">
          <h2><Bell size={26} /> Para hoy <span className="contador">{avisos.length}</span></h2>
          <div className="avisos-lista">
            {avisos.map(a => (
              <button key={a.id} className={a.urgente ? 'urgente' : ''} onClick={() => ir(`/admin/ot/${a.ordenId}`)}>
                {a.urgente && <WarningCircle size={24} weight="fill" />}<span>{a.texto}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="kanban">
        {columnas.map(c => {
          const lista = activas.filter(o => etapaDe(o) === c.id);
          return (
            <section key={c.id} className="columna" aria-label={c.nombre}>
              <h2>{c.nombre} <span>{lista.length}</span></h2>
              {lista.map(o => {
                const pct = progreso(o.items), v = o.vehiculo;
                return (
                  <button key={o.id} className="tarjeta-k" onClick={() => ir(`/admin/ot/${o.id}`)}>
                    <FotoOrden o={o} ancho={400} alto={225} />
                    <b>{v.marca} {v.modelo}</b>
                    <small>{verPatente(v.patente)} · Entrega {fecha(o.entrega)}</small>
                    <span className="tarjeta-pct"><Barra valor={pct} /><b>{pct}%</b></span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </Pantalla>
  );
}

export function Ordenes() {
  const ordenes = useOrdenes();
  const [filtro, setFiltro] = useState<'activas' | 'cobradas'>('activas');
  const [q, setQ] = useState('');
  const txt = q.trim().toLowerCase();
  const lista = ordenes
    .filter(o => (filtro === 'activas' ? !o.cobrada : o.cobrada))
    .filter(o => !txt || `${o.vehiculo.patente} ${o.vehiculo.marca} ${o.vehiculo.modelo} ${o.cliente.nombre} ${o.numero}`.toLowerCase().includes(txt.replace(/-/g, '')));
  return (
    <Pantalla titulo="Órdenes" sub="Fija los montos y cobra cada orden.">
      <div className="buscar-fila">
        <div className="segmentos">
          <button aria-pressed={filtro === 'activas'} className={filtro === 'activas' ? 'on' : ''} onClick={() => setFiltro('activas')}>Por cobrar</button>
          <button aria-pressed={filtro === 'cobradas'} className={filtro === 'cobradas' ? 'on' : ''} onClick={() => setFiltro('cobradas')}>Cobradas</button>
        </div>
        <label className="campo buscar"><MagnifyingGlass size={24} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar patente, cliente o modelo" aria-label="Buscar orden" /></label>
      </div>
      {lista.length === 0 && <p className="vacio">No hay órdenes en esta lista.</p>}
      <div className="filas-orden">
        {lista.map(o => {
          const t = totales(o), pct = progreso(o.items), v = o.vehiculo;
          return (
            <button key={o.id} className="fila-orden" onClick={() => ir(`/admin/ot/${o.id}`)}>
              <FotoOrden o={o} ancho={360} alto={200} />
              <span className="fo-veh"><b>{v.marca} {v.modelo} {v.anio}</b><small>Orden {o.numero} · {verPatente(v.patente)}</small></span>
              <span className="fo-pag"><b>{o.pagador.tipo === 'aseguradora' ? o.pagador.aseguradora : 'Particular'}</b><small>{nombreEtapa(etapaDe(o))}</small></span>
              <span className="fo-pct"><b>{pct}%</b><Barra valor={pct} /></span>
              <span className="fo-monto">{t.faltan ? <em>{t.faltan} sin monto</em> : <b>{clp(t.total)}</b>}</span>
            </button>
          );
        })}
      </div>
    </Pantalla>
  );
}

export function Reportes() {
  const ordenes = useOrdenes(), empresa = useEmpresa();
  const m = metricas(ordenes);
  const rb = resumenRentabilidad(ordenes, empresa, p => costoHoraDelMes(empresa.id, p));
  const topeMargen = Math.max(...rb.tipos.map(t => Math.abs(t.margen)), ...rb.pagadores.map(p => Math.abs(p.margen)), 1);
  const tope = Math.max(...m.meses.map(x => x.valor), 1);
  const topeTipo = Math.max(...m.tipos.map(t => t[1]), 1);
  const nombreTipo = (id: string) => TRABAJOS.find(t => t.id === id)?.nombre ?? id;
  return (
    <Pantalla titulo="Reportes" sub="Cómo va el negocio, calculado con las órdenes del taller.">
      <dl className="kpis">
        <div><dt>Ingresos cobrados</dt><dd>{clp(m.ingresos)}</dd></div>
        <div><dt>Valor promedio por orden</dt><dd>{clp(m.ticket)}</dd></div>
        <div><dt>Días promedio en taller</dt><dd>{m.ciclo.toLocaleString('es-CL')}</dd></div>
        <div><dt>Ingresos de aseguradoras</dt><dd>{m.pctSeguro}%</dd></div>
      </dl>
      <div className="reportes">
        <section>
          <h2>Ingresos cobrados por mes</h2>
          <div className="grafico" role="img" aria-label={`Ingresos por mes: ${m.meses.map(x => `${x.mes} ${clp(x.valor)}`).join(', ')}`}>
            {m.meses.map(x => (
              <div key={x.mes} title={`${x.mes}: ${clp(x.valor)}`}>
                <small>{x.valor ? `$${Math.round(x.valor / 1000)} mil` : ''}</small>
                <i style={{ height: `${(x.valor / tope) * 100}%` }} />
                <span>{x.mes}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2>Trabajos por tipo</h2>
          <ul className="barras-h">
            {m.tipos.map(([id, n]) => <li key={id} title={`${nombreTipo(id)}: ${n}`}><span>{nombreTipo(id)}</span><div><i style={{ width: `${(n / topeTipo) * 100}%` }} /><b>{n}</b></div></li>)}
          </ul>
        </section>
      </div>

      <h2 className="seccion">Rentabilidad</h2>
      <p className="sub">Lo cobrado (neto) menos mano de obra, pintura e insumos y repuestos. Con valores estimados donde aún no hay datos reales.</p>
      <dl className="kpis">
        <div><dt>Ganancia</dt><dd>{clp(rb.ganancia)}</dd></div>
        <div><dt>Margen del taller</dt><dd>{rb.margen} %</dd></div>
        <div><dt>Órdenes calculadas</dt><dd>{rb.filas.length}</dd></div>
        <div className={rb.peores[0]?.r.margen < 15 ? 'alerta' : ''}><dt>Margen más bajo</dt><dd>{rb.peores[0] ? `${rb.peores[0].r.margen} %` : '—'}</dd></div>
      </dl>
      <div className="reportes">
        <section>
          <h2>Margen por tipo de trabajo</h2>
          <ul className="barras-h margen">
            {rb.tipos.map(t => <li key={t.id} title={`${t.nombre}: ${t.margen} % sobre ${clp(t.ingreso)}`} className={t.margen < 15 ? 'bajo' : ''}><span>{t.nombre}</span><div><i style={{ width: `${(Math.max(0, t.margen) / topeMargen) * 85}%` }} /><b>{t.margen} %</b></div></li>)}
          </ul>
          <p className="pista">El trabajo que más deja va primero. Si uno queda bajo 15 %, conviene revisar su precio.</p>
        </section>
        <section>
          <h2>Margen por quién paga</h2>
          <ul className="barras-h margen">
            {rb.pagadores.map(p => <li key={p.nombre} title={`${p.nombre}: ${p.ordenes} órdenes, ${clp(p.ganancia)}`} className={p.margen < 15 ? 'bajo' : ''}><span>{p.nombre}</span><div><i style={{ width: `${(Math.max(0, p.margen) / topeMargen) * 85}%` }} /><b>{p.margen} %</b></div></li>)}
          </ul>
          {rb.peores.length > 0 && <>
            <h3 className="rb-subtit">Órdenes que menos dejan</h3>
            <ul className="rb-peores">
              {rb.peores.map(({ o, r }) => (
                <li key={o.id}><button className="enlace" onClick={() => ir(`/admin/ot/${o.id}`)}>Orden {o.numero} · {o.vehiculo.marca} {o.vehiculo.modelo}</button><span className={`chip rb-${r.semaforo}`}>{r.margen} % · {TEXTO_SEMAFORO[r.semaforo]}</span></li>
              ))}
            </ul>
          </>}
        </section>
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
      <div className="pf-tit"><b>{titulo}{i.adicional && <span className="sello">Adicional</span>}</b>{i.severidad && <small>Daño {i.severidad}</small>}</div>
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

/**
 * Presupuesto de un particular que espera respuesta. En la vida real el cliente aprueba en su
 * portal, por teléfono, por WhatsApp o en el mesón: el taller necesita poder registrar cualquiera.
 */
function RespuestaCliente({ o, aprobar }: { o: Orden; aprobar: (como: string) => void }) {
  const empresa = useEmpresa();
  const [confirmando, setConfirmando] = useState(false);
  const t = totales(o), tel = o.cliente.telefono, rechazo = o.aprobacion === 'rechazada';
  const volverARevisar = () => actualizar(o.id, x => conEvento({ ...x, aprobacion: 'pendiente' }, 'Presupuesto en revisión para reenviar'));

  return (
    <section className={`espera-cliente ${rechazo ? 'rechazo' : ''}`} aria-live="polite">
      <p className="ec-tit">{rechazo ? <XCircle size={26} weight="fill" /> : <HourglassMedium size={26} weight="fill" />}<b>{rechazo ? 'El cliente rechazó el presupuesto' : 'Esperando al cliente'}</b></p>
      <p className="ec-sub">{rechazo ? 'Puedes ajustar los montos y reenviarlo, o registrar si después lo aprobó.' : `Presupuesto por ${clp(t.total)} enviado. El cliente puede aprobarlo de cualquiera de estas formas:`}</p>
      {!rechazo && <button className="btn primario grande ancho" onClick={() => ir(`/cliente/${o.codigo}`)}><Eye size={24} /> Ver como cliente y aprobar</button>}
      {rechazo && <button className="btn primario grande ancho" onClick={volverARevisar}><PencilSimple size={24} /> Ajustar montos y reenviar</button>}
      {confirmando ? (
        <div className="ec-confirmar" role="group" aria-label="Confirmar aprobación">
          <p>¿El cliente aprobó {clp(t.total)}? Quedará registrado en el historial.</p>
          <div>
            <button className="btn primario" onClick={() => aprobar('por teléfono, WhatsApp o en persona (registrado por el taller)')}><Check size={22} weight="bold" /> Sí, aprobó</button>
            <button className="btn secundario" onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button className="btn secundario grande ancho" onClick={() => setConfirmando(true)}><Phone size={24} /> {rechazo ? 'Después lo aprobó' : 'Aprobó por teléfono, WhatsApp o en persona'}</button>
      )}
      {tel && (
        <a className="btn secundario grande ancho" target="_blank" rel="noreferrer noopener"
          href={enlaceWhatsApp(tel, rechazo ? `${mensajeCliente(o, empresa)} ¿Podemos conversar el presupuesto de su ${o.vehiculo.marca} ${o.vehiculo.modelo}?` : mensajePresupuesto(o, empresa, true))}>
          <WhatsappLogo size={26} /> {rechazo ? 'Conversar por WhatsApp' : 'Recordar por WhatsApp'}
        </a>
      )}
    </section>
  );
}

/**
 * Cobro de una orden con seguro: deducible al asegurado y factura a la compañía (Ley 19.983: 30 días).
 * Cuando ambos están pagados, la orden queda cobrada sola.
 */
function CobroSeguro({ o }: { o: Orden }) {
  const ordenes = useOrdenes();
  const [confirmando, setConfirmando] = useState(false);
  const t = totales(o), et = etapaDe(o), f = o.factura, cia = o.pagador.aseguradora ?? 'la compañía';
  const listo = et === 'entrega' || et === 'entregado';
  const cambiar = (c: Partial<Orden>, texto: string) => actualizar(o.id, x => {
    const n = { ...x, ...c };
    return conEvento({ ...n, cobrada: cobradaSeguro(n) }, texto);
  });
  const e = f && estadoFactura(f);

  if (o.cobrada) return <p className="aviso-ok"><CheckCircle size={24} /> Orden cobrada: {cia} pagó{t.deducible ? ' y el asegurado pagó su deducible' : ''}.</p>;
  if (!listo && !f) return <p className="pista">La factura a {cia} y el deducible se cobran al entregar el vehículo.</p>;
  return (
    <section className="cobro-seguro" aria-label="Cobro de la orden">
      <h3>Cobro</h3>
      {t.deducible > 0 && (
        <div className="cs-fila">
          <div><b>Deducible del asegurado</b><small>{clp(t.deducible)} · se paga al retirar</small></div>
          {o.deducibleCobradoEl ? <span className="chip ok">Cobrado {fecha(o.deducibleCobradoEl)}</span>
            : <button className="btn secundario" onClick={() => cambiar({ deducibleCobradoEl: fechaLocal() }, `Deducible cobrado al asegurado (${clp(t.deducible)})`)}>Cobrar deducible</button>}
        </div>
      )}
      <div className="cs-fila">
        <div>
          <b>Factura a {cia}</b>
          <small>{f ? `N.º ${f.numero} · emitida ${fecha(f.emitida)} · vence ${fecha(vencimiento(f))}` : `${clp(t.aseguradora)} con IVA · plazo legal 30 días`}</small>
        </div>
        {!f ? (
          <button className="btn primario" disabled={t.faltan > 0} onClick={() => {
            const numero = siguienteFactura(ordenes);
            cambiar({ factura: { numero, emitida: fechaLocal(), monto: t.aseguradora } }, `Factura N.º ${numero} emitida a ${cia} por ${clp(t.aseguradora)}`);
          }}><Receipt size={22} /> Emitir factura</button>
        ) : <span className={`chip ${e!.estado}`}>{nombreEstado(e!)}</span>}
      </div>
      {f && !f.pagadaEl && e!.estado === 'vencida' && <p className="pista">Atrasada: corre interés por mora y una comisión de cobranza de {clp(e!.comision)} (1 %, Ley 19.983).</p>}
      {f && !f.pagadaEl && (confirmando ? (
        <div className="ec-confirmar" role="group" aria-label="Confirmar pago">
          <p>¿{cia} pagó la factura N.º {f.numero} por {clp(f.monto)}?</p>
          <div>
            <button className="btn primario" onClick={() => { setConfirmando(false); cambiar({ factura: { ...f, pagadaEl: fechaLocal() } }, `${cia} pagó la factura N.º ${f.numero} (${clp(f.monto)})`); }}><Check size={22} weight="bold" /> Sí, pagó</button>
            <button className="btn secundario" onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        </div>
      ) : <button className="btn secundario grande ancho" onClick={() => setConfirmando(true)}><CurrencyCircleDollar size={24} /> Registrar pago de {cia}</button>)}
      {t.faltan > 0 && !f && <p className="pista">Faltan {t.faltan} montos para emitir la factura.</p>}
    </section>
  );
}

function Acciones({ o }: { o: Orden }) {
  const empresa = useEmpresa();
  const t = totales(o), et = etapaDe(o), seguro = o.pagador.tipo === 'aseguradora';
  const cambiar = (c: Partial<Orden>, texto: string) => actualizar(o.id, x => conEvento({ ...x, ...c }, texto));
  const aprobar = (como = '') => cambiar({ aprobacion: 'aprobada', items: o.items.map(i => ({ ...i, adicional: false })) }, seguro ? 'Compañía autorizó el presupuesto' : `Presupuesto aprobado${como ? ` ${como}` : ''}`);
  // Enviar = registrar el envío y abrir WhatsApp con el total y el link (el clic permite abrir la ventana).
  const enviar = () => {
    const nueva = conEvento({ ...o, aprobacion: 'enviada' as const }, 'Presupuesto enviado al cliente');
    actualizar(o.id, () => nueva);
    if (o.cliente.telefono) window.open(enlaceWhatsApp(o.cliente.telefono, mensajePresupuesto(nueva, empresa)), '_blank', 'noopener');
  };
  const esperando = !seguro && (o.aprobacion === 'enviada' || o.aprobacion === 'rechazada');

  return (
    <div className="acciones no-print">
      {o.aprobacion === 'pendiente' && !seguro && <button className="btn primario grande ancho" disabled={t.faltan > 0} onClick={enviar}><PaperPlaneTilt size={24} /> Enviar presupuesto al cliente</button>}
      {esperando && <RespuestaCliente o={o} aprobar={aprobar} />}
      {(o.aprobacion === 'pendiente' && seguro) && <button className="btn primario grande ancho" disabled={t.faltan > 0} onClick={() => aprobar()}><CheckCircle size={24} /> La compañía autorizó</button>}
      {et === 'entrega' && <button className="btn primario grande ancho" onClick={() => cambiar({ entregadaEl: fechaLocal(), items: o.items.map(i => ({ ...i, estado: 'listo' as const })) }, 'Vehículo entregado')}><Truck size={24} /> Marcar como entregado</button>}
      {seguro ? <CobroSeguro o={o} /> : o.cobrada ? <p className="aviso-ok"><CheckCircle size={24} /> Orden cobrada</p> : (
        <button className="btn secundario grande ancho" disabled={t.faltan > 0} onClick={() => cambiar({ cobrada: true }, 'Orden cobrada')}>Marcar como cobrada</button>
      )}
      {o.cliente.telefono && !esperando && <a className="btn secundario grande ancho" href={enlaceWhatsApp(o.cliente.telefono, `${mensajeCliente(o, empresa)}
${enlaceSeguimiento(o, empresa.nombre)}`)} target="_blank" rel="noreferrer noopener"><WhatsappLogo size={26} /> Avisar por WhatsApp</a>}
      {t.faltan > 0 && <p className="pista">Faltan {t.faltan} montos por definir.</p>}
    </div>
  );
}

/** Días en el taller frente al promedio nacional de la CMF: el argumento del taller rápido ante la compañía. */
function PlazoCMF({ o }: { o: Orden }) {
  const dias = diasEnTaller(o), meta = CMF_REPARACION.enTaller, s = semaforoPlazo(dias);
  const texto = { ok: 'Bajo la referencia CMF', atento: 'Cerca de la referencia CMF', atrasado: 'Sobre la referencia CMF' }[s];
  return (
    <section className={`plazo-cmf ${s}`} aria-label="Plazo en el taller">
      <p><Timer size={22} weight="fill" /><b>Día {dias} en el taller</b><span>{texto}</span></p>
      <div className="plazo-barra"><i style={{ width: `${Math.min(100, (dias / meta) * 100)}%` }} /></div>
      <small>Referencia dentro del taller: ≈{Math.round(meta)} días (estimación propia con datos de la CMF, {CMF_REPARACION.periodo}).</small>
    </section>
  );
}

/** Trabajos descubiertos al desarmar: la compañía los autoriza aparte, con foto de cada daño. */
function Adicionales({ o, onSolicitud }: { o: Orden; onSolicitud: () => void }) {
  const lista = itemsCobrables(o).filter(i => i.adicional);
  if (!lista.length) return null;
  const sinFoto = lista.filter(i => !i.fotoAntes).length;
  const neto = lista.reduce((a, i) => a + (i.monto ?? 0), 0);
  return (
    <section className="adicionales-caja">
      <p className="ec-tit"><WarningCircle size={26} weight="fill" /><b>{lista.length} adicional{lista.length > 1 ? 'es' : ''} por autorizar</b></p>
      <p className="ec-sub">Daños encontrados al desarmar. La compañía los autoriza aparte: envíale la solicitud con la foto de cada uno.</p>
      <ul>
        {lista.map(i => (
          <li key={i.id}>
            {i.fotoAntes ? <FotoGuardada id={i.fotoAntes} alt={`Daño en ${tituloItem(i, o.vehiculo.carroceria)}`} /> : <span className="sin-foto"><Camera size={22} />Falta foto</span>}
            <div><b>{tituloItem(i, o.vehiculo.carroceria)}</b><small>{i.monto === null ? 'Sin monto' : clp(i.monto)}</small></div>
          </li>
        ))}
      </ul>
      {sinFoto > 0 && <p className="pista">{sinFoto} sin foto: el trabajador la saca desde su tarea («Foto para el liquidador»).</p>}
      <button className="btn primario grande ancho" onClick={onSolicitud}><FilePdf size={24} /> Solicitud de adicionales ({clp(neto)} neto)</button>
    </section>
  );
}

type Documento = 'cotizacion' | 'expediente' | 'adicionales';

export function AdminOrden({ id }: { id: string }) {
  const o = useOrden(id);
  // Se arma solo el documento pedido; se imprime cuando sus fotos (IndexedDB) alcanzaron a cargar.
  const [doc, setDoc] = useState<Documento | null>(null);
  useEffect(() => {
    if (!doc || !o) return;
    const nombre = { cotizacion: 'Cotizacion', expediente: 'Expediente', adicionales: 'Adicionales' }[doc];
    const t = setTimeout(() => imprimirDocumento(`${nombre}-${o.numero}-${o.vehiculo.patente}`, () => setDoc(null)), 450);
    return () => clearTimeout(t);
  }, [doc, o]);
  if (!o) return <Pantalla volver="/admin" titulo="Orden no encontrada" />;
  const v = o.vehiculo, t = totales(o), pct = progreso(o.items), p = o.pagador;
  const maestro = USUARIOS.find(u => u.id === o.maestroId);
  const seguro = p.tipo === 'aseguradora';

  return (
    <Pantalla volver="/admin" titulo={`Orden ${o.numero}`} sub={`${v.marca} ${v.modelo} ${v.anio} · ${verPatente(v.patente)} · ${nombreEtapa(etapaDe(o))}`}
      accion={
        <div className="acciones-titulo no-print">
          {seguro && <button className="btn secundario" onClick={() => setDoc('expediente')}><FolderOpen size={22} /> Expediente para la compañía</button>}
          <button className="btn secundario" onClick={() => setDoc('cotizacion')}><Printer size={22} /> Descargar cotización</button>
        </div>
      }>
      {doc === 'cotizacion' && <CotizacionDoc o={o} />}
      {doc === 'expediente' && <ExpedienteDoc o={o} />}
      {doc === 'adicionales' && <ExpedienteDoc o={o} soloAdicionales />}
      <div className="dos-col admin">
        <div className="no-print">
          <GaleriaVistas o={o} />
          <div className="escena"><Auto3D {...forma(v)} estados={estadosPiezas(o.items)} etiqueta={`Modelo 3D de ${v.marca} ${v.modelo}`} /></div>
          <div className="avance-caja"><b className="pct">{pct}%</b><div><Barra valor={pct} /><p>Entrega: {fecha(o.entrega)}</p></div></div>
          {seguro && <PlazoCMF o={o} />}
          <dl className="ficha">
            <div><dt>Ingresó</dt><dd>{maestro?.nombre}</dd></div>
            <div><dt>Dueño</dt><dd>{o.cliente.nombre}</dd></div>
            <div><dt>RUT</dt><dd>{o.cliente.rut || 'Sin dato'}</dd></div>
            <div><dt>Teléfono</dt><dd>{o.cliente.telefono || 'Sin dato'}</dd></div>
            {p.tipo === 'aseguradora' && <div><dt>Compañía</dt><dd>{p.aseguradora}</dd></div>}
            {p.tipo === 'aseguradora' && <div><dt>Siniestro</dt><dd>{p.siniestro}</dd></div>}
            {o.recepcion.km !== null && <div><dt>Kilometraje</dt><dd>{o.recepcion.km.toLocaleString('es-CL')} km</dd></div>}
            <div><dt>Combustible</dt><dd>{o.recepcion.combustible}</dd></div>
            {o.recepcion.observaciones && <div><dt>Recepción</dt><dd>{o.recepcion.observaciones}</dd></div>}
            <div><dt>Código cliente</dt><dd className="codigo-chico">{o.codigo}</dd></div>
          </dl>
          <button className="enlace" onClick={() => ir(`/cliente/${o.codigo}`)}>Abrir el portal de este cliente</button>
          {o.repuestos.length > 0 && <section className="seccion-bloque"><h2>Repuestos</h2><ul className="repuestos">{o.repuestos.map(r => <FilaRepuesto key={r.id} o={o} r={r} />)}</ul></section>}
          <Galeria fotos={o.fotos} />
          <section className="seccion-bloque">
            <h2>Historial</h2>
            <ol className="historial">{o.historial.slice(0, 12).map((e, i) => <li key={i}><time>{new Date(e.fecha).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>{e.texto}</li>)}</ol>
          </section>
        </div>
        <div>
          {seguro && <Adicionales o={o} onSolicitud={() => setDoc('adicionales')} />}
          <h2>Costos por trabajo</h2>
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
          <Rentabilidad o={o} />
          <Acciones o={o} />
        </div>
      </div>
    </Pantalla>
  );
}

export function Ajustes() {
  const empresa = useEmpresa(), empresas = useEmpresas();
  const logo = useRef<HTMLInputElement>(null);
  const [nueva, setNueva] = useState('');
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
    <Pantalla titulo="Ajustes">
      <div className="ajustes-grid">
      <section className="ajuste-tarjeta">
        <h2>Marca del taller</h2>
        <p className="sub">Cada empresa usa la app con su nombre, logo y color.</p>
        <div className="logo-editor">
          <Logo />
          <button className="btn secundario" onClick={() => logo.current?.click()}>Subir logo</button>
          {empresa.logo && <button className="enlace" onClick={() => editarEmpresa({ logo: undefined })}>Quitar</button>}
          <input ref={logo} type="file" accept="image/*" hidden aria-label="Logo del taller" onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) editarEmpresa({ logo: await reducirImagen(f, 300) });
          }} />
        </div>
        <div className="campos">
          <label className="campo"><span>Nombre del taller</span><input value={empresa.nombre} onChange={e => editarEmpresa({ nombre: e.target.value })} autoComplete="off" /></label>
          <label className="campo"><span>Color de la marca</span><input type="color" value={empresa.acento} onChange={e => editarEmpresa({ acento: e.target.value })} /></label>
        </div>
      </section>

      <Costos />

      <section className="ajuste-tarjeta">
        <h2>Empresas</h2>
        <p className="sub">Cada empresa tiene sus datos separados.</p>
        <div className="empresas">
          {empresas.map(e => <button key={e.id} aria-pressed={e.id === empresa.id} className={e.id === empresa.id ? 'on' : ''} onClick={() => cambiarEmpresa(e.id)}>{e.nombre || 'Sin nombre'}</button>)}
        </div>
        <form className="nueva-empresa" onSubmit={ev => { ev.preventDefault(); if (nueva.trim()) { crearEmpresa(nueva); setNueva(''); } }}>
          <label className="campo"><span>Agregar empresa</span><input value={nueva} onChange={e => setNueva(e.target.value)} autoComplete="off" /></label>
          <button className="btn primario" disabled={!nueva.trim()}><Plus size={22} /> Agregar</button>
        </form>
      </section>

      <section className="ajuste-tarjeta">
        <h2>Conectar Gemini</h2>
        <p className="sub">Activa la lectura de padrón con IA, la búsqueda de precios en internet y las imágenes generadas. Sin clave, la foto se procesa en este equipo (solo el diccionario de español se descarga de internet) y los precios salen de una tabla orientativa.</p>
        <label className="campo"><span>Clave de API de Gemini</span>
          <input type="password" value={k} onChange={e => setK(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <p className="pista">La clave queda solo en este navegador. Con Gemini conectado, las fotos de padrón se envían a Google y pueden incluir nombre y RUT del dueño: usa solo el padrón de ejemplo.</p>
        <button className="btn primario grande" disabled={probando} onClick={guardar}>{probando ? 'Probando…' : 'Guardar y probar'}</button>
        {msg && <p className={msg.ok ? 'aviso-ok' : 'error'} role="status">{msg.t}</p>}
      </section>

      <section className="ajuste-tarjeta">
        <h2>Datos de ejemplo</h2>
        <p className="sub">Vuelve la demostración a como venía: órdenes, cobros y repuestos de ejemplo.</p>
        <button className="btn secundario grande" onClick={() => { if (confirm('Se borrarán los cambios de esta empresa. ¿Continuar?')) { restablecerDemo(); restablecerCostos(empresa.id); } }}><ArrowsClockwise size={24} /> Restablecer datos</button>
      </section>
      </div>
    </Pantalla>
  );
}
