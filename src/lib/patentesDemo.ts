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
