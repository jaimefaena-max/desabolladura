import * as THREE from 'three';

/* Piezas compartidas por los visores y por el motor de fotos (este último corre también en un Worker: sin React ni DOM). */

export const ACENTO_DANO = '#e8501f';
export const PRIMER = '#6b7078';

/**
 * Colores de las piezas intervenidas: los del taller (Ajustes → color de marca).
 * «En trabajo» es el mismo color mezclado con imprimación gris: se distingue y sigue siendo del taller.
 */
export function coloresTrabajo(acento = ACENTO_DANO) {
  const dano = new THREE.Color(acento);
  return { dano, proceso: dano.clone().lerp(new THREE.Color(PRIMER), .72) };
}

export function encuadre(cam: THREE.PerspectiveCamera, auto: { largo: number; alto: number }, angulo: number, aspecto: number) {
  // Distancia para que el largo y el alto quepan completos, sea cual sea la forma del visor.
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const d = Math.max((auto.largo * .5) / (t * aspecto), (auto.alto * .72) / t) + .9;
  const a = THREE.MathUtils.degToRad(angulo);
  cam.position.set(Math.sin(a) * d, auto.alto * .5 + d * .2, Math.cos(a) * d);
  cam.lookAt(0, auto.alto * .43, 0);
}
