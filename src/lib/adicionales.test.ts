import { describe, expect, it } from 'vitest';
import { adicionalesPendientes, autorizarAdicionales, netoAdicionales, rechazarAdicionales } from './adicionales';
import { cobradaSeguro, facturado, montosDe, porFacturar, porFacturarDe } from './cobranza';
import { tituloItem, totales } from './piezas';
import { ordenesDemo } from './seed';
import type { Orden } from './types';

const con1053 = (): Orden => ordenesDemo().find(o => o.numero === 1053)!;
const nombre = (o: Orden) => (i: Orden['items'][number]) => tituloItem(i, o.vehiculo.carroceria);

describe('adicionales', () => {
  it('no suma al presupuesto lo que la compañía todavía no autoriza', () => {
    const o = con1053(), t = totales(o);
    expect(adicionalesPendientes(o)).toHaveLength(3);
    expect(netoAdicionales(o)).toBe(920000);
    // El total es el del presupuesto aprobado: el adicional aparece aparte en su panel.
    expect(t.neto).toBe(totales({ ...o, items: o.items.filter(i => !i.adicional) }).neto);
  });

  it('autorizar todo lo incorpora al trabajo y cierra la aprobación', () => {
    const o = con1053(), antes = totales(o).total;
    const d = autorizarAdicionales(o, 'todos', nombre(o))!;
    expect(adicionalesPendientes(d.orden)).toHaveLength(0);
    expect(d.orden.aprobacion).toBe('aprobada');
    expect(totales(d.orden).total).toBe(antes + Math.round(920000 * 1.19));
    expect(d.orden.historial[0].texto).toContain('3 adicionales autorizados');
  });

  it('autorizar uno deja el resto en espera y registra que faltan', () => {
    const o = con1053(), primero = adicionalesPendientes(o)[0];
    const d = autorizarAdicionales(o, [primero.id], nombre(o))!;
    expect(adicionalesPendientes(d.orden)).toHaveLength(2);
    expect(d.orden.historial[0].texto).toContain('Quedan 2 por autorizar');
    expect(totales(d.orden).neto).toBe(totales(o).neto + (primero.monto ?? 0));
  });

  it('rechazar lo retira de la orden, deja el monto en el historial y no toca los repuestos', () => {
    const o = con1053(), fuera = adicionalesPendientes(o).map(i => i.id);
    const d = rechazarAdicionales(o, fuera, nombre(o))!;
    expect(d.orden.items.some(i => i.adicional)).toBe(false);
    expect(totales(d.orden).neto).toBe(totales(o).neto);
    expect(d.orden.repuestos).toEqual(o.repuestos);
    expect(d.orden.historial[0].texto).toContain('rechazados por la compañía');
    expect(d.orden.historial[0].texto).toContain('480.000');
  });

  it('el administrador fija el precio al autorizar, no el taller', () => {
    const o = con1053(), ids = adicionalesPendientes(o).map(i => i.id);
    const d = autorizarAdicionales(o, ids, nombre(o), { precios: { [ids[0]]: 300000, [ids[1]]: 200000, [ids[2]]: 50000 } })!;
    const autorizados = d.orden.items.filter(i => ids.includes(i.id));
    expect(autorizados.map(i => i.monto)).toEqual([300000, 200000, 50000]);
    expect(d.orden.historial[0].texto).toContain('550.000');
  });

  it('con factura aparte el adicional no entra en la factura del presupuesto', () => {
    const o = con1053(), antes = montosDe(o, 'presupuesto').aseguradora;
    const d = autorizarAdicionales(o, 'todos', nombre(o), { aparte: true })!;
    // El presupuesto no se mueve; el adicional queda como saldo de su propio grupo.
    expect(montosDe(d.orden, 'presupuesto').aseguradora).toBe(antes);
    expect(porFacturarDe(d.orden, 'presupuesto')).toBe(antes);
    expect(porFacturarDe(d.orden, 'adicionales')).toBe(Math.round(920000 * 1.19));
    // Y en una sola factura, en cambio, todo cae en el presupuesto.
    const junto = autorizarAdicionales(o, 'todos', nombre(o))!.orden;
    expect(montosDe(junto, 'adicionales').aseguradora).toBe(0);
    expect(porFacturarDe(junto, 'presupuesto')).toBe(antes + Math.round(920000 * 1.19));
  });

  it('lo autorizado después de facturar queda como saldo para una factura complementaria', () => {
    const o = con1053();
    const emitida = { ...o, facturas: [{ numero: 2225, emitida: '2026-11-10', monto: totales(o).aseguradora }] };
    expect(porFacturar(emitida)).toBe(0);
    const d = autorizarAdicionales(emitida, 'todos', nombre(emitida))!;
    // La factura emitida no se edita: el saldo es exactamente el adicional con IVA.
    expect(porFacturar(d.orden)).toBe(Math.round(920000 * 1.19));
    expect(facturado(d.orden)).toBe(totales(o).aseguradora);
  });

  it('una orden va cobrada solo cuando la compañía pagó todas sus facturas', () => {
    const o = con1053();
    const dos = { ...o, deducibleCobradoEl: '2026-11-10', facturas: [
      { numero: 2225, emitida: '2026-11-10', monto: 1000, pagadaEl: '2026-11-11' },
      { numero: 2226, emitida: '2026-11-10', monto: 2000 },
    ] };
    expect(cobradaSeguro(dos)).toBe(false);
    expect(cobradaSeguro({ ...dos, facturas: dos.facturas.map(f => ({ ...f, pagadaEl: '2026-11-11' })) })).toBe(true);
  });

  it('una orden ya pagada vuelve a quedar por cobrar cuando se autoriza trabajo nuevo', () => {
    const o = { ...con1053(), cobrada: true };
    expect(autorizarAdicionales(o, 'todos', nombre(o))!.orden.cobrada).toBe(false);
    expect(rechazarAdicionales(o, adicionalesPendientes(o).map(i => i.id), nombre(o))!.orden.cobrada).toBe(true);
  });

  it('nada que decidir devuelve null', () => {
    const o = { ...con1053(), items: con1053().items.filter(i => !i.adicional) };
    expect(autorizarAdicionales(o, 'todos', nombre(o))).toBeNull();
    expect(rechazarAdicionales(o, ['ad0'], nombre(o))).toBeNull();
  });
});
