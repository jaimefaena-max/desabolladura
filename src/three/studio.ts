import * as THREE from 'three';

/** Estudio fotográfico de carrocería: fondo casi negro y softboxes largos que dibujan la línea del auto. */
function studioScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d10);
  const box = (w: number, h: number, pos: [number, number, number], lum: number, tint = 0xffffff) => {
    const c = new THREE.Color(tint).multiplyScalar(lum);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, .6, 0); scene.add(m);
  };
  box(22, 2, [0, 11, 2.6], 6);
  box(22, 2, [0, 11, -2.6], 6);
  box(20, 1.1, [0, 8, 7.5], 9);
  box(20, 1.1, [0, 8, -7.5], 9);
  box(1.6, 7, [13, 4, 0], 5);
  box(1.6, 7, [-13, 4, 0], 4);
  box(26, 3.4, [0, 3.4, 14], 3.4, 0xdfe8f2);
  box(26, 3.4, [0, 3.4, -14], 3.4, 0xdfe8f2);
  box(26, 1.2, [0, .9, 13], 1.5, 0xc9d3de);
  box(26, 1.2, [0, .9, -13], 1.5, 0xc9d3de);
  box(30, 30, [0, -3, 0], .42, 0xc6ccd4);
  return scene;
}

export function makeEnv(renderer: THREE.WebGLRenderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const scene = studioScene();
  const rt = pm.fromScene(scene, .012);
  pm.dispose();
  scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
  return rt;
}

export function makeFloor(largo: number) {
  // En el Worker de fotos no hay document: se usa un OffscreenCanvas.
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(512, 512);
  c.width = 512; c.height = 512;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  const g = x.createRadialGradient(256, 256, 8, 256, 256, 250);
  g.addColorStop(0, 'rgba(0,0,0,.92)'); g.addColorStop(.55, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(largo * 1.32, largo * .78), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .002;
  return m;
}

/** Libera el piso entero: geometría, material y su textura (≈1 MB de GPU cada uno). */
export function liberarPiso(m: THREE.Mesh) {
  const mat = m.material as THREE.MeshBasicMaterial;
  m.geometry.dispose(); mat.map?.dispose(); mat.dispose();
}

/**
 * Antialias solo en pantallas de densidad normal: en las de alta densidad no se nota y cuesta caro.
 * El tope de densidad baja en equipos con pocos núcleos (celulares de gama baja).
 */
export function opcionesRender() {
  const dpr = window.devicePixelRatio || 1, nucleos = navigator.hardwareConcurrency || 4;
  return { antialias: dpr < 2, dpr: Math.min(dpr, nucleos <= 4 ? 1.5 : 1.75) };
}

/**
 * Densidad para un lienzo de w×h: hasta ≈2,1 millones de píxeles dibujados por cuadro.
 * Un escenario de 1100×800 a densidad 1,75 eran 2,7 millones; en pantallas grandes no se distingue.
 */
export function densidadPara(w: number, h: number) {
  const tope = opcionesRender().dpr, presupuesto = 2_100_000;
  return Math.max(1, Math.min(tope, Math.sqrt(presupuesto / Math.max(1, w * h))));
}
