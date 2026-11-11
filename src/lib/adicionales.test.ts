import { describe, expect, it } from 'vitest';
import { adicionalesPendientes, autorizarAdicionales, netoAdicionales, rechazarAdicionales } from './adicionales';
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

  it('nada que decidir devuelve null', () => {
    const o = { ...con1053(), items: con1053().items.filter(i => !i.adicional) };
    expect(autorizarAdicionales(o, 'todos', nombre(o))).toBeNull();
    expect(rechazarAdicionales(o, ['ad0'], nombre(o))).toBeNull();
  });
});
