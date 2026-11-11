import { useEffect, useState } from 'react';
import { mesesElegibles, type Periodo } from '../lib/automatizacion';
import type { Orden } from '../lib/types';

/**
 * El mismo control de fechas para las vistas con historial (Reportes y Cobranza).
 * El rango se recuerda por vista y se recorta al historial real: nunca ofrece meses vacíos.
 */
const clave = (vista: string) => `dp.periodo.${vista}`;

function leer(vista: string): Periodo | null {
  try {
    const v = JSON.parse(localStorage.getItem(clave(vista)) ?? 'null');
    return v && typeof v.desde === 'string' && typeof v.hasta === 'string' ? v : null;
  } catch { return null; }
}

/** «septiembre 2026» o «septiembre 2026 a octubre 2026», sin repetir el mes cuando es uno solo. */
export const textoRango = (p: Periodo, larga: (clave: string) => string) =>
  p.desde === p.hasta ? larga(p.desde) : `${larga(p.desde)} a ${larga(p.hasta)}`;

export function acotar(p: Periodo, todo: Periodo): Periodo {
  return {
    desde: p.desde < todo.desde ? todo.desde : p.desde > todo.hasta ? todo.hasta : p.desde,
    hasta: p.hasta > todo.hasta ? todo.hasta : p.hasta < todo.desde ? todo.desde : p.hasta,
  };
}

export function usePeriodo(vista: string, ordenes: Orden[], inicial: (hoy: Date, todo: Periodo) => Periodo) {
  const hoy = new Date();
  const meses = mesesElegibles(ordenes, hoy);
  const todo: Periodo = { desde: meses[0].clave, hasta: meses[meses.length - 1].clave };
  const [periodo, setPeriodo] = useState<Periodo>(() => acotar(leer(vista) ?? inicial(hoy, todo), todo));
  useEffect(() => {
    try { localStorage.setItem(clave(vista), JSON.stringify(periodo)); } catch { /* sin espacio: el rango dura la sesión */ }
  }, [vista, periodo]);
  return { periodo, setPeriodo, meses, todo };
}

export type Preset = { id: string; texto: string; p: Periodo };

export default function BarraPeriodo({ meses, periodo, setPeriodo, presets, etiqueta }: {
  meses: { clave: string; larga: string }[];
  periodo: Periodo;
  setPeriodo: (p: Periodo) => void;
  presets: Preset[];
  etiqueta: string;
}) {
  const activo = (p: Periodo) => p.desde === periodo.desde && p.hasta === periodo.hasta;
  const ponerDesde = (v: string) => setPeriodo({ desde: v, hasta: v > periodo.hasta ? v : periodo.hasta });
  const ponerHasta = (v: string) => setPeriodo({ desde: v < periodo.desde ? v : periodo.desde, hasta: v });
  return (
    <div className="periodo">
      <div className="segmentos" role="group" aria-label={etiqueta}>
        {presets.map(x => (
          <button key={x.id} aria-pressed={activo(x.p)} className={activo(x.p) ? 'on' : ''} onClick={() => setPeriodo(x.p)}>{x.texto}</button>
        ))}
      </div>
      <label className="campo"><span>Desde</span>
        <select value={periodo.desde} onChange={e => ponerDesde(e.target.value)}>
          {meses.map(x => <option key={x.clave} value={x.clave}>{x.larga}</option>)}
        </select>
      </label>
      <label className="campo"><span>Hasta</span>
        <select value={periodo.hasta} onChange={e => ponerHasta(e.target.value)}>
          {meses.map(x => <option key={x.clave} value={x.clave}>{x.larga}</option>)}
        </select>
      </label>
    </div>
  );
}
