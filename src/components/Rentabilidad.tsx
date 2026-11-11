import { useState } from 'react';
import { ChartPieSlice } from './iconos';
import { conEvento } from '../lib/automatizacion';
import { calculoMes, costoHoraDelMes, leerCostos, nombreMes, periodoDe } from '../lib/costos';
import { clp } from '../lib/piezas';
import { COSTO_HORA_DEFECTO, rentabilidad, type Semaforo } from '../lib/rentabilidad';
import { actualizar, useEmpresa } from '../lib/store';
import type { Orden, Repuesto } from '../lib/types';

export const TEXTO_SEMAFORO: Record<Semaforo, string> = { buena: 'Buena ganancia', justa: 'Ganancia justa', baja: 'Ganancia baja', perdida: 'Se pierde plata' };

/** Costo real de un repuesto: lo anota el administrador; mientras tanto se usa un estimado. */
function CostoRepuesto({ o, r }: { o: Orden; r: Repuesto }) {
  const [valor, setValor] = useState(r.costo === undefined ? '' : r.costo.toLocaleString('es-CL'));
  const guardar = () => {
    const n = Number(valor.replace(/\D/g, ''));
    if (!valor.trim() || n === r.costo) return;
    actualizar(o.id, x => conEvento({ ...x, repuestos: x.repuestos.map(y => (y.id === r.id ? { ...y, costo: n } : y)) }, `Costo del repuesto ${r.nombre.toLowerCase()}: ${clp(n)}`));
  };
  return (
    <label className="campo rb-costo"><span>Costo de {r.nombre.toLowerCase()}</span>
      <input inputMode="numeric" placeholder="Estimado" value={valor} onChange={e => { const d = e.target.value.replace(/\D/g, ''); setValor(d ? Number(d).toLocaleString('es-CL') : ''); }}
        onBlur={guardar} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

/** ¿Gané o perdí con este auto? Lo cobrado (neto) menos mano de obra, pintura e insumos y repuestos. */
export default function Rentabilidad({ o }: { o: Orden }) {
  const empresa = useEmpresa();
  const r = rentabilidad(o, empresa, p => costoHoraDelMes(empresa.id, p));
  // El costo de la hora sale de los costos cargados para el mes de la orden, no de un número fijo.
  const mes = calculoMes(leerCostos(empresa.id), periodoDe(o.creada));
  const hora = empresa.costoHora ?? (mes.costoHora > 0 ? Math.round(mes.costoHora) : COSTO_HORA_DEFECTO);
  if (r.ingreso === 0) return null;
  const barra = (n: number) => `${Math.max(0, Math.min(100, (n / Math.max(r.ingreso, r.costo)) * 100))}%`;
  return (
    <section className={`rentabilidad no-print ${r.semaforo}`} aria-label="Rentabilidad de la orden">
      <div className="rb-cabeza">
        <p className="ec-tit"><ChartPieSlice size={24} weight="fill" /><b>Rentabilidad</b></p>
        <span className={`chip rb-${r.semaforo}`}>{TEXTO_SEMAFORO[r.semaforo]}</span>
      </div>
      <div className="rb-ganancia">
        <b>{clp(r.ganancia)}</b>
        <span>{r.margen} % de lo cobrado{r.estimado ? ' · con valores estimados' : ''}</span>
      </div>
      <dl className="rb-cuenta">
        <div><dt>Cobrado (neto, sin IVA)</dt><dd>{clp(r.ingreso)}</dd><i style={{ width: barra(r.ingreso) }} className="ing" /></div>
        <div><dt>Mano de obra · {r.horas.toLocaleString('es-CL')} h</dt><dd>− {clp(r.manoObra)}</dd><i style={{ width: barra(r.manoObra) }} /></div>
        <div><dt>Pintura e insumos</dt><dd>− {clp(r.insumos)}</dd><i style={{ width: barra(r.insumos) }} /></div>
        {r.repuestos > 0 && <div><dt>Repuestos</dt><dd>− {clp(r.repuestos)}</dd><i style={{ width: barra(r.repuestos) }} /></div>}
      </dl>
      {o.repuestos.length > 0 && <div className="rb-repuestos">{o.repuestos.map(rep => <CostoRepuesto key={rep.id} o={o} r={rep} />)}</div>}
      <p className="pista">
        {r.sinMonto ? 'Faltan montos: la ganancia cambiará al completarlos. ' : ''}
        Las horas las anota el trabajador al terminar cada tarea; las que faltan y la pintura se estiman con valores típicos. Costo de la hora de taller: {clp(hora)} de {nombreMes(periodoDe(o.creada))}
        {empresa.costoHora ? ' (fijado a mano en Ajustes)' : mes.costoHora > 0 ? (mes.estimado ? ' (estimado: falta alguna boleta)' : ' (con las boletas del mes)') : ' (valor de referencia: carga los costos en Ajustes)'}.
      </p>
    </section>
  );
}
