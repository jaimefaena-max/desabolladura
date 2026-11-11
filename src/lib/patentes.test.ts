import { describe, expect, it } from 'vitest';
import { carroceriaDeTipo, consultarPatente, interpretarPatente, leerRespuesta } from './patentes';
import { AUTO_DEMO, VEHICULOS_DEMO } from './patentesDemo';
import { ordenesDemo } from './seed';

describe('interpretarPatente (lectura de la foto)', () => {
  it('acepta los dos formatos vigentes', () => {
    expect(interpretarPatente('DEMA55')).toBe('DEMA55');
    expect(interpretarPatente('AB-1234')).toBe('AB1234');
  });

  it('limpia puntos, espacios y minúsculas', () => {
    expect(interpretarPatente('  dema.55 ')).toBe('DEMA55');
  });

  it('encuentra la patente dentro de un texto más largo', () => {
    expect(interpretarPatente('PATENTE DEMA55 CHILE')).toBe('DEMA55');
  });

  it('corrige las confusiones típicas del OCR según la posición', () => {
    // La S solo puede ser un 5 en la parte numérica.
    expect(interpretarPatente('DEMAS5')).toBe('DEMA55');
    // El 0 solo puede ser una O en la parte de letras.
    expect(interpretarPatente('0EMA55')).toBe('OEMA55');
    expect(interpretarPatente('DEMA5S')).toBe('DEMA55');
  });

  it('devuelve null si no hay nada parecido a una patente', () => {
    expect(interpretarPatente('')).toBeNull();
    expect(interpretarPatente('TALLER')).toBeNull();
    expect(interpretarPatente('123456')).toBeNull();
  });
});

describe('carroceriaDeTipo', () => {
  it('traduce el tipo del registro a la carrocería de la app', () => {
    expect(carroceriaDeTipo('CAMIONETA')).toBe('pickup');
    expect(carroceriaDeTipo('SUV')).toBe('suv');
    expect(carroceriaDeTipo('STATION WAGON')).toBe('suv');
    expect(carroceriaDeTipo('AUTOMOVIL')).toBe('sedan');
    expect(carroceriaDeTipo('HATCHBACK')).toBe('hatchback');
  });

  it('no inventa un tipo que no conoce', () => {
    expect(carroceriaDeTipo('FURGON')).toBeNull();
    expect(carroceriaDeTipo(undefined)).toBeNull();
  });
});

describe('leerRespuesta', () => {
  it('entiende la respuesta del intermediario propio', () => {
    const d = leerRespuesta({ encontrada: true, datos: { marca: 'Toyota', modelo: 'Hilux', anio: 2021, tipo: 'CAMIONETA' } }, 'DEMA55');
    expect(d).toMatchObject({ patente: 'DEMA55', marca: 'Toyota', modelo: 'Hilux', anio: 2021, tipo: 'CAMIONETA' });
  });

  it('entiende también la respuesta del proveedor en crudo', () => {
    const d = leerRespuesta({ status: 'success', data: { make: 'SUBARU', model: 'NEW WRX', year: 2014, engine: 'H983322' } }, 'GPDD74');
    expect(d).toMatchObject({ patente: 'GPDD74', marca: 'SUBARU', modelo: 'NEW WRX', anio: 2014, motor: 'H983322' });
  });

  it('trata como no encontrada lo que no trae vehículo', () => {
    expect(leerRespuesta({ status: 'error', data: null }, 'DEMA55')).toBeNull();
    expect(leerRespuesta({ encontrada: false }, 'DEMA55')).toBeNull();
    expect(leerRespuesta({ encontrada: true, datos: { motor: 'X' } }, 'DEMA55')).toBeNull();
    expect(leerRespuesta(null, 'DEMA55')).toBeNull();
  });
});

describe('consultarPatente sin servicio configurado', () => {
  it('resuelve la patente de ejemplo para poder demostrar el flujo', async () => {
    const r = await consultarPatente('dema.44');
    expect(r.estado).toBe('ok');
    if (r.estado === 'ok') {
      expect(r.fuente).toBe('ejemplo');
      expect(r.datos).toMatchObject({ patente: 'DEMA44', marca: 'Suzuki', modelo: 'Swift', anio: 2019 });
    }
  });

  it('las patentes de ejemplo son las mismas que trae el taller', () => {
    const ordenes = ordenesDemo();
    for (const [patente, d] of Object.entries(VEHICULOS_DEMO)) {
      const o = ordenes.find(x => x.vehiculo.patente === patente);
      expect(o, `la orden de ${patente} debería existir`).toBeTruthy();
      expect([d.marca, d.modelo, d.anio]).toEqual([o!.vehiculo.marca, o!.vehiculo.modelo, o!.vehiculo.anio]);
    }
  });

  it('devuelve el vehículo de prueba para cualquier patente cuando no hay servicio', async () => {
    const r = await consultarPatente('ABCD12');
    expect(r.estado).toBe('ok');
    if (r.estado === 'ok') {
      expect(r.fuente).toBe('ejemplo');
      // La patente que escribió el maestro se conserva; la ficha es la del vehículo de prueba.
      expect(r.datos).toMatchObject({ ...AUTO_DEMO, patente: 'ABCD12' });
    }
  });

  it('respeta la ficha propia de las patentes del taller', async () => {
    const r = await consultarPatente('DEMA33');
    if (r.estado === 'ok') expect(r.datos).toMatchObject({ marca: 'Hyundai', modelo: 'Tucson', anio: 2023 });
  });

  it('no consulta patentes con formato inválido', async () => {
    expect((await consultarPatente('123')).estado).toBe('no-encontrada');
    expect((await consultarPatente('')).estado).toBe('no-encontrada');
  });
});
