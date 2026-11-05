import { useState } from 'react';
import { Check, Plus, Trash, X } from '@phosphor-icons/react';
import { nombrePieza, PIEZAS, TRABAJOS, tituloItem } from '../lib/piezas';
import { sugerir } from '../lib/precios';
import { uid } from '../lib/store';
import type { Item, PiezaId, Severidad, Trabajo, Vehiculo } from '../lib/types';
import { Auto3D, Leyenda } from './ui';
import { estadosPiezas } from '../lib/piezas';

const SEVERIDADES: { id: Severidad; nombre: string; ayuda: string }[] = [
  { id: 'leve', nombre: 'Leve', ayuda: 'Daño chico' },
  { id: 'medio', nombre: 'Medio', ayuda: 'Daño normal' },
  { id: 'fuerte', nombre: 'Fuerte', ayuda: 'Daño grande' },
];

/** El maestro toca la pieza en el 3D, o la elige de la lista, y marca qué trabajo necesita. */
export default function PiezaPicker({ vehiculo, items, onChange }: { vehiculo: Vehiculo; items: Item[]; onChange: (i: Item[]) => void }) {
  const [pieza, setPieza] = useState<PiezaId | null>(null);
  const [elegidos, setElegidos] = useState<Trabajo[]>([]);
  const [sev, setSev] = useState<Severidad>('medio');
  const trabajos = items.filter(i => i.trabajo !== 'general');

  const abrir = (id: PiezaId) => { setPieza(id); setElegidos([]); setSev('medio'); };
  const yaTiene = (t: Trabajo) => items.some(i => i.pieza === pieza && i.trabajo === t);
  const agregar = () => {
    if (!pieza) return;
    const nuevos: Item[] = elegidos.filter(t => !yaTiene(t)).map(t => ({
      id: uid(), trabajo: t, pieza, severidad: sev, estado: 'pendiente', monto: null, sugerido: sugerir(t, pieza, sev, vehiculo),
    }));
    const generales = items.filter(i => i.trabajo === 'general');
    onChange([...generales.slice(0, 1), ...trabajos, ...nuevos, ...generales.slice(1)]);
    setPieza(null);
  };

  return (
    <div className="picker">
      <div className="picker-3d">
        <div className="escena alto">
          <Auto3D carroceria={vehiculo.carroceria} color={vehiculo.colorHex} estados={estadosPiezas(items)} seleccion={pieza} onPick={abrir} etiqueta={`Modelo 3D de ${vehiculo.marca} ${vehiculo.modelo}. Toca una pieza para agregar trabajo.`} />
        </div>
        <p className="ayuda-3d">Toca la pieza dañada. Arrastra con el dedo para girar el vehículo.</p>
        <Leyenda />
        <label className="campo">
          <span>O elige la pieza de la lista</span>
          <select value="" onChange={e => e.target.value && abrir(e.target.value as PiezaId)}>
            <option value="">Seleccionar pieza</option>
            {PIEZAS.map(p => <option key={p.id} value={p.id}>{nombrePieza(p.id, vehiculo.carroceria)}</option>)}
          </select>
        </label>
      </div>

      <div className="picker-lista">
        <h2>Trabajos agregados <span className="contador">{trabajos.length}</span></h2>
        {trabajos.length === 0 && <p className="vacio">Todavía no hay trabajos. Toca una pieza del vehículo para empezar.</p>}
        <ul className="lista-simple">
          {trabajos.map(i => (
            <li key={i.id}>
              <span>{tituloItem(i, vehiculo.carroceria)}</span>
              {i.estado === 'pendiente' && (
                <button className="icono" aria-label={`Quitar ${tituloItem(i, vehiculo.carroceria)}`} onClick={() => onChange(items.filter(x => x.id !== i.id))}><Trash size={24} /></button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {pieza && (
        <div className="hoja-fondo" onClick={() => setPieza(null)}>
          <section className="hoja" role="dialog" aria-modal="true" aria-label={nombrePieza(pieza, vehiculo.carroceria)} onClick={e => e.stopPropagation()}>
            <div className="hoja-tit">
              <h2>{nombrePieza(pieza, vehiculo.carroceria)}</h2>
              <button className="icono" aria-label="Cerrar" onClick={() => setPieza(null)}><X size={28} /></button>
            </div>
            <p className="sub">¿Qué trabajo necesita esta pieza? Puedes marcar varios.</p>
            <div className="opciones">
              {TRABAJOS.map(t => {
                const ya = yaTiene(t.id), on = elegidos.includes(t.id);
                return (
                  <button key={t.id} disabled={ya} aria-pressed={on} className={`opcion ${on ? 'on' : ''}`} onClick={() => setElegidos(on ? elegidos.filter(x => x !== t.id) : [...elegidos, t.id])}>
                    <span><b>{t.nombre}</b><small>{ya ? 'Ya está agregado' : t.ayuda}</small></span>
                    {(on || ya) && <Check size={28} weight="bold" />}
                  </button>
                );
              })}
            </div>
            <p className="etiqueta">Tamaño del daño</p>
            <div className="segmentos">
              {SEVERIDADES.map(s => (
                <button key={s.id} aria-pressed={sev === s.id} className={sev === s.id ? 'on' : ''} onClick={() => setSev(s.id)}><b>{s.nombre}</b><small>{s.ayuda}</small></button>
              ))}
            </div>
            <button className="btn primario grande" disabled={!elegidos.length} onClick={agregar}><Plus size={26} weight="bold" /> Agregar al vehículo</button>
          </section>
        </div>
      )}
    </div>
  );
}
