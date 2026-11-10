import * as THREE from 'three';
import type { Carroceria, EstadoPieza, Medidas, PiezaId } from '../lib/types';
import { buildCar, paintFor, type Auto } from './carModel';
import { coloresTrabajo, encuadre } from './escena';
import { liberarPiso, makeEnv, makeFloor } from './studio';

/**
 * Motor que dibuja las fotos de las tarjetas con el auto 3D. Corre en un Worker (OffscreenCanvas),
 * fuera del hilo de la página; si el navegador no lo permite, en la página misma. No usa React ni DOM.
 */
export interface Opciones {
  carroceria: Carroceria; medidas?: Medidas; color: string; acento?: string; estados?: Partial<Record<PiezaId, EstadoPieza>>;
  ancho?: number; alto?: number; angulo?: number;
}

type Lienzo = HTMLCanvasElement | OffscreenCanvas;

export function crearMotor(lienzo: Lienzo) {
  const r = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.environment = makeEnv(r).texture;
  const cam = new THREE.PerspectiveCamera(30, 1, .1, 60);

  /** Autos ya construidos por forma (carrocería + medidas): por foto solo se repintan las piezas. */
  const MAX_AUTOS = 8;
  const autos = new Map<string, { auto: Auto; piso: THREE.Mesh }>();
  const autoPara = (carroceria: Carroceria, medidas?: Medidas) => {
    const k = JSON.stringify([carroceria, medidas ?? null]);
    let a = autos.get(k);
    if (a) { autos.delete(k); autos.set(k, a); return a; }
    const auto = buildCar(carroceria, '#888888', medidas);
    a = { auto, piso: makeFloor(auto.largo) };
    autos.set(k, a);
    if (autos.size > MAX_AUTOS) {
      const [viejo, v] = autos.entries().next().value!;
      autos.delete(viejo); v.auto.dispose(); liberarPiso(v.piso);
    }
    return a;
  };

  /** Color de la carrocería y, encima, el estado de cada pieza (igual que en el visor). */
  const pintar = (auto: Auto, color: string, acento: string | undefined, estados: Partial<Record<PiezaId, EstadoPieza>>) => {
    const p0 = paintFor(color), c = coloresTrabajo(acento);
    auto.piezas.forEach((p, id) => {
      const m = p.mat;
      m.color.copy(p0.color); m.metalness = p0.metalness; m.roughness = p0.roughness;
      m.clearcoat = p0.clearcoat; m.clearcoatRoughness = p0.clearcoatRoughness; m.emissive.setRGB(0, 0, 0);
      const e = estados[id];
      if (e === 'pendiente') { m.color.copy(c.dano); m.metalness = .05; m.roughness = .5; m.clearcoat = .3; m.emissive.copy(c.dano).multiplyScalar(.28); }
      if (e === 'proceso') { m.color.copy(c.proceso); m.metalness = 0; m.roughness = .8; m.clearcoat = 0; }
    });
  };

  return {
    dibujar(o: Opciones): Promise<Blob | null> {
      const { carroceria, medidas, color, acento, estados = {}, ancho = 560, alto = 315, angulo = 38 } = o;
      r.setPixelRatio(1);
      r.setSize(ancho, alto, false);
      const { auto, piso } = autoPara(carroceria, medidas);
      pintar(auto, color, acento, estados);
      scene.add(auto.group, piso);
      cam.aspect = ancho / alto;
      cam.updateProjectionMatrix();
      encuadre(cam, auto, angulo, ancho / alto);
      r.render(scene, cam);
      // La imagen se toma en este instante y se codifica sin bloquear.
      const blob = 'convertToBlob' in lienzo
        ? lienzo.convertToBlob({ type: 'image/webp', quality: .86 })
        : new Promise<Blob | null>(ok => lienzo.toBlob(ok, 'image/webp', .86));
      scene.remove(auto.group, piso);
      return blob;
    },
  };
}
