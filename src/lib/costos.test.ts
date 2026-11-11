import { beforeEach, describe, expect, it } from 'vitest';
import { interpretarMontoBoleta, interpretarPeriodoBoleta } from './boletas';
import {
  CARGAS_DEFECTO, alertas, calculoMes, costoHoraDelMes, costosDemo, gastoEnMes, guardarBoleta,
  leerCostos, mesesAtras, nombreMes, periodoDe, restablecerCostos, SEMANAS_MES, type BaseCostos,
} from './costos';

const trabajador = (extra: Partial<BaseCostos['trabajadores'][number]> = {}) => ({
  id: 't1', nombre: 'Maestro', sueldoBruto: 700000, horasSemana: 42,
  cargasPct: CARGAS_DEFECTO, ocupacionPct: 80, activo: true, ...extra,
});

const base = (): BaseCostos => ({
  trabajadores: [trabajador()],
  gastos: [{ id: 'luz', nombre: 'Electricidad', periodicidad: 'mensual', activo: true }],
  boletas: [
    { id: 'b1', gastoId: 'luz', periodo: '2026-09', monto: 48200, registradaEl: '2026-09-10T00:00:00.000Z' },
    { id: 'b2', gastoId: 'luz', periodo: '2026-10', monto: 52700, registradaEl: '2026-10-10T00:00:00.000Z' },
  ],
});

describe('meses', () => {
  it('convierte una fecha en su mes', () => {
    expect(periodoDe('2026-11-10')).toBe('2026-11');
    expect(periodoDe('2026-11-10T12:00:00.000Z')).toBe('2026-11');
  });

  it('lista los meses anteriores, del más viejo al más nuevo', () => {
    expect(mesesAtras('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(mesesAtras('2026-01', 1)).toEqual(['2026-01']);
  });

  it('nombra el mes en castellano', () => {
    expect(nombreMes('2026-11')).toBe('noviembre 2026');
    expect(nombreMes('2026-01')).toBe('enero 2026');
  });
});

describe('gasto del mes', () => {
  it('usa la boleta real cuando existe', () => {
    const g = gastoEnMes(base(), base().gastos[0], '2026-10');
    expect(g).toMatchObject({ monto: 52700, real: true, sinDatos: false });
  });

  it('estima con el promedio de las boletas anteriores cuando no llegó', () => {
    const g = gastoEnMes(base(), base().gastos[0], '2026-11');
    expect(g.real).toBe(false);
    expect(g.monto).toBeCloseTo((48200 + 52700) / 2, 0);
  });

  it('marca sin datos cuando no hay ninguna boleta', () => {
    const g = gastoEnMes(base(), base().gastos[0], '2026-01');
    expect(g).toMatchObject({ monto: 0, sinDatos: true });
  });

  it('reparte los gastos anuales entre los doce meses', () => {
    const bd = base();
    bd.gastos.push({ id: 'patente', nombre: 'Patente', periodicidad: 'anual', activo: true });
    bd.boletas.push({ id: 'b3', gastoId: 'patente', periodo: '2026-10', monto: 120000, registradaEl: '2026-10-01T00:00:00.000Z' });
    const g = gastoEnMes(bd, bd.gastos[1], '2026-10');
    expect(g.monto).toBeCloseTo(10000, 0);
  });
});

describe('costo de la hora', () => {
  it('suma sueldo con cargas y gastos y lo reparte entre las horas que producen', () => {
    const bd = base();
    const c = calculoMes(bd, '2026-10');
    const horas = 42 * SEMANAS_MES * 0.8;
    expect(c.horasProductivas).toBeCloseTo(horas, 5);
    expect(c.manoObra).toBeCloseTo(700000 * (1 + CARGAS_DEFECTO / 100), 0);
    expect(c.gastos).toBe(52700);
    expect(c.costoHora).toBeCloseTo((c.manoObra + 52700) / horas, 5);
    expect(c.estimado).toBe(false);
  });

  it('avisa que el mes es estimado cuando falta una boleta', () => {
    const c = calculoMes(base(), '2026-11');
    expect(c.estimado).toBe(true);
  });

  it('no divide por cero si no hay trabajadores activos', () => {
    const bd = base();
    bd.trabajadores = [{ ...trabajador(), activo: false }];
    const c = calculoMes(bd, '2026-10');
    expect(c.horasProductivas).toBe(0);
    expect(c.costoHora).toBe(0);
  });

  it('entrega el costo por empresa para la rentabilidad', () => {
    restablecerCostos('prueba-costo');
    expect(costoHoraDelMes('prueba-costo', '2026-10')).toBeUndefined();
  });
});

describe('boletas', () => {
  beforeEach(() => restablecerCostos('prueba-boleta'));

  it('guardar dos veces el mismo mes reemplaza y no duplica', () => {
    guardarBoleta('prueba-boleta', { gastoId: 'luz', periodo: '2026-11', monto: 50000 });
    guardarBoleta('prueba-boleta', { gastoId: 'luz', periodo: '2026-11', monto: 80000 });
    const bd = leerCostos('prueba-boleta');
    const deNoviembre = bd.boletas.filter(b => b.gastoId === 'luz' && b.periodo === '2026-11');
    expect(deNoviembre).toHaveLength(1);
    expect(deNoviembre[0].monto).toBe(80000);
  });
});

describe('alertas', () => {
  it('avisa cuando falta la boleta del mes anterior', () => {
    // En diciembre, la última boleta cargada es la de octubre: falta la de noviembre.
    const textos = alertas(base(), new Date(2026, 11, 15)).map(a => a.texto);
    expect(textos.some(t => /falta la boleta de noviembre 2026/i.test(t))).toBe(true);
  });

  it('avisa cuando una cuenta sube más de 20 %', () => {
    const bd = base();
    bd.boletas.push({ id: 'b3', gastoId: 'luz', periodo: '2026-11', monto: 80000, registradaEl: '2026-12-10T00:00:00.000Z' });
    const textos = alertas(bd, new Date(2026, 11, 15)).map(a => a.texto);
    expect(textos.some(t => /Electricidad: subió \d+ % en noviembre 2026/i.test(t))).toBe(true);
  });

  it('avisa cuando no hay trabajadores', () => {
    const bd = base();
    bd.trabajadores = [];
    expect(alertas(bd).some(a => /No hay trabajadores activos/.test(a.texto))).toBe(true);
  });
});

describe('datos de ejemplo', () => {
  it('trae tres meses de boletas de luz, con la de noviembre más alta', () => {
    const bd = costosDemo();
    const luz = bd.boletas.filter(b => b.gastoId === 'g-luz').sort((a, b) => (a.periodo < b.periodo ? -1 : 1));
    expect(luz).toHaveLength(3);
    expect(luz[2].monto).toBeGreaterThan(luz[1].monto);
  });

  it('el taller de ejemplo calcula un costo de hora razonable', () => {
    const c = calculoMes(costosDemo(), '2026-11');
    expect(c.costoHora).toBeGreaterThan(5000);
    expect(c.costoHora).toBeLessThan(20000);
  });
});

describe('lectura de la boleta', () => {
  it('toma el total, no los subtotales', () => {
    const texto = ['Cargo fijo $1.890', 'Energía $47.200', 'Subtotal $60.200', 'IVA 19 % $1.200', 'TOTAL A PAGAR $61.400'].join('\n');
    expect(interpretarMontoBoleta(texto)).toBe(61400);
  });

  it('si no hay renglón TOTAL, usa el monto más grande', () => {
    expect(interpretarMontoBoleta('Consumo 312 kWh\nMonto $ 47.200\nAjuste $6.130')).toBe(47200);
  });

  it('devuelve null cuando no hay ningún monto', () => {
    expect(interpretarMontoBoleta('sin números aquí')).toBeNull();
  });

  it('reconoce el mes que cubre la boleta', () => {
    expect(interpretarPeriodoBoleta('Período facturado noviembre 2026')).toBe('2026-11');
    expect(interpretarPeriodoBoleta('Periodo 2026-10')).toBe('2026-10');
    expect(interpretarPeriodoBoleta('Boleta 11/2026')).toBe('2026-11');
    expect(interpretarPeriodoBoleta('sin fecha')).toBeNull();
  });
});
