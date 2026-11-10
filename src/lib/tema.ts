import { useSyncExternalStore } from 'react';

/**
 * Modo día o noche. Parte según la preferencia del equipo y recuerda la elección.
 * public/rescate.js lo aplica antes de que se dibuje la página (sin parpadeo); aquí se lee y se cambia.
 */
export type Tema = 'claro' | 'oscuro';
const CLAVE = 'dp.tema';
const COLOR_BARRA: Record<Tema, string> = { claro: '#f5f3ef', oscuro: '#0d0f12' };

const oyentes = new Set<() => void>();
const actual = (): Tema => (typeof document !== 'undefined' && document.documentElement.dataset.tema === 'claro' ? 'claro' : 'oscuro');

export function aplicarTema(t: Tema, guardar = true) {
  document.documentElement.dataset.tema = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[t]);
  if (guardar) { try { localStorage.setItem(CLAVE, t); } catch { /* sin almacenamiento: dura hasta cerrar */ } }
  oyentes.forEach(f => f());
}

export const alternarTema = () => aplicarTema(actual() === 'claro' ? 'oscuro' : 'claro');

const suscribir = (f: () => void) => {
  oyentes.add(f);
  // Sin elección guardada, sigue al equipo si este cambia de modo (por ejemplo, al anochecer).
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
  const alCambiar = (e: MediaQueryListEvent) => {
    let elegido: string | null = null;
    try { elegido = localStorage.getItem(CLAVE); } catch { /* nada */ }
    if (!elegido) aplicarTema(e.matches ? 'claro' : 'oscuro', false);
  };
  mq?.addEventListener('change', alCambiar);
  return () => { oyentes.delete(f); mq?.removeEventListener('change', alCambiar); };
};
export const useTema = () => useSyncExternalStore(suscribir, actual, () => 'oscuro' as Tema);
