import { useState } from 'react';
import { CalendarBlank, Check, Package, Truck, WhatsappLogo } from './iconos';
import { conEvento, enlaceWhatsApp, sincronizar, sumarHabiles } from '../lib/automatizacion';
import { fecha, fechaLocal } from '../lib/piezas';
import { estadoRepuesto, PROVEEDORES_SUGERIDOS, textoEstado } from '../lib/repuestos';
import { mensajeRepuesto } from '../lib/seguimiento';
import { actualizar, useEmpresa, useOrdenes } from '../lib/store';
import type { Orden, Repuesto } from '../lib/types';
import { verPatente } from '../lib/vehiculos';

/** Cambia un repuesto, recalcula la entrega (un atraso la corre) y lo deja en el historial. */
function cambiar(ordenId: string, r: Repuesto, cambio: Partial<Repuesto>, texto: string) {
  actualizar(ordenId, x => conEvento(sincronizar({ ...x, repuestos: x.repuestos.map(y => (y.id === r.id ? { ...y, ...cambio } : y)) }), texto));
}

/**
 * Un repuesto: se pide con proveedor y fecha comprometida, se recibe con un toque y, si se atrasa,
 * se avisa al cliente con la nueva fecha de entrega.
 */
export default function FilaRepuesto({ o, r, conVehiculo }: { o: Orden; r: Repuesto; conVehiculo?: boolean }) {
  const empresa = useEmpresa();
  const ordenes = useOrdenes();
  const [editando, setEditando] = useState(false);
  const [proveedor, setProveedor] = useState(r.proveedor ?? '');
  const [prometido, setPrometido] = useState(r.prometido ?? sumarHabiles(fechaLocal(), 3));
  const e = estadoRepuesto(r);
  const nombre = r.nombre.toLowerCase();
  // Proveedores ya usados por el taller primero, luego los sugeridos.
  const usados = [...new Set(ordenes.flatMap(x => x.repuestos.map(y => y.proveedor).filter(Boolean) as string[]))];
  const opciones = [...new Set([...usados, ...PROVEEDORES_SUGERIDOS])];

  const guardarPedido = () => {
    const prov = proveedor.trim() || 'Sin proveedor';
    if (r.estado === 'por_pedir') cambiar(o.id, r, { estado: 'pedido', proveedor: prov, pedidoEl: fechaLocal(), prometido, prometidoInicial: prometido }, `Repuesto ${nombre} pedido a ${prov}: llega el ${fecha(prometido)}`);
    else cambiar(o.id, r, { proveedor: prov, prometido, reprogramado: r.reprogramado || (!!r.prometido && prometido > r.prometido), prometidoInicial: r.prometidoInicial ?? r.prometido }, `Repuesto ${nombre}: nueva fecha ${fecha(prometido)} (${prov})`);
    setEditando(false);
  };

  return (
    <li className={`repuesto ${e.estado}`}>
      <div className="rp-datos">
        <b>{r.nombre}</b>
        {conVehiculo && <small>{o.vehiculo.marca} {o.vehiculo.modelo} · {verPatente(o.vehiculo.patente)} · Orden {o.numero}</small>}
        {r.proveedor && <small>{r.proveedor}{r.pedidoEl ? ` · pedido ${fecha(r.pedidoEl)}` : ''}</small>}
      </div>
      <span className={`chip rp-${e.estado}`}>{textoEstado(r)}</span>

      {editando ? (
        <div className="rp-form" role="group" aria-label={`Pedido de ${nombre}`}>
          <label className="campo"><span>Proveedor</span>
            <input list={`prov-${r.id}`} value={proveedor} placeholder="¿Quién lo trae?" onChange={x => setProveedor(x.target.value)} />
            <datalist id={`prov-${r.id}`}>{opciones.map(p => <option key={p} value={p} />)}</datalist>
          </label>
          <label className="campo"><span>Fecha comprometida</span>
            <input type="date" value={prometido} min={fechaLocal()} onChange={x => setPrometido(x.target.value)} />
          </label>
          <div className="rp-acciones">
            <button className="btn primario" onClick={guardarPedido}><Check size={20} weight="bold" /> {r.estado === 'por_pedir' ? 'Marcar pedido' : 'Guardar fecha'}</button>
            <button className="enlace" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="rp-acciones">
          {r.estado === 'por_pedir' && <button className="btn primario" onClick={() => setEditando(true)}><Truck size={20} /> Pedir</button>}
          {r.estado === 'pedido' && <>
            <button className="btn primario" onClick={() => cambiar(o.id, r, { estado: 'recibido', recibidoEl: fechaLocal() }, `Repuesto ${nombre} recibido${e.atraso ? ` con ${e.atraso} días de atraso` : ''}`)}><Package size={20} /> Recibido</button>
            <button className="btn secundario" onClick={() => setEditando(true)}><CalendarBlank size={20} /> Cambiar fecha</button>
            {(e.estado === 'atrasado' || r.reprogramado) && o.cliente.telefono && (
              <a className="btn secundario" href={enlaceWhatsApp(o.cliente.telefono, mensajeRepuesto(o, r, empresa))} target="_blank" rel="noreferrer noopener"
                onClick={() => r.reprogramado && cambiar(o.id, r, { reprogramado: false }, `Cliente avisado: ${nombre} llega el ${fecha(r.prometido!)}`)}>
                <WhatsappLogo size={20} /> {e.estado === 'atrasado' ? 'Avisar atraso' : 'Avisar nueva fecha'}
              </a>
            )}
          </>}
          {r.estado === 'recibido' && <button className="enlace" onClick={() => cambiar(o.id, r, { estado: 'pedido', recibidoEl: undefined }, `Repuesto ${nombre}: se deshizo la recepción`)}>Deshacer</button>}
        </div>
      )}
    </li>
  );
}
