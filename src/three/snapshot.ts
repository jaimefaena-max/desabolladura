import * as THREE from 'three';
import type { Carroceria, EstadoPieza, Medidas, PiezaId } from '../lib/types';
import { buildCar } from './carModel';
import { makeEnv, makeFloor } from './studio';
import { coloresTrabajo, encuadre } from './Viewer3D';

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
  carroceria: Carroceria; medidas?: Medidas; color: string; acento?: string; estados?: Partial<Record<PiezaId, EstadoPieza>>;
  ancho?: number; alto?: number; angulo?: number;
}

export function foto({ carroceria, medidas, color, acento, estados = {}, ancho = 720, alto = 405, angulo = 38 }: Opciones): string | null {
  const key = JSON.stringify([carroceria, medidas, color, acento, estados, ancho, alto, angulo]);
  const hecha = cache.get(key);
  if (hecha) return hecha;
  const b = iniciar();
  if (!b) return null;
  b.r.setPixelRatio(1);
  b.r.setSize(ancho, alto, false);
  const auto = buildCar(carroceria, color, medidas);
  const c = coloresTrabajo(acento);
  auto.piezas.forEach((p, id) => {
    const e = estados[id];
    if (e === 'pendiente') { p.mat.color.copy(c.dano); p.mat.metalness = .05; p.mat.roughness = .5; p.mat.clearcoat = .3; p.mat.emissive.copy(c.dano).multiplyScalar(.28); }
    if (e === 'proceso') { p.mat.color.copy(c.proceso); p.mat.metalness = 0; p.mat.roughness = .8; p.mat.clearcoat = 0; }
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
