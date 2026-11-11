import type { DatosVehiculo } from './patentes';

/**
 * Patentes de la demo, con los mismos vehículos que ya trae `seed.ts`.
 *
 * Sirven para dos cosas: mostrar el flujo completo sin conexión y sin clave, y dejar probado el
 * camino «patente → datos» antes de conectar el registro real. La prueba `patentes.test.ts`
 * comprueba contra `ordenesDemo()` que estos datos no se separen de los del taller.
 */
export const VEHICULOS_DEMO: Record<string, DatosVehiculo> = {
  DEMA11: { patente: 'DEMA11', marca: 'Ford', modelo: 'F-150', anio: 2020, color: 'Rojo' },
  DEMA22: { patente: 'DEMA22', marca: 'Toyota', modelo: 'Corolla', anio: 2020 },
  DEMA33: { patente: 'DEMA33', marca: 'Hyundai', modelo: 'Tucson', anio: 2023, color: 'Azul' },
  DEMA44: { patente: 'DEMA44', marca: 'Suzuki', modelo: 'Swift', anio: 2019, color: 'Blanco' },
  DEMA55: { patente: 'DEMA55', marca: 'Kia', modelo: 'Rio', anio: 2021, color: 'Gris' },
};

/** La que se usa en el botón «probar con una patente de ejemplo» y en el padrón de ejemplo. */
export const PATENTE_EJEMPLO = 'DEMA44';

/**
 * Vehículo de prueba que se muestra mientras el registro real no está conectado: cualquier
 * patente válida que escriba el maestro devuelve esta ficha, con todos los campos que después
 * llenará la consulta de verdad (marca, modelo, año, tipo, motor, chasis y color).
 *
 * Motor y chasis van marcados como DEMO a propósito: si algún día alguien los copia a mano en
 * una orden real, el error salta a la vista.
 */
export const AUTO_DEMO: Omit<DatosVehiculo, 'patente'> = {
  marca: 'Toyota',
  modelo: 'Yaris Sport',
  anio: 2022,
  tipo: 'AUTOMOVIL',
  motor: 'DEMO-2NR-0001',
  chasis: 'DEMO0000000000001',
  color: 'Blanco',
};
