import { useState } from 'react';
import { Check, EnvelopeSimple, Scales } from '../components/iconos';
import { ir, Pantalla } from '../components/ui';
import { conEvento } from '../lib/automatizacion';
import { cobradaSeguro, correoRecordatorio, nombreEstado, resumenCobranza, vencimiento, type FilaCobranza } from '../lib/cobranza';
import { clp, fecha, fechaLocal, totales } from '../lib/piezas';
import { actualizar, useEmpresa, useOrdenes } from '../lib/store';
import { verPatente } from '../lib/vehiculos';

/** Registrar un pago, con confirmación: es plata y queda en el historial de la orden. */
function Pagar({ x }: { x: FilaCobranza }) {
  const [confirmando, setConfirmando] = useState(false);
  const cia = x.o.pagador.aseguradora;
  if (!confirmando) return <button className="btn secundario" onClick={() => setConfirmando(true)}><Check size={20} weight="bold" /> Pagó</button>;
  return (
    <span className="cb-confirmar">
      <button className="btn primario" onClick={() => actualizar(x.o.id, o => {
        const n = { ...o, factura: { ...x.f, pagadaEl: fechaLocal() } };
        return conEvento({ ...n, cobrada: cobradaSeguro(n) }, `${cia} pagó la factura N.º ${x.f.numero} (${clp(x.f.monto)})`);
      })}>Confirmar pago</button>
      <button className="enlace" onClick={() => setConfirmando(false)}>Cancelar</button>
    </span>
  );
}

/**
 * Cobranza: la plata del taller en manos de las compañías y de los asegurados.
 * Ordena por urgencia y aplica el plazo legal de 30 días (Ley 19.983, modificada por la Ley 21.131).
 */
export function Cobranza() {
  const ordenes = useOrdenes(), empresa = useEmpresa();
  const r = resumenCobranza(ordenes);
  const [verPagadas, setVerPagadas] = useState(false);
  const lista = verPagadas ? r.pagadas : r.abiertas;

  return (
    <Pantalla titulo="Cobranza" sub="Lo que te deben las compañías de seguros y los asegurados, ordenado por urgencia.">
      <dl className="kpis">
        <div><dt>Por cobrar a compañías</dt><dd>{clp(r.porCobrar)}</dd></div>
        <div className={r.nVencidas ? 'alerta' : ''}><dt>Vencido ({r.nVencidas})</dt><dd>{clp(r.vencido)}</dd></div>
        <div><dt>Vence en 7 días ({r.nPorVencer})</dt><dd>{clp(r.porVencer)}</dd></div>
        <div><dt>Deducibles por cobrar</dt><dd>{clp(r.deduciblesPendientes)}</dd></div>
      </dl>

      {r.sinFacturar.length > 0 && (
        <p className="cb-aviso">{r.sinFacturar.length} vehículo(s) entregado(s) sin facturar a la compañía ({clp(r.sinFacturarMonto)}). Emite la factura desde la orden: el plazo de 30 días corre desde que la compañía la recibe.</p>
      )}

      <div className="cb-grid">
        <section>
          <div className="titulo-fila chico">
            <h2>Facturas a compañías</h2>
            <div className="segmentos dos" role="group" aria-label="Filtrar facturas">
              <button aria-pressed={!verPagadas} className={!verPagadas ? 'on' : ''} onClick={() => setVerPagadas(false)}>Por cobrar ({r.abiertas.length})</button>
              <button aria-pressed={verPagadas} className={verPagadas ? 'on' : ''} onClick={() => setVerPagadas(true)}>Pagadas ({r.pagadas.length})</button>
            </div>
          </div>
          {lista.length === 0 && <p className="vacio">{verPagadas ? 'Aún no hay facturas pagadas.' : 'No hay facturas por cobrar. ¡Todo al día!'}</p>}
          <ul className="cb-facturas">
            {lista.map(x => {
              const v = x.o.vehiculo;
              return (
                <li key={x.o.id} className={x.e.estado}>
                  <button className="cb-orden" onClick={() => ir(`/admin/ot/${x.o.id}`)}>
                    <b>N.º {x.f.numero} · {x.o.pagador.aseguradora}</b>
                    <small>{v.marca} {v.modelo} · {verPatente(v.patente)} · siniestro {x.o.pagador.siniestro}</small>
                    <small>Emitida {fecha(x.f.emitida)} · vence {fecha(vencimiento(x.f))}{x.f.pagadaEl ? ` · pagada ${fecha(x.f.pagadaEl)}` : ''}</small>
                  </button>
                  <div className="cb-monto">
                    <b>{clp(x.f.monto)}</b>
                    <span className={`chip ${x.e.estado}`}>{nombreEstado(x.e)}</span>
                    {x.e.comision > 0 && <small>+ comisión 1 %: {clp(x.e.comision)}</small>}
                    {x.e.atrasoPagado > 0 && <small>Pagó {x.e.atrasoPagado} días tarde</small>}
                  </div>
                  {!x.f.pagadaEl && (
                    <div className="cb-acciones">
                      <Pagar x={x} />
                      <a className="btn secundario" href={correoRecordatorio(x, empresa.nombre)}><EnvelopeSimple size={20} /> Recordar</a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <aside>
          <section className="cb-bloque">
            <h2>Por compañía</h2>
            <table className="cb-tabla">
              <thead><tr><th>Compañía</th><th>Por cobrar</th><th>Paga en</th></tr></thead>
              <tbody>
                {r.companias.map(c => (
                  <tr key={c.nombre}>
                    <td>{c.nombre}{c.vencido > 0 && <small className="cb-vencido">{clp(c.vencido)} vencido</small>}</td>
                    <td>{clp(c.porCobrar)}</td>
                    <td className={c.diasPromedio !== null && c.diasPromedio > 30 ? 'cb-lento' : ''}>{c.diasPromedio === null ? '—' : `${c.diasPromedio} días`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pista">«Paga en»: días promedio entre la factura y el pago. Sobre 30, la compañía paga fuera del plazo legal, salvo un acuerdo excepcional vigente.</p>
          </section>

          {r.deducibles.length > 0 && (
            <section className="cb-bloque">
              <h2>Deducibles por cobrar</h2>
              <ul className="cb-deducibles">
                {r.deducibles.map(o => (
                  <li key={o.id}><button className="enlace" onClick={() => ir(`/admin/ot/${o.id}`)}>{o.vehiculo.marca} {o.vehiculo.modelo} · {o.cliente.nombre}</button><b>{clp(totales(o).deducible)}</b></li>
                ))}
              </ul>
            </section>
          )}

          <section className="cb-bloque cb-ley">
            <h2><Scales size={22} /> Lo que dice la ley</h2>
            <ul>
              <li>La factura se paga dentro de <b>30 días corridos</b> desde que la compañía la recibe (Ley 19.983, modificada por la Ley 21.131). Aquí se cuenta desde la emisión: si la recibió después, corre desde esa fecha.</li>
              <li>Plazos mayores solo valen en los <b>casos excepcionales</b> que permite la ley, con acuerdo escrito.</li>
              <li>Si paga tarde, el saldo devenga <b>interés por mora</b> y una <b>comisión de cobranza de 1 %</b>.</li>
            </ul>
            <p className="pista">Información general, no es asesoría legal. Revisa el correo antes de enviarlo.</p>
          </section>
        </aside>
      </div>
    </Pantalla>
  );
}
