import { useEffect, useState } from 'react';
import { guardarFoto, leerFoto } from './fotos';
import type { Orden, Vista } from './types';

/**
 * Fotos generadas del modelo. Pesan ~100 kB cada una: viven en IndexedDB (las nuevas)
 * o en `public/autos/` (las de la demo), y la orden guarda solo la referencia.
 */
export type Vistas = Partial<Record<Vista, string>>;

export const vistasDe = (o: Orden): Vistas | undefined => o.vistas ?? (o.imagenIA ? { frente: o.imagenIA } : undefined);

export async function guardarVistas(ordenId: string, datos: Vistas): Promise<Vistas> {
  const refs: Vistas = {};
  for (const [vista, src] of Object.entries(datos) as [Vista, string][]) {
    // Una referencia ya guardada (vehículo que vuelve al taller) se reutiliza tal cual.
    if (!src.startsWith('data:')) { refs[vista] = src; continue; }
    const id = `ia-${ordenId}-${vista}`;
    await guardarFoto(id, src);
    refs[vista] = `idb:${id}`;
  }
  return refs;
}

/** Convierte una referencia en algo que un <img> puede mostrar. */
export function useVista(ref?: string) {
  const directa = !ref ? undefined : ref.startsWith('data:') ? ref : ref.startsWith('idb:') ? undefined : `${import.meta.env.BASE_URL}${ref}`;
  const [desdeIdb, setDesdeIdb] = useState<{ ref: string; src?: string }>();
  useEffect(() => {
    if (!ref?.startsWith('idb:')) return;
    let vivo = true;
    leerFoto(ref.slice(4)).then(src => { if (vivo) setDesdeIdb({ ref, src }); }, () => { if (vivo) setDesdeIdb({ ref }); });
    return () => { vivo = false; };
  }, [ref]);
  return directa ?? (desdeIdb?.ref === ref ? desdeIdb?.src : undefined);
}
