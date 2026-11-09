import { createPortal } from 'react-dom';
import { CMF_REPARACION, diasEnTaller } from '../lib/automatizacion';
import { clp, itemsCobrables, nombrePieza, totales, TRABAJOS } from '../lib/piezas';
import { useEmpresa } from '../lib/store';
import type { Item, Orden } from '../lib/types';
import { verPatente } from '../lib/vehiculos';
import { useVista, vistasDe } from '../lib/vistas';
import { FotoGuardada } from './ui';

/**
 * Expediente del siniestro para la compañía y su liquidador: todo lo que necesitan para autorizar,
 * en un solo PDF (datos, daños valorizados, fotos, hitos y plazo frente al promedio de la CMF).
 * Con `soloAdicionales` es la solicitud de trabajos adicionales descubiertos al desarmar.
 */

const fechaLarga = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

interface Foto { id: string; pie: string }

export function ExpedienteDoc({ o, soloAdicionales = false }: { o: Orden; soloAdicionales?: boolean }) {
  const e = useEmpresa();
  const v = o.vehiculo, p = o.pagador, t = totales(o);
  const foto = useVista(vistasDe(o)?.frente);
  const items = itemsCobrables(o).filter(i => !soloAdicionales || i.adicional);
  const adicionales = itemsCobrables(o).filter(i => i.adicional);
  const montoAdicionales = adicionales.reduce((a, i) => a + (i.monto ?? 0), 0);
  const dias = diasEnTaller(o);
  // Si hay adicionales, lo original ya estaba autorizado: agregar un adicional reabre solo la aprobación de este.
  const autorizado = (i: Item) => !i.adicional && (o.aprobacion === 'aprobada' || adicionales.length > 0);
  const pieza = (i: Item) => (i.pieza ? nombrePieza(i.pieza, v.carroceria) : 'General');
  const trabajo = (i: Item) => TRABAJOS.find(x => x.id === i.trabajo)?.nombre ?? i.titulo ?? 'Trabajo general';

  // Registro fotográfico: ingreso del vehículo y, por pieza, el daño y la reparación.
  const fotos: Foto[] = [
    ...(soloAdicionales ? [] : o.fotos.filter(f => f.momento === 'antes').map((f, k) => ({ id: f.id, pie: `Ingreso ${k + 1}` }))),
    ...items.flatMap(i => [
      ...(i.fotoAntes ? [{ id: i.fotoAntes, pie: `${pieza(i)} · daño` }] : []),
      ...(i.fotoDespues && !soloAdicionales ? [{ id: i.fotoDespues, pie: `${pieza(i)} · reparada` }] : []),
    ]),
  ];
  const hitos = [...o.historial].reverse().slice(-14);

  return createPortal(
    <article className="doc-cot doc-exp" aria-hidden="true">
      <header className="dc-cabecera">
        <div className="dc-taller">
          {e.logo ? <img className="dc-logo" src={e.logo} alt="" /> : <div className="dc-logo dc-logo-vacio">TU LOGO<br />AQUÍ</div>}
          <div>
            <b className="dc-taller-nombre">{e.nombre}</b>
            <span>Desabolladura y pintura</span>
            {e.whatsapp && <span>WhatsApp {e.whatsapp}</span>}
          </div>
        </div>
        <div className="dc-titulo">
          <span className="dc-etiqueta">{soloAdicionales ? 'Solicitud de adicionales' : 'Expediente de siniestro'}</span>
          <b>{p.siniestro ? `N.º ${p.siniestro}` : `Orden ${o.numero}`}</b>
          <dl>
            <div><dt>Compañía</dt><dd>{p.aseguradora || '—'}</dd></div>
            <div><dt>Emisión</dt><dd>{fechaLarga(new Date())}</dd></div>
          </dl>
        </div>
      </header>

      <p className="dc-demo">Documento de demostración · sin validez comercial</p>

      <section className="dc-datos tres">
        <div className="dc-tarjeta">
          <h3>Asegurado</h3>
          <p className="dc-fuerte">{o.cliente.nombre}</p>
          {o.cliente.rut && <p>RUT {o.cliente.rut}</p>}
          {o.cliente.telefono && <p>Tel. {o.cliente.telefono}</p>}
        </div>
        <div className="dc-tarjeta">
          <h3>Vehículo</h3>
          <p className="dc-fuerte">{v.marca} {v.modelo} {v.anio}</p>
          <p>Patente <span className="dc-patente">{verPatente(v.patente)}</span></p>
          <p>Color {v.color.toLowerCase()}{o.recepcion.km !== null ? ` · ${o.recepcion.km.toLocaleString('es-CL')} km` : ''}</p>
        </div>
        <div className="dc-tarjeta">
          <h3>Plazo en taller</h3>
          <p className="dc-fuerte">Día {dias} de ≈{Math.round(CMF_REPARACION.enTaller)}</p>
          <p>Ingreso: {fechaLarga(new Date(`${o.creada}T12:00:00`))}</p>
          <p className="de-fuente">Promedio nacional en taller, CMF {CMF_REPARACION.periodo}</p>
        </div>
      </section>

      {foto && !soloAdicionales && <img className="de-modelo" src={foto} alt="" />}

      <table className="dc-tabla">
        <thead>
          <tr><th>#</th><th>Pieza</th><th>Trabajo</th><th>Estado</th><th className="dc-num">Monto neto</th></tr>
        </thead>
        <tbody>
          {items.map((i, k) => (
            <tr key={i.id}>
              <td className="dc-n">{k + 1}</td>
              <td><b>{pieza(i)}</b>{i.severidad && <small>Daño {i.severidad}</small>}</td>
              <td>{trabajo(i)}</td>
              <td><span className={`de-estado ${i.adicional ? 'adicional' : autorizado(i) ? 'autorizado' : ''}`}>{i.adicional ? 'Adicional por autorizar' : autorizado(i) ? 'Autorizado' : 'Por autorizar'}</span></td>
              <td className="dc-num">{i.monto === null ? 'Por definir' : clp(i.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="dc-cierre">
        <div className="dc-condiciones">
          <h3>{soloAdicionales ? 'Motivo' : 'Observaciones'}</h3>
          <ul>
            {soloAdicionales
              ? <li>Daños ocultos detectados al desarmar el vehículo, posteriores a la autorización inicial. Se adjunta foto de cada uno.</li>
              : <li>Valores netos por pieza; el total incluye IVA. El deducible lo paga el asegurado al retirar.</li>}
            {!soloAdicionales && adicionales.length > 0 && <li>Incluye {adicionales.length} adicional(es) por {clp(montoAdicionales)} neto, pendientes de autorización.</li>}
            <li>Fotografías tomadas en el taller con fecha y hora de registro en el sistema.</li>
          </ul>
        </div>
        <dl className="dc-totales">
          {soloAdicionales ? (
            <>
              <div><dt>Adicionales neto</dt><dd>{clp(montoAdicionales)}</dd></div>
              <div><dt>IVA 19 %</dt><dd>{clp(Math.round(montoAdicionales * .19))}</dd></div>
              <div className="dc-total"><dt>Total adicionales</dt><dd>{clp(montoAdicionales + Math.round(montoAdicionales * .19))}</dd></div>
            </>
          ) : (
            <>
              <div><dt>Neto</dt><dd>{clp(t.neto)}</dd></div>
              <div><dt>IVA 19 %</dt><dd>{clp(t.iva)}</dd></div>
              <div className="dc-total"><dt>Total</dt><dd>{clp(t.total)}</dd></div>
              <div><dt>Deducible (asegurado)</dt><dd>{clp(t.deducible)}</dd></div>
              <div><dt>Paga {p.aseguradora || 'la compañía'}</dt><dd>{clp(t.aseguradora)}</dd></div>
            </>
          )}
        </dl>
      </section>

      <section className="de-seccion">
        <h3>Registro fotográfico</h3>
        {fotos.length ? (
          <div className="de-fotos">
            {fotos.map(f => <figure key={f.id}><FotoGuardada id={f.id} alt={f.pie} /><figcaption>{f.pie}</figcaption></figure>)}
          </div>
        ) : <p className="de-vacio">Sin fotos registradas en esta orden.</p>}
      </section>

      {!soloAdicionales && hitos.length > 0 && (
        <section className="de-seccion">
          <h3>Hitos del proceso</h3>
          <ol className="de-hitos">{hitos.map((h, k) => <li key={k}><time>{fechaHora(h.fecha)}</time><span>{h.texto}</span></li>)}</ol>
        </section>
      )}

      <section className="dc-firmas">
        <div><span />{e.nombre}<small>Responsable del taller</small></div>
        <div><span />Liquidador<small>Nombre, firma y fecha de autorización</small></div>
      </section>

      <footer className="dc-pie">
        <span>{e.nombre} · Orden {o.numero} · {p.aseguradora} · Siniestro {p.siniestro}</span>
        <span>Desabolladura Premium</span>
      </footer>
    </article>,
    document.body,
  );
}
