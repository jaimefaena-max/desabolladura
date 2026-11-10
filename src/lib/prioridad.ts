/**
 * Orden de carga de la portada: primero el auto principal; recién después, lo que se adelanta
 * (pantallas siguientes, demo 3D de más abajo). En celular con 4G lenta, adelantar antes le quita
 * red y procesador al auto y lo retrasa.
 */
let lista = false;
const oyentes: (() => void)[] = [];

/** La portada avisa cuando su auto está a la vista (o cuando se quedó con la foto). */
export function portadaLista() {
  if (lista) return;
  lista = true;
  oyentes.splice(0).forEach(f => f());
}

/** Corre f con el navegador libre, después de que la portada esté lista (o pasado el tope, en ms). */
export function despuesDeLaPortada(f: () => void, tope = 12000): () => void {
  let hecho = false, t = 0, idle = 0;
  const correr = () => {
    if (hecho) return;
    hecho = true;
    clearTimeout(t);
    idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 3000 }) : window.setTimeout(f, 50);
  };
  const enPortada = typeof document !== 'undefined' && document.documentElement.classList.contains('en-portada');
  if (lista || !enPortada) correr();
  else { oyentes.push(correr); t = window.setTimeout(correr, tope); }
  return () => { hecho = true; clearTimeout(t); if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idle); clearTimeout(idle); };
}
