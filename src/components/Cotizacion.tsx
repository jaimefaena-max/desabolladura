import { createPortal } from 'react-dom';
import { clp, itemsPresupuesto, nombrePieza, totales, TRABAJOS } from '../lib/piezas';
import { useEmpresa } from '../lib/store';
import type { Orden } from '../lib/types';
import { verPatente } from '../lib/vehiculos';
import { useVista, vistasDe } from '../lib/vistas';

/**
 * Cotización para el cliente: un documento aparte de la pantalla del administrador.
 * Muestra solo lo que el cliente debe ver (montos finales, sin precios sugeridos ni fuentes)
 * y se imprime o guarda como PDF con el diálogo del navegador.
 */

const VALIDEZ_DIAS = 15;

const fechaLarga = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
const desdeIso = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);

/** Abre el diálogo de impresión con un nombre de archivo útil para el PDF. */
export function imprimirDocumento(nombreArchivo: string, alTerminar?: () => void) {
  const antes = document.title;
  document.title = nombreArchivo;
  const volver = () => { document.title = antes; window.removeEventListener('afterprint', volver); alTerminar?.(); };
  window.addEventListener('afterprint', volver);
  window.print();
}

export function CotizacionDoc({ o }: { o: Orden }) {
  const e = useEmpresa();
  const v = o.vehiculo, p = o.pagador, t = totales(o);
  const foto = useVista(vistasDe(o)?.frente);
  const emision = new Date();
  const vence = new Date(emision); vence.setDate(vence.getDate() + VALIDEZ_DIAS);
  const items = itemsPresupuesto(o);
  const nombreTrabajo = (id: string) => TRABAJOS.find(x => x.id === id)?.nombre ?? 'Trabajo general';

  return createPortal(
    <article className="doc-cot" aria-hidden="true">
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
          <span className="dc-etiqueta">Cotización</span>
          <b>N.º {o.numero}</b>
          <dl>
            <div><dt>Emisión</dt><dd>{fechaLarga(emision)}</dd></div>
            <div><dt>Válida hasta</dt><dd>{fechaLarga(vence)}</dd></div>
          </dl>
        </div>
      </header>

      <p className="dc-demo">Documento de demostración · sin validez comercial</p>

      <section className="dc-datos">
        <div className="dc-tarjeta">
          <h3>Cliente</h3>
          <p className="dc-fuerte">{o.cliente.nombre}</p>
          {o.cliente.rut && <p>RUT {o.cliente.rut}</p>}
          {o.cliente.telefono && <p>Tel. {o.cliente.telefono}</p>}
          {p.tipo === 'aseguradora' && <p>{p.aseguradora} · siniestro {p.siniestro}</p>}
        </div>
        <div className="dc-tarjeta dc-vehiculo">
          <div>
            <h3>Vehículo</h3>
            <p className="dc-fuerte">{v.marca} {v.modelo} {v.anio}</p>
            <p>Patente <span className="dc-patente">{verPatente(v.patente)}</span></p>
            <p>Color {v.color.toLowerCase()}{o.recepcion.km !== null ? ` · ${o.recepcion.km.toLocaleString('es-CL')} km` : ''}</p>
          </div>
          {foto && <img src={foto} alt="" />}
        </div>
      </section>

      <table className="dc-tabla">
        <thead>
          <tr><th>#</th><th>Trabajo</th><th>Pieza</th><th className="dc-num">Monto</th></tr>
        </thead>
        <tbody>
          {items.map((i, k) => (
            <tr key={i.id}>
              <td className="dc-n">{k + 1}</td>
              <td><b>{i.trabajo === 'general' ? (i.titulo ?? 'Trabajo general') : nombreTrabajo(i.trabajo)}</b>{i.severidad && <small>Daño {i.severidad}</small>}</td>
              <td>{i.pieza ? nombrePieza(i.pieza, v.carroceria) : '—'}</td>
              <td className="dc-num">{i.monto === null ? 'Por definir' : clp(i.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="dc-cierre">
        <div className="dc-condiciones">
          <h3>Condiciones</h3>
          <ul>
            <li>Entrega estimada: {fechaLarga(desdeIso(o.entrega))}, una vez aprobado el presupuesto.</li>
            <li>Valores en pesos chilenos. Validez de {VALIDEZ_DIAS} días desde la emisión.</li>
            <li>Si al desarmar aparece un daño oculto, se informa y se cotiza aparte antes de repararlo.</li>
            {p.tipo === 'aseguradora' && <li>Según la póliza, el deducible lo paga el cliente al retirar; el resto, {p.aseguradora}.</li>}
          </ul>
        </div>
        <dl className="dc-totales">
          <div><dt>Neto</dt><dd>{clp(t.neto)}</dd></div>
          <div><dt>IVA 19 %</dt><dd>{clp(t.iva)}</dd></div>
          <div className="dc-total"><dt>Total</dt><dd>{clp(t.total)}</dd></div>
          {p.tipo === 'aseguradora' && <>
            <div><dt>Paga el cliente (deducible)</dt><dd>{clp(t.deducible)}</dd></div>
            <div><dt>Paga {p.aseguradora}</dt><dd>{clp(t.aseguradora)}</dd></div>
          </>}
        </dl>
      </section>

      <section className="dc-firmas">
        <div><span />Firma y RUT del cliente<small>Acepto el presupuesto</small></div>
        <div><span />{e.nombre}<small>Responsable del taller</small></div>
      </section>

      <footer className="dc-pie">
        <span>{e.nombre} · Orden {o.numero} · Código de seguimiento {o.codigo}</span>
        <span>Desabolladura Premium</span>
      </footer>
    </article>,
    document.body,
  );
}
