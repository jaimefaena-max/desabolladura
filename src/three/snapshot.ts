import * as THREE from 'three';
import type { Carroceria, EstadoPieza, PiezaId } from '../lib/types';
import { buildCar } from './carModel';
import { makeEnv, makeFloor } from './studio';
import { ACENTO_DANO, encuadre, PRIMER } from './Viewer3D';

/** Un solo renderizador oculto entrega las fotos de las tarjetas: evita abrir un contexto WebGL por vehículo. */
let base: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null | undefined;
const cache = new Map<string, string>();

function iniciar() {
  if (base !== undefined) return base;
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    scene.environment = makeEnv(r).texture;
    base = { r, scene, cam: new THREE.PerspectiveCamera(30, 1, .1, 60) };
  } catch {
    base = null;
  }
  return base;
}

interface Opciones {
  carroceria: Carroceria; color: string; estados?: Partial<Record<PiezaId, EstadoPieza>>;
  ancho?: number; alto?: number; angulo?: number;
}

export function foto({ carroceria, color, estados = {}, ancho = 720, alto = 405, angulo = 38 }: Opciones): string | null {
  const key = JSON.stringify([carroceria, color, estados, ancho, alto, angulo]);
  const hecha = cache.get(key);
  if (hecha) return hecha;
  const b = iniciar();
  if (!b) return null;
  b.r.setPixelRatio(1);
  b.r.setSize(ancho, alto, false);
  const auto = buildCar(carroceria, color);
  auto.piezas.forEach((p, id) => {
    const e = estados[id];
    if (e === 'pendiente') { p.mat.color.set(ACENTO_DANO); p.mat.metalness = .05; p.mat.roughness = .5; p.mat.clearcoat = .3; p.mat.emissive.set(ACENTO_DANO).multiplyScalar(.28); }
    if (e === 'proceso') { p.mat.color.set(PRIMER); p.mat.metalness = 0; p.mat.roughness = .8; p.mat.clearcoat = 0; }
  });
  const piso = makeFloor(auto.largo);
  b.scene.add(auto.group, piso);
  b.cam.aspect = ancho / alto;
  b.cam.updateProjectionMatrix();
  encuadre(b.cam, auto, angulo, ancho / alto);
  b.r.render(b.scene, b.cam);
  const url = b.r.domElement.toDataURL('image/webp', .86);
  b.scene.remove(auto.group, piso);
  auto.dispose();
  piso.geometry.dispose();
  cache.set(key, url);
  return url;
}
