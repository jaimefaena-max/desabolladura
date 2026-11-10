import type { Opciones } from './fotosMotor';

/**
 * Fotos de las tarjetas (tablero, órdenes, reportes, portada) hechas con el auto 3D.
 *
 * Cada foto costaba ≈250 ms de hilo principal, todas seguidas al abrir una pantalla: eso trababa
 * la app. Ahora:
 * - se dibujan en un hilo aparte (Worker con OffscreenCanvas): la página no se traba; si el
 *   navegador no lo permite, se dibujan en la página, de a una y con el navegador libre;
 * - el auto de cada modelo se construye una vez y se reutiliza (por foto solo se repinta);
 * - quedan guardadas en el navegador (IndexedDB): en la próxima visita aparecen al instante;
 * - solo se piden las que se van a ver (ver FotoAuto en components/ui.tsx).
 */
export type { Opciones };

/* ---------- Dónde se dibuja: hilo aparte o, si no se puede, la página ---------- */
type Dibujar = (o: Opciones | null) => Promise<Blob | null>;

function enWorker(): Dibujar | null {
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
    // WebGL dentro de OffscreenCanvas (Safari lo trae desde la 17).
    if (!new OffscreenCanvas(1, 1).getContext('webgl2')) return null;
    const w = new Worker(new URL('./fotos.worker.ts', import.meta.url), { type: 'module' });
    const espera = new Map<number, (r: { blob?: Blob | null; error?: string }) => void>();
    let n = 0;
    w.onmessage = (e: MessageEvent<{ id: number; blob?: Blob | null; error?: string }>) => { espera.get(e.data.id)?.(e.data); espera.delete(e.data.id); };
    w.onerror = () => { espera.forEach(f => f({ error: 'worker' })); espera.clear(); };
    return o => new Promise((ok, mal) => {
      const id = ++n;
      espera.set(id, r => (r.error ? mal(new Error(r.error)) : ok(r.blob ?? null)));
      w.postMessage({ id, o });
    });
  } catch {
    return null;
  }
}

let enPagina: Promise<Dibujar | null> | undefined;
function dibujarEnPagina(): Promise<Dibujar | null> {
  enPagina ??= import('./fotosMotor').then(({ crearMotor }) => {
    try {
      const m = crearMotor(document.createElement('canvas'));
      return (o: Opciones | null) => (o ? m.dibujar(o) : Promise.resolve(null));
    } catch {
      return null; // sin WebGL: las tarjetas quedan con su fondo
    }
  });
  return enPagina;
}

let worker: Dibujar | null | undefined;
async function dibujar(o: Opciones): Promise<Blob | null> {
  if (worker === undefined) worker = enWorker();
  if (worker) {
    try { return await worker(o); } catch { worker = null; /* falla el hilo aparte: se sigue en la página */ }
  }
  const d = await dibujarEnPagina();
  return d ? d(o) : null;
}

/* ---------- Fotos guardadas en el navegador ---------- */
const VERSION = 'v2';
function abrirCache() {
  return new Promise<IDBDatabase>((ok, mal) => {
    const r = indexedDB.open('dp-cache', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fotos3d');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
let db: Promise<IDBDatabase | null> | undefined;
const cache = () => (db ??= (typeof indexedDB === 'undefined' ? Promise.resolve(null) : abrirCache().catch(() => null)));

async function leerGuardada(k: string): Promise<Blob | undefined> {
  const d = await cache();
  if (!d) return undefined;
  return new Promise(ok => {
    try {
      const r = d.transaction('fotos3d').objectStore('fotos3d').get(k);
      r.onsuccess = () => ok(r.result instanceof Blob ? r.result : undefined);
      r.onerror = () => ok(undefined);
    } catch { ok(undefined); }
  });
}
async function guardar(k: string, blob: Blob) {
  const d = await cache();
  if (!d) return;
  try {
    const t = d.transaction('fotos3d', 'readwrite'), s = t.objectStore('fotos3d');
    // Tope simple: si se juntan muchas, se empieza de cero (se regeneran solas).
    const n = s.count();
    n.onsuccess = () => { if (n.result > 300) s.clear(); s.put(blob, k); };
  } catch { /* sin espacio: la foto vale solo para esta visita */ }
}

/* ---------- Cola: de a una foto; en la página, solo con el navegador libre ---------- */
const enMemoria = new Map<string, string>();
const MAX_MEMORIA = 80;
const pendientes = new Map<string, Promise<string | null>>();
const cola: (() => Promise<void>)[] = [];
let trabajando = false;

const libre = (f: () => void) => {
  // El hilo aparte se crea recién cuando hay que dibujar algo (si todas las fotos estaban guardadas, ni se baja).
  if (worker === undefined) worker = enWorker();
  // En el hilo aparte no hace falta esperar: la página no se traba.
  if (worker) { f(); return; }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(f, { timeout: 600 }); else setTimeout(f, 16);
};
function siguiente() {
  if (trabajando) return;
  const tarea = cola.shift();
  if (!tarea) return;
  trabajando = true;
  libre(() => { void tarea().finally(() => { trabajando = false; siguiente(); }); });
}

function recordar(k: string, url: string) {
  enMemoria.set(k, url);
  if (enMemoria.size > MAX_MEMORIA) {
    const viejo = enMemoria.keys().next().value!;
    URL.revokeObjectURL(enMemoria.get(viejo)!);
    enMemoria.delete(viejo);
  }
  return url;
}

const clave = (o: Opciones) => JSON.stringify([VERSION, o.carroceria, o.medidas ?? null, o.color, o.acento ?? null, o.estados ?? {}, o.ancho ?? 560, o.alto ?? 315, o.angulo ?? 38]);

/**
 * Deja listo el hilo aparte (descarga y prepara el motor 3D allá, sin tocar la página): así la
 * primera pantalla con fotos no espera la red. Se llama en tiempo libre, después de la portada.
 */
export function calentar() {
  if (worker === undefined) worker = enWorker();
  if (worker) void worker(null).catch(() => {});
}

/** Foto ya hecha en esta visita (para mostrarla sin esperar). */
export const fotoLista = (o: Opciones) => enMemoria.get(clave(o));

/** Pide la foto: primero la guardada; si no hay, la dibuja (en el hilo aparte si se puede). */
export function foto(o: Opciones): Promise<string | null> {
  const k = clave(o);
  const hecha = enMemoria.get(k);
  if (hecha) return Promise.resolve(hecha);
  let p = pendientes.get(k);
  if (p) return p;
  p = (async () => {
    const guardada = await leerGuardada(k);
    if (guardada) return recordar(k, URL.createObjectURL(guardada));
    return new Promise<string | null>(ok => {
      cola.push(async () => {
        const blob = await dibujar(o).catch(() => null);
        if (!blob) { ok(null); return; }
        void guardar(k, blob);
        ok(recordar(k, URL.createObjectURL(blob)));
      });
      siguiente();
    });
  })().finally(() => pendientes.delete(k));
  pendientes.set(k, p);
  return p;
}
