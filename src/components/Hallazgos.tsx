import { useEffect, useRef, useState } from 'react';
import { borrarFotos, guardarFoto } from '../lib/fotos';
import { CATEGORIAS, MAX_DETALLE, MAX_FOTOS, MAX_HALLAZGOS, nuevoHallazgo, resumenHallazgo, UBICACIONES } from '../lib/hallazgos';
import { reducirImagen } from '../lib/padron';
import { uid } from '../lib/store';
import type { Hallazgo, TipoHallazgo } from '../lib/types';
import { Camera, CheckCircle, Package, Plus, ShieldCheck, Warning, X } from './iconos';
import { FotoGuardada } from './ui';

/*
 * Acta de recepción (plano docs/specs/2026-11-19-acta-recepcion-hallazgos.md).
 * Un hallazgo guardado es evidencia: no se borra; solo el administrador lo anula con un motivo.
 */

const TIPOS: { id: TipoHallazgo; nombre: string }[] = [
  { id: 'dano', nombre: 'Daño preexistente' },
  { id: 'objeto', nombre: 'Objeto de valor' },
];

const cuando = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Las fechas de la demo vienen como AAAA-MM-DD (sin hora): solo se muestra el día.
  const soloDia = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const f = soloDia ? new Date(`${iso}T12:00:00`) : d;
  return f.toLocaleString('es-CL', soloDia ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Formulario en línea para un hallazgo nuevo. Sus fotos se borran si se cancela o se sale sin guardar. */
export function HallazgoForm({ autor, onGuardar, onCancelar }: { autor: string; onGuardar: (h: Hallazgo) => void; onCancelar: () => void }) {
  const [tipo, setTipo] = useState<TipoHallazgo>('dano');
  const [categoria, setCategoria] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [detalle, setDetalle] = useState('');
  const [noRepara, setNoRepara] = useState(true);
  const [resguardo, setResguardo] = useState<'vehiculo' | 'taller'>('taller');
  const [fotos, setFotos] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const camara = useRef<HTMLInputElement>(null), galeria = useRef<HTMLInputElement>(null);
  // Fotos que siguen «sueltas» (no guardadas en ningún hallazgo): se borran al desmontar.
  const sueltas = useRef<string[]>([]);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; void borrarFotos(sueltas.current).catch(() => {}); }, []);

  const cambiarTipo = (t: TipoHallazgo) => { setTipo(t); setCategoria(''); setUbicacion(''); };
  const agregarFoto = async (f: File | undefined) => {
    if (!f || fotos.length >= MAX_FOTOS) return;
    setSubiendo(true); setError('');
    try {
      const id = uid();
      await guardarFoto(id, await reducirImagen(f, 1100));
      // Si el formulario se cerró mientras se guardaba, la foto ya no tiene dueño.
      if (!montado.current) { void borrarFotos([id]).catch(() => {}); return; }
      sueltas.current = [...sueltas.current, id];
      setFotos(x => [...x, id]);
    } catch {
      setError('No se pudo guardar la foto. Puede que el equipo no tenga espacio.');
    } finally {
      if (montado.current) setSubiendo(false);
    }
  };
  const quitarFoto = (id: string) => {
    setFotos(x => x.filter(y => y !== id));
    sueltas.current = sueltas.current.filter(y => y !== id);
    void borrarFotos([id]).catch(() => {});
  };
  const guardar = () => {
    if (!categoria || !ubicacion) { setError('Elige qué es y dónde está.'); return; }
    const h = nuevoHallazgo({
      tipo, categoria, ubicacion, detalle, fotos, autor,
      ...(tipo === 'dano' ? { noRepara } : { resguardo, devueltoEl: null }),
    }, uid());
    sueltas.current = [];
    onGuardar(h);
  };
  const cancelar = () => {
    void borrarFotos(sueltas.current).catch(() => {});
    sueltas.current = [];
    onCancelar();
  };
  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; void agregarFoto(f); };

  return (
    <div className="hallazgo-form" role="group" aria-label="Nuevo hallazgo">
      <div className="segmentos" role="group" aria-label="Tipo de hallazgo">
        {TIPOS.map(t => <button key={t.id} type="button" aria-pressed={tipo === t.id} className={tipo === t.id ? 'on' : ''} onClick={() => cambiarTipo(t.id)}>{t.nombre}</button>)}
      </div>
      <p className="etiqueta">{tipo === 'dano' ? '¿Qué daño es?' : '¿Qué objeto es?'}</p>
      <div className="hallazgo-chips" role="group" aria-label="Categoría">
        {CATEGORIAS[tipo].map(c => <button key={c} type="button" aria-pressed={categoria === c} className={categoria === c ? 'on' : ''} onClick={() => setCategoria(c)}>{c}</button>)}
      </div>
      <label className="campo"><span>{tipo === 'dano' ? '¿Dónde está?' : '¿Dónde se encontró?'}</span>
        <select value={ubicacion} onChange={e => setUbicacion(e.target.value)}>
          <option value="">Elige un lugar</option>
          {UBICACIONES[tipo].map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>
      <label className="campo"><span>Detalle</span>
        <textarea rows={2} maxLength={MAX_DETALLE} value={detalle} onChange={e => setDetalle(e.target.value)} placeholder={tipo === 'dano' ? 'Ej.: rayón de 10 cm cerca del foco derecho' : 'Ej.: cartera negra bajo el asiento del copiloto'} />
      </label>
      {tipo === 'dano' ? (
        <label className="hallazgo-check"><input type="checkbox" checked={noRepara} onChange={e => setNoRepara(e.target.checked)} /> El cliente no lo quiere reparar</label>
      ) : (
        <div className="segmentos" role="group" aria-label="Dónde quedó el objeto">
          <button type="button" aria-pressed={resguardo === 'taller'} className={resguardo === 'taller' ? 'on' : ''} onClick={() => setResguardo('taller')}>Guardado en el taller</button>
          <button type="button" aria-pressed={resguardo === 'vehiculo'} className={resguardo === 'vehiculo' ? 'on' : ''} onClick={() => setResguardo('vehiculo')}>Quedó en el vehículo</button>
        </div>
      )}
      <p className="aviso-privacidad"><ShieldCheck size={20} aria-hidden="true" /> Fotografía solo lo necesario. No abras bolsos ni fotografíes documentos, tarjetas, dinero, medicamentos ni personas. No escribas nombres, RUT, tarjetas, claves ni datos de salud.</p>
      <div className="hallazgo-fotos">
        {fotos.map((id, i) => (
          <figure key={id}>
            <FotoGuardada id={id} alt={`Foto ${i + 1} del hallazgo`} />
            <button type="button" className="enlace" onClick={() => quitarFoto(id)}><X size={16} /> Quitar</button>
          </figure>
        ))}
        {fotos.length < MAX_FOTOS && (
          <>
            <button type="button" className="foto-mas" disabled={subiendo} onClick={() => camara.current?.click()}><Camera size={30} weight="light" /> Sacar foto</button>
            <button type="button" className="foto-mas" disabled={subiendo} onClick={() => galeria.current?.click()}><Plus size={30} weight="light" /> Subir imagen</button>
          </>
        )}
      </div>
      <input ref={camara} type="file" accept="image/*" capture="environment" hidden aria-label="Sacar foto del hallazgo" onChange={elegir} />
      <input ref={galeria} type="file" accept="image/*" hidden aria-label="Subir imagen del hallazgo" onChange={elegir} />
      {subiendo && <p className="pista" role="status">Guardando la foto…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="hallazgo-acciones">
        <button type="button" className="btn secundario grande" onClick={cancelar}>Cancelar</button>
        <button type="button" className="btn primario grande" disabled={subiendo} onClick={guardar}><CheckCircle size={22} /> Guardar hallazgo</button>
      </div>
    </div>
  );
}

function Anular({ onAnular }: { onAnular: (motivo: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  if (!abierto) return <button type="button" className="enlace" onClick={() => setAbierto(true)}>Anular</button>;
  return (
    <form className="hallazgo-anular" onSubmit={e => { e.preventDefault(); if (motivo.trim()) { onAnular(motivo); setAbierto(false); } }}>
      <label className="campo"><span>Motivo de la anulación</span><input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={MAX_DETALLE} autoFocus required /></label>
      <div className="hallazgo-acciones">
        <button type="button" className="btn secundario" onClick={() => setAbierto(false)}>Volver</button>
        <button className="btn secundario" disabled={!motivo.trim()}>Anular hallazgo</button>
      </div>
    </form>
  );
}

/**
 * Lista del acta. Modo 'taller': todo (autor, detalle, anulados). Modo 'cliente': sin autor ni anulados,
 * y de los objetos solo que existen y si se devolvieron.
 */
export function ListaHallazgos({ hallazgos, modo, quitar, devolver, anular }: {
  hallazgos: Hallazgo[]; modo: 'taller' | 'cliente';
  quitar?: (id: string) => void; devolver?: (id: string) => void; anular?: (id: string, motivo: string) => void;
}) {
  const lista = modo === 'cliente' ? hallazgos.filter(h => !h.anulado) : hallazgos;
  if (!lista.length) return null;
  return (
    <ul className="acta">
      {lista.map(h => {
        const objetoCliente = modo === 'cliente' && h.tipo === 'objeto';
        const titulo = objetoCliente ? 'Objeto de valor registrado' : resumenHallazgo(h);
        const fotosTaller = h.fotosEnTaller ?? 0;
        return (
          <li key={h.id} className={`hallazgo ${h.tipo}${h.anulado ? ' anulado' : ''}`}>
            <p className="hallazgo-tit">
              {h.tipo === 'dano' ? <Warning size={22} aria-hidden="true" /> : <Package size={22} aria-hidden="true" />}
              <b>{titulo}</b>
              {h.tipo === 'dano' && h.noRepara && <span className="sello">No se repara</span>}
              {h.tipo === 'objeto' && (h.devueltoEl ? <span className="sello ok">Devuelto</span> : <span className="sello">{objetoCliente || !h.resguardo ? 'Resguardado' : h.resguardo === 'taller' ? 'Guardado en el taller' : 'Quedó en el vehículo'}</span>)}
            </p>
            <small className="hallazgo-meta">
              {h.tipo === 'dano' ? 'Daño preexistente' : 'Objeto de valor'} · {cuando(h.creado)}{modo === 'taller' && h.autor ? ` · ${h.autor}` : ''}
              {h.devueltoEl ? ` · devuelto el ${cuando(h.devueltoEl)}` : ''}
            </small>
            {!objetoCliente && h.detalle && <p className="hallazgo-detalle">«{h.detalle}»</p>}
            {h.anulado && <p className="hallazgo-anulado">Anulado por {h.anulado.por} el {cuando(h.anulado.el)}: {h.anulado.motivo}</p>}
            {!objetoCliente && (h.fotos.length > 0 || fotosTaller > 0) && (
              <div className="hallazgo-fotos">
                {h.fotos.map((id, i) => <FotoGuardada key={id} id={id} alt={`Foto ${i + 1}: ${titulo}`} />)}
                {Array.from({ length: fotosTaller }, (_, i) => <div key={`t${i}`} className="foto-taller" role="img" aria-label={`Foto ${i + 1} en el sistema del taller`}><Camera size={26} weight="light" /><span>Foto en el sistema del taller</span></div>)}
              </div>
            )}
            {(quitar || (devolver && h.tipo === 'objeto' && !h.devueltoEl && !h.anulado) || (anular && !h.anulado)) && (
              <div className="hallazgo-acciones">
                {quitar && <button type="button" className="enlace" onClick={() => quitar(h.id)}><X size={16} /> Quitar</button>}
                {devolver && h.tipo === 'objeto' && !h.devueltoEl && !h.anulado && <button type="button" className="btn secundario" onClick={() => devolver(h.id)}><CheckCircle size={20} /> Marcar devuelto</button>}
                {anular && !h.anulado && <Anular onAnular={m => anular(h.id, m)} />}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Botón «Agregar hallazgo» + formulario. Lo usan el ingreso y la ficha del trabajador. */
export function AgregarHallazgo({ autor, onGuardar, cantidad }: { autor: string; onGuardar: (h: Hallazgo) => void; cantidad: number }) {
  const [abierto, setAbierto] = useState(false);
  // Tope por orden: más allá, las fotos quedarían guardadas sin hallazgo.
  if (cantidad >= MAX_HALLAZGOS) return <p className="pista">Se alcanzó el máximo de {MAX_HALLAZGOS} hallazgos para esta orden.</p>;
  if (!abierto) return <button type="button" className="btn secundario" onClick={() => setAbierto(true)}><Plus size={22} /> Agregar hallazgo</button>;
  return <HallazgoForm autor={autor} onCancelar={() => setAbierto(false)} onGuardar={h => { setAbierto(false); onGuardar(h); }} />;
}
