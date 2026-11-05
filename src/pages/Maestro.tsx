import { useState } from 'react';
import { CheckCircle, Plus, Wrench } from '@phosphor-icons/react';
import PiezaPicker from '../components/PiezaPicker';
import { Auto3D, Barra, Galeria, ir, Leyenda, Pantalla, TarjetaOrden } from '../components/ui';
import { conEvento, etapaDe, nombreEtapa, sincronizar } from '../lib/automatizacion';
import { estadosPiezas, fecha, progreso, tituloItem } from '../lib/piezas';
import { actualizar, sesion, useOrden, useOrdenes } from '../lib/store';
import type { EstadoItem, Item } from '../lib/types';
import { verPatente } from '../lib/vehiculos';

export function MaestroInicio() {
  const u = sesion()!;
  const ordenes = useOrdenes().filter(o => o.maestroId === u.id && !o.entregadaEl);
  const activas = ordenes.filter(o => progreso(o.items) < 100), listas = ordenes.filter(o => progreso(o.items) === 100);
  return (
    <Pantalla titulo="Mis vehículos" sub="Ingresa un vehículo o marca el avance de tus trabajos.">
      <button className="btn primario enorme" onClick={() => ir('/maestro/nuevo')}><Plus size={32} weight="bold" /> Ingresar vehículo</button>
      {activas.length === 0 && <p className="vacio">No tienes vehículos en trabajo. Ingresa el primero con el botón de arriba.</p>}
      <div className="grilla-ordenes">
        {activas.map(o => <TarjetaOrden key={o.id} o={o} destino={`/maestro/ot/${o.id}`} />)}
      </div>
      {listas.length > 0 && (
        <>
          <h2 className="seccion">Terminados</h2>
          <div className="grilla-ordenes">{listas.map(o => <TarjetaOrden key={o.id} o={o} destino={`/maestro/ot/${o.id}`} />)}</div>
        </>
      )}
    </Pantalla>
  );
}

const ESTADOS: { id: EstadoItem; nombre: string; verbo: string }[] = [
  { id: 'pendiente', nombre: 'Por hacer', verbo: 'Volvió a por hacer' },
  { id: 'proceso', nombre: 'Haciendo', verbo: 'Comenzó' },
  { id: 'listo', nombre: 'Listo', verbo: 'Terminó' },
];

export function MaestroOrden({ id }: { id: string }) {
  const o = useOrden(id);
  const [agregando, setAgregando] = useState(false);
  if (!o) return <Pantalla volver="/maestro" titulo="Orden no encontrada" />;
  const v = o.vehiculo, pct = progreso(o.items);

  const cambiar = (it: Item, estado: EstadoItem) => actualizar(id, x => conEvento(
    { ...x, items: x.items.map(i => (i.id === it.id ? { ...i, estado } : i)) },
    `${ESTADOS.find(e => e.id === estado)!.verbo}: ${tituloItem(it, v.carroceria).toLowerCase()}`,
  ));

  // Un trabajo descubierto después de aprobar vuelve a pedir autorización.
  const cambiarItems = (items: Item[]) => actualizar(id, x => {
    const antes = new Set(x.items.map(i => i.id));
    const nuevos = items.filter(i => !antes.has(i.id));
    if (!nuevos.length) return sincronizar({ ...x, items });
    const aprobada = x.aprobacion === 'aprobada';
    const marcados = items.map(i => (aprobada && !antes.has(i.id) ? { ...i, adicional: true } : i));
    const texto = aprobada ? 'Trabajo adicional agregado: requiere aprobación' : 'Trabajo agregado';
    return conEvento(sincronizar({ ...x, items: marcados, aprobacion: aprobada ? 'pendiente' : x.aprobacion }), texto);
  });

  if (agregando) {
    return (
      <Pantalla titulo="Agregar trabajos" sub={`${v.marca} ${v.modelo} ${v.anio}`}>
        <PiezaPicker vehiculo={v} items={o.items} onChange={cambiarItems} />
        <div className="acciones-fin"><button className="btn primario grande" onClick={() => setAgregando(false)}><CheckCircle size={26} /> Listo</button></div>
      </Pantalla>
    );
  }

  return (
    <Pantalla volver="/maestro" titulo={`${v.marca} ${v.modelo}`} sub={`${v.anio} · ${verPatente(v.patente)} · Orden ${o.numero}`}>
      <div className="dos-col">
        <div>
          <div className="escena"><Auto3D carroceria={v.carroceria} color={v.colorHex} estados={estadosPiezas(o.items)} etiqueta={`Modelo 3D de ${v.marca} ${v.modelo}`} /></div>
          <Leyenda />
          <div className="avance-caja"><b className="pct">{pct}%</b><div><Barra valor={pct} /><p>{nombreEtapa(etapaDe(o))}. Entrega: {fecha(o.entrega)}</p></div></div>
          {o.notas && <p className="nota">{o.notas}</p>}
          <Galeria fotos={o.fotos} onAgregar={f => actualizar(id, x => conEvento({ ...x, fotos: [...x.fotos, f] }, `Foto agregada (${f.momento === 'antes' ? 'antes' : 'después'})`))} />
        </div>
        <div>
          <div className="titulo-fila chico"><h2>Tareas</h2><button className="btn secundario" onClick={() => setAgregando(true)}><Wrench size={22} /> Agregar trabajo</button></div>
          <ul className="tareas">
            {o.items.map(i => (
              <li key={i.id} className={i.estado}>
                <p>{tituloItem(i, v.carroceria)}{i.adicional && <span className="sello">Adicional</span>}</p>
                <div className="segmentos tres" role="group" aria-label={`Estado de ${tituloItem(i, v.carroceria)}`}>
                  {ESTADOS.map(e => <button key={e.id} aria-pressed={i.estado === e.id} className={i.estado === e.id ? `on ${e.id}` : ''} onClick={() => cambiar(i, e.id)}>{e.nombre}</button>)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Pantalla>
  );
}
