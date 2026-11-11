import { fechaLocal, totales } from './piezas';
import { enPeriodo, type Periodo } from './automatizacion';
import type { Factura, Orden } from './types';

/**
 * Cobranza a compañías de seguros.
 *
 * Ley 19.983 (modificada por la Ley 21.131, «pago a 30 días»): la factura se paga dentro de 30 días
 * corridos desde su recepción; plazos mayores solo en los casos excepcionales que permite la ley, con
 * acuerdo escrito (revisar el texto vigente en bcn.cl antes de usarlo con un taller real). Si se paga
 * tarde, el saldo devenga interés por mora y una comisión de cobranza de 1 % del saldo.
 * La demo cuenta desde la emisión (asume recepción el mismo día): los textos lo dicen.
 */
export const PLAZO_LEGAL_DIAS = 30;
export const COMISION_COBRANZA = .01;

const dia = (f: string) => Date.parse(`${f}T12:00:00`);
const entre = (a: string, b: string) => Math.round((dia(b) - dia(a)) / 864e5);

export function sumarDias(f: string, n: number) {
  const d = new Date(dia(f) + n * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const vencimiento = (f: Factura) => sumarDias(f.emitida, PLAZO_LEGAL_DIAS);

export type EstadoFactura = 'pagada' | 'al_dia' | 'por_vencer' | 'vencida';

/** Estado de una factura hoy: días para vencer (negativos = atraso) y comisión de cobranza si corresponde. */
export function estadoFactura(f: Factura, hoy = fechaLocal()) {
  if (f.pagadaEl) {
    const dias = entre(f.emitida, f.pagadaEl);
    return { estado: 'pagada' as EstadoFactura, dias: PLAZO_LEGAL_DIAS - dias, diasPago: dias, atrasoPagado: Math.max(0, dias - PLAZO_LEGAL_DIAS), comision: 0 };
  }
  const restan = entre(hoy, vencimiento(f));
  const estado: EstadoFactura = restan < 0 ? 'vencida' : restan <= 7 ? 'por_vencer' : 'al_dia';
  return { estado, dias: restan, diasPago: null, atrasoPagado: 0, comision: restan < 0 ? Math.round(f.monto * COMISION_COBRANZA) : 0 };
}

export const nombreEstado = (e: ReturnType<typeof estadoFactura>) => (
  e.estado === 'pagada' ? `Pagada en ${e.diasPago} días`
    : e.estado === 'vencida' ? `Vencida hace ${-e.dias} ${-e.dias === 1 ? 'día' : 'días'}`
      : e.dias === 0 ? 'Vence hoy' : `Vence en ${e.dias} ${e.dias === 1 ? 'día' : 'días'}`
);

export const facturasDe = (o: Orden): Factura[] => o.facturas ?? [];

export const facturado = (o: Orden) => facturasDe(o).reduce((a, f) => a + f.monto, 0);

/**
 * Lo que falta facturar a la compañía. Si se autoriza un adicional después de emitida la factura,
 * aquí aparece la diferencia: se cobra con una factura nueva, nunca editando la anterior.
 */
export const porFacturar = (o: Orden) => Math.max(0, totales(o).aseguradora - facturado(o));

export const siguienteFactura = (ordenes: Orden[]) => Math.max(2200, ...ordenes.flatMap(o => facturasDe(o).map(f => f.numero))) + 1;

/** Una orden con seguro queda cobrada cuando la compañía pagó todas sus facturas y el asegurado su deducible. */
export function cobradaSeguro(o: Orden) {
  const t = totales(o), fs = facturasDe(o);
  return fs.length > 0 && fs.every(f => !!f.pagadaEl) && (t.deducible === 0 || !!o.deducibleCobradoEl);
}

export interface FilaCobranza { o: Orden; f: Factura; e: ReturnType<typeof estadoFactura> }

/** Todo lo que el dueño necesita ver de su plata en la calle, ordenado por urgencia. */
export function resumenCobranza(ordenes: Orden[], hoy = fechaLocal(), periodo?: Periodo) {
  const dentro = (f?: string | null) => !periodo || enPeriodo(f, periodo);
  const seguros = ordenes.filter(o => o.pagador.tipo === 'aseguradora');
  // Las facturas se fechan al emitirse: ese mes es el que se filtra. Lo pendiente de hoy se mide aparte.
  // Una orden puede tener varias (presupuesto + adicionales): cada una es una fila con su propio plazo.
  const filas: FilaCobranza[] = seguros.flatMap(o => facturasDe(o).filter(f => dentro(f.emitida)).map(f => ({ o, f, e: estadoFactura(f, hoy) })));
  const carteraHoy = seguros.reduce((a, o) => a + facturasDe(o).filter(f => !f.pagadaEl).reduce((b, f) => b + f.monto, 0), 0);
  const abiertas = filas.filter(x => x.e.estado !== 'pagada').sort((a, b) => a.e.dias - b.e.dias);
  const pagadas = filas.filter(x => x.e.estado === 'pagada').sort((a, b) => b.f.pagadaEl!.localeCompare(a.f.pagadaEl!));
  const suma = (l: FilaCobranza[]) => l.reduce((a, x) => a + x.f.monto, 0);
  const vencidas = abiertas.filter(x => x.e.estado === 'vencida');
  const porVencer = abiertas.filter(x => x.e.estado === 'por_vencer');

  const companias = [...new Set(seguros.map(o => o.pagador.aseguradora ?? 'Sin compañía'))].map(nombre => {
    const suyas = filas.filter(x => x.o.pagador.aseguradora === nombre);
    const pag = suyas.filter(x => x.e.estado === 'pagada');
    const ab = suyas.filter(x => x.e.estado !== 'pagada');
    return {
      nombre,
      abiertas: ab.length, porCobrar: suma(ab), vencido: suma(ab.filter(x => x.e.estado === 'vencida')),
      diasPromedio: pag.length ? Math.round(pag.reduce((a, x) => a + x.e.diasPago!, 0) / pag.length) : null,
    };
  }).filter(c => c.abiertas || c.diasPromedio !== null).sort((a, b) => b.porCobrar - a.porCobrar);

  // Entregadas a las que les falta facturar todo o parte (el adicional autorizado después de facturar).
  const sinFacturar = seguros.filter(o => o.entregadaEl && porFacturar(o) > 0 && dentro(o.entregadaEl));
  const deducibles = seguros.filter(o => o.entregadaEl && totales(o).deducible > 0 && !o.deducibleCobradoEl && dentro(o.entregadaEl));

  return {
    abiertas, pagadas, companias, sinFacturar, deducibles, carteraHoy,
    nFacturas: filas.length, facturado: suma(filas),
    porCobrar: suma(abiertas), vencido: suma(vencidas), nVencidas: vencidas.length,
    porVencer: suma(porVencer), nPorVencer: porVencer.length,
    comisiones: vencidas.reduce((a, x) => a + x.e.comision, 0),
    deduciblesPendientes: deducibles.reduce((a, o) => a + totales(o).deducible, 0),
    sinFacturarMonto: sinFacturar.reduce((a, o) => a + porFacturar(o), 0),
  };
}

const legible = (f: string) => new Date(dia(f)).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

/** Recordatorio formal a la compañía, con la referencia legal. Se envía desde el correo del taller. */
export function correoRecordatorio(x: FilaCobranza, taller: string) {
  const { o, f, e } = x, p = o.pagador;
  const asunto = `Factura N.º ${f.numero} · siniestro ${p.siniestro} · ${e.estado === 'vencida' ? 'pago vencido' : 'próxima a vencer'}`;
  const cuerpo = [
    `Estimados ${p.aseguradora}:`,
    '',
    `Les recordamos la factura N.º ${f.numero}, emitida el ${legible(f.emitida)} por $${f.monto.toLocaleString('es-CL')}, correspondiente a la reparación del siniestro ${p.siniestro} (${o.vehiculo.marca} ${o.vehiculo.modelo}, patente ${o.vehiculo.patente}).`,
    e.estado === 'vencida'
      ? `Según nuestro registro, contado desde la emisión, su vencimiento fue el ${legible(vencimiento(f))} y registra ${-e.dias} días de atraso (si la recepción fue posterior, el plazo corre desde esa fecha). Conforme a la Ley 19.983 (modificada por la Ley 21.131), el saldo devenga interés por mora y una comisión de cobranza de 1 % ($${e.comision.toLocaleString('es-CL')}).`
      : `Según nuestro registro, contado desde la emisión, vence el ${legible(vencimiento(f))} (plazo de 30 días desde la recepción, Ley 19.983, modificada por la Ley 21.131).`,
    '',
    'Quedamos atentos a la confirmación de pago.',
    taller,
  ].join('\n');
  return `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}
