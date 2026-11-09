import { useRef, useState } from 'react';
import { Camera, CheckCircle, WhatsappLogo, X } from '@phosphor-icons/react';
import { enlaceWhatsApp } from '../lib/automatizacion';
import { guardarFoto } from '../lib/fotos';
import { reducirImagen } from '../lib/padron';
import { progreso, tituloItem } from '../lib/piezas';
import { horasEstimadas } from '../lib/rentabilidad';
import { mensajeAvance } from '../lib/seguimiento';
import { uid, useEmpresa } from '../lib/store';
import type { Item, Orden } from '../lib/types';
import { FotoGuardada } from './ui';

/** Notas rápidas: el maestro toca una en vez de escribir con las manos sucias. */
const NOTAS: Record<string, string[]> = {
  desabolladura: ['Abolladura reparada, lata pareja', 'Pieza alineada y lista para pintura'],
  pintura: ['Pintura igualada al color original', 'Barniz aplicado y pulido'],
  cambio: ['Pieza nueva instalada y probada', 'Pieza original del fabricante'],
  plastico: ['Plástico soldado y reforzado', 'Pieza reparada, sin cambio'],
  pulido: ['Rayas eliminadas, brillo recuperado'],
  general: ['Trabajo terminado y revisado'],
};

interface Props { o: Orden; item: Item; onGuardar: (cambio: Partial<Item>) => Orden; onCerrar: () => void }

/**
 * Hoja que se abre al marcar un trabajo como listo: nota, foto antes/después y aviso al cliente.
 * En la demo, el aviso abre WhatsApp con el mensaje escrito (se toca «Enviar»); con la API oficial
 * de WhatsApp el mismo mensaje sale solo.
 */
export default function TerminarTrabajo({ o, item, onGuardar, onCerrar }: Props) {
  const empresa = useEmpresa();
  const [nota, setNota] = useState(item.nota ?? '');
  // Horas reales: parten en lo típico para este trabajo; el maestro corrige con un toque.
  const [horas, setHoras] = useState(item.horas ?? horasEstimadas(item));
  const [fotos, setFotos] = useState({ antes: item.fotoAntes, despues: item.fotoDespues });
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const momento = useRef<'antes' | 'despues'>('despues');
  const titulo = tituloItem(item, o.vehiculo.carroceria);
  const antes = progreso(o.items);
  const tel = o.cliente.telefono;

  // Vista previa del mensaje con la tarea ya terminada.
  const terminada: Item = { ...item, estado: 'listo', nota: nota.trim() || undefined };
  const simulada = { ...o, items: o.items.map(i => (i.id === item.id ? terminada : i)) };
  const mensaje = mensajeAvance(simulada, terminada, antes, empresa);

  const guardar = (avisar: boolean) => {
    const orden = onGuardar({ estado: 'listo', horas, nota: nota.trim() || undefined, fotoAntes: fotos.antes, fotoDespues: fotos.despues, terminadoEl: new Date().toISOString() });
    if (avisar && tel) window.open(enlaceWhatsApp(tel, mensajeAvance(orden, { ...terminada, terminadoEl: new Date().toISOString() }, antes, empresa)), '_blank', 'noopener');
    onCerrar();
  };

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <section className="hoja terminar" role="dialog" aria-modal="true" aria-label={`Terminar ${titulo}`} onClick={e => e.stopPropagation()}>
        <div className="hoja-tit">
          <h2>Terminar trabajo</h2>
          <button className="icono" aria-label="Cerrar" onClick={onCerrar}><X size={28} /></button>
        </div>
        <p className="sub">{titulo}</p>

        <p className="etiqueta">Nota para el cliente</p>
        <div className="chips">
          {(NOTAS[item.trabajo] ?? NOTAS.general).map(n => (
            <button key={n} aria-pressed={nota === n} className={nota === n ? 'on' : ''} onClick={() => setNota(n)}>{n}</button>
          ))}
        </div>
        <label className="campo"><span className="oculto">Nota</span>
          <textarea rows={2} value={nota} maxLength={160} placeholder="O escribe una nota corta…" onChange={e => setNota(e.target.value)} />
        </label>

        <p className="etiqueta">¿Cuántas horas te tomó?</p>
        <div className="chips" role="group" aria-label="Horas de trabajo">
          {[.5, 1, 2, 3, 4, 6, 8].map(h => (
            <button key={h} aria-pressed={horas === h} className={horas === h ? 'on' : ''} onClick={() => setHoras(h)}>{h === .5 ? '½ h' : `${h} h`}</button>
          ))}
          {![.5, 1, 2, 3, 4, 6, 8].includes(horas) && <button aria-pressed className="on">{horas} h</button>}
        </div>

        <p className="etiqueta">Fotos de este trabajo</p>
        <div className="fotos-trabajo">
          {(['antes', 'despues'] as const).map(m => (
            <button key={m} className="foto-trabajo" onClick={() => { momento.current = m; input.current?.click(); }} aria-label={`Sacar foto ${m === 'antes' ? 'de antes' : 'de después'}`}>
              {fotos[m] ? <FotoGuardada id={fotos[m]!} alt="" /> : <span><Camera size={30} weight="light" />Sacar foto</span>}
              <b>{m === 'antes' ? 'Antes' : 'Después'}</b>
            </button>
          ))}
        </div>
        <input ref={input} type="file" accept="image/*" capture="environment" hidden aria-label="Foto del trabajo" onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const id = uid();
            await guardarFoto(id, await reducirImagen(f, 1100));
            setFotos(x => ({ ...x, [momento.current]: id }));
            setError('');
          } catch { setError('No se pudo guardar la foto. Intenta otra vez.'); }
        }} />
        {error && <p className="error" role="alert">{error}</p>}

        {tel ? (
          <>
            <p className="etiqueta">Mensaje que recibe el cliente</p>
            {/* WhatsApp muestra en negrita lo que va entre asteriscos: la vista previa también. */}
            <p className="burbuja-wsp">{mensaje.split(/\*(.+?)\*/).map((t, k) => (k % 2 ? <b key={k}>{t}</b> : t))}</p>
            <button className="btn primario grande" onClick={() => guardar(true)}><WhatsappLogo size={26} /> Terminar y avisar al cliente</button>
            <button className="btn secundario grande" onClick={() => guardar(false)}><CheckCircle size={24} /> Terminar sin avisar</button>
          </>
        ) : (
          <button className="btn primario grande" onClick={() => guardar(false)}><CheckCircle size={24} /> Terminar trabajo</button>
        )}
      </section>
    </div>
  );
}
