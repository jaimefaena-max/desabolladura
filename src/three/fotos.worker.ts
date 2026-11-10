import { crearMotor, type Opciones } from './fotosMotor';

/**
 * Hilo aparte que dibuja las fotos de las tarjetas: construir el auto y dibujarlo cuesta cientos de
 * milisegundos que aquí no traban la página. Responde { id, blob } o { id, error }.
 */
let motor: ReturnType<typeof crearMotor> | null | undefined;
// Tipado mínimo del Worker: la librería «webworker» de TypeScript choca con la del DOM del resto de la app.
const ctx = self as unknown as { onmessage: ((e: MessageEvent<{ id: number; o: Opciones }>) => void) | null; postMessage(m: unknown): void };

ctx.onmessage = async e => {
  const { id, o } = e.data;
  try {
    motor ??= crearMotor(new OffscreenCanvas(560, 315));
    const blob = await motor.dibujar(o);
    ctx.postMessage({ id, blob });
  } catch (err) {
    motor = null;
    ctx.postMessage({ id, error: String(err) });
  }
};
