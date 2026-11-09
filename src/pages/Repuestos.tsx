import { useState } from 'react';
import { Warning } from '@phosphor-icons/react';
import FilaRepuesto from '../components/FilaRepuesto';
import { FotoOrden, ir, Pantalla } from '../components/ui';
import { fecha } from '../lib/piezas';
import { resumenRepuestos } from '../lib/repuestos';
import { useOrdenes } from '../lib/store';
import { verPatente } from '../lib/vehiculos';

type Filtro = 'pendientes' | 'recibidos';

/**
 * Repuestos: qué pedir, qué viene, qué se atrasó, qué autos están parados por eso
 * y cómo cumple cada proveedor.
 */
export function Repuestos() {
  const r = resumenRepuestos(useOrdenes());
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const lista = r.filas.filter(x => (filtro === 'pendientes' ? x.r.estado !== 'recibido' : x.r.estado === 'recibido'));

  return (
    <Pantalla titulo="Repuestos" sub="Cada cambio de pieza aparece aquí solo. Pide con fecha comprometida y la app vigila los atrasos.">
      <dl className="kpis">
        <div className={r.porPedir ? 'alerta' : ''}><dt>Por pedir</dt><dd>{r.porPedir}</dd></div>
        <div><dt>En camino{r.llegaHoy ? ` (${r.llegaHoy} hoy)` : ''}</dt><dd>{r.enCamino}</dd></div>
        <div className={r.atrasados ? 'alerta' : ''}><dt>Atrasados</dt><dd>{r.atrasados}</dd></div>
        <div><dt>Autos detenidos</dt><dd>{r.detenidos.length}</dd></div>
      </dl>

      {r.detenidos.length > 0 && (
        <section className="rp-detenidos">
          <h2>Autos esperando repuestos</h2>
          <ul>
            {r.detenidos.map(d => (
              <li key={d.o.id}>
                <button onClick={() => ir(`/admin/ot/${d.o.id}`)}>
                  <FotoOrden o={d.o} ancho={320} alto={180} />
                  <span>
                    <b>{d.o.vehiculo.marca} {d.o.vehiculo.modelo}</b>
                    <small>{verPatente(d.o.vehiculo.patente)} · espera {d.pendientes.map(p => p.nombre.toLowerCase()).join(', ')}</small>
                    <small>Entrega estimada: {fecha(d.o.entrega)}</small>
                  </span>
                  <span className={`chip ${d.atraso ? 'rp-atrasado' : ''}`}>{d.atraso ? <><Warning size={16} weight="fill" /> {d.atraso} días de atraso</> : `${d.dias} días esperando`}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="cb-grid">
        <section>
          <div className="titulo-fila chico">
            <h2>Repuestos</h2>
            <div className="segmentos dos" role="group" aria-label="Filtrar repuestos">
              <button aria-pressed={filtro === 'pendientes'} className={filtro === 'pendientes' ? 'on' : ''} onClick={() => setFiltro('pendientes')}>Pendientes</button>
              <button aria-pressed={filtro === 'recibidos'} className={filtro === 'recibidos' ? 'on' : ''} onClick={() => setFiltro('recibidos')}>Recibidos</button>
            </div>
          </div>
          {lista.length === 0 && <p className="vacio">{filtro === 'pendientes' ? 'No hay repuestos pendientes.' : 'Aún no hay repuestos recibidos en autos en el taller.'}</p>}
          <ul className="repuestos">{lista.map(({ o, r: rep }) => <FilaRepuesto key={rep.id} o={o} r={rep} conVehiculo />)}</ul>
        </section>

        <aside>
          <section className="cb-bloque">
            <h2>Proveedores</h2>
            {r.proveedores.length === 0 ? <p className="pista">Al pedir un repuesto con proveedor, aquí verás cuánto cumple cada uno.</p> : (
              <table className="cb-tabla">
                <thead><tr><th>Proveedor</th><th>Pedidos</th><th>A tiempo</th></tr></thead>
                <tbody>
                  {r.proveedores.map(p => (
                    <tr key={p.nombre}>
                      <td>{p.nombre}{p.atrasados > 0 && <small className="cb-vencido">{p.atrasados} atrasado{p.atrasados > 1 ? 's' : ''} ahora</small>}</td>
                      <td>{p.pedidos}</td>
                      <td className={p.cumplimiento !== null && p.cumplimiento < 70 ? 'cb-lento' : ''}>{p.cumplimiento === null ? '—' : `${p.cumplimiento} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="pista">«A tiempo»: repuestos que llegaron el día prometido o antes. Bajo 70 %, conviene buscar otro proveedor o pedir con más holgura.</p>
          </section>
        </aside>
      </div>
    </Pantalla>
  );
}
