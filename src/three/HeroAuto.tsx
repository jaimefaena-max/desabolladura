import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makeEnv, makeFloor } from './studio';
import { PRIMER } from './Viewer3D';

/**
 * Auto de la portada: un modelo de estudio que gira y cuenta la historia del producto en bucle.
 * El capot pasa por «por reparar» (color del taller), «en trabajo» (el mismo color atenuado)
 * y «reparado» (pintura con barniz), igual que las piezas dentro de la app.
 *
 * Modelo: «Boss 302 1969» de NoodleGames (CGTrader, Royalty Free License), convertido con
 * scripts/obj-a-glb-portada.ts: sin logos ni insignias, aligerado de 47 MB a ≈2,6 MB.
 */

export type Fase = 'reparado' | 'pendiente' | 'proceso';
/** Duración de cada fase en segundos, en orden. */
export const GUION: { fase: Fase; s: number }[] = [
  { fase: 'reparado', s: 3.2 }, { fase: 'pendiente', s: 3.4 }, { fase: 'proceso', s: 3 }, { fase: 'reparado', s: 2.4 },
];

interface Props {
  acento: string;
  /** Se llama una vez cuando el primer cuadro está dibujado (para retirar el póster). */
  onListo: () => void;
  onFase: (f: Fase) => void;
  onError: () => void;
  /** Sin giro (opción «reducir movimiento»): el capot igual cambia de color, que no es movimiento. */
  quieto?: boolean;
  /** Ángulo fijo de cámara (grados) cuando está quieto o para la foto del póster. */
  angulo?: number;
}

const GLSL = /* glsl */ `
uniform vec3 uZMin; uniform vec3 uZMax; uniform vec3 uZCol; uniform float uZMix;
varying vec3 vPosAuto;
float enZona(vec3 p) {
  vec3 d = min(p - uZMin, uZMax - p);
  return smoothstep(0.0, 0.05, min(min(d.x, d.y), d.z));
}
`;

export default function HeroAuto({ acento, onListo, onFase, onError, quieto = false, angulo = 38 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef({ onListo, onFase, onError });
  cb.current = { onListo, onFase, onError };

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    } catch { cb.current.onError(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Auto clásico en un estudio oscuro: el capot se marca por reparar, pasa a trabajo y queda reparado');

    const scene = new THREE.Scene();
    const env = makeEnv(renderer);
    scene.environment = env.texture;
    const cam = new THREE.PerspectiveCamera(26, 1, .1, 80);
    const grupo = new THREE.Group();
    scene.add(grupo);

    const zona = { uZMin: { value: new THREE.Vector3() }, uZMax: { value: new THREE.Vector3() }, uZCol: { value: new THREE.Color(acento) }, uZMix: { value: 0 } };
    let vivo = true, raf = 0, visible = true, t0 = performance.now(), primera = true, largo = 4.7, alto = 1.3;
    const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [];

    const ajustar = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      // Encuadre: el largo del auto cabe completo, con aire alrededor.
      const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const d = Math.max((largo * .54) / (t * cam.aspect), (alto * 1.15) / t);
      cam.userData.d = d;
      cam.updateProjectionMatrix();
    };
    const camara = (grados: number) => {
      const a = THREE.MathUtils.degToRad(grados), d = cam.userData.d as number;
      cam.position.set(Math.sin(a) * d, alto * .55 + d * .16, Math.cos(a) * d);
      cam.lookAt(0, alto * .42, 0);
    };

    new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}portada/mustang.glb`).then(gltf => {
      if (!vivo) return;
      const auto = gltf.scene;
      // El modelo ya viene con el largo en X y el frente (focos) hacia +X, como el resto de la app.
      grupo.add(auto);
      grupo.updateMatrixWorld(true);
      let caja = new THREE.Box3().setFromObject(auto);
      const k = 4.75 / (caja.max.x - caja.min.x);
      auto.scale.multiplyScalar(k);
      grupo.updateMatrixWorld(true);
      caja = new THREE.Box3().setFromObject(auto);
      const c = caja.getCenter(new THREE.Vector3());
      auto.position.sub(new THREE.Vector3(c.x, caja.min.y, c.z));
      grupo.updateMatrixWorld(true);
      caja = new THREE.Box3().setFromObject(auto);
      largo = caja.max.x - caja.min.x; alto = caja.max.y;
      const W = (caja.max.z - caja.min.z) / 2;
      // Zona del capot: primer tercio del largo, sobre la línea de los focos, sin los costados.
      zona.uZMin.value.set(caja.max.x - largo * .33, alto * .5, -W * .82);
      zona.uZMax.value.set(caja.max.x - largo * .03, alto * 1.2, W * .82);

      auto.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        geos.push(o.geometry);
        const m = o.material as THREE.MeshStandardMaterial;
        if (m.name !== 'pintura') { mats.push(m); return; }
        // Pintura de auto: base metalizada grafito + barniz; el capot se tiñe según la fase.
        const p = new THREE.MeshPhysicalMaterial({ color: '#2a2e35', metalness: .6, roughness: .3, clearcoat: 1, clearcoatRoughness: .06 });
        p.onBeforeCompile = sh => {
          Object.assign(sh.uniforms, zona);
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vPosAuto;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvPosAuto = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>\n${GLSL}`)
            .replace('#include <map_fragment>', '#include <map_fragment>\nfloat zM = enZona(vPosAuto) * uZMix;\ndiffuseColor.rgb = mix(diffuseColor.rgb, uZCol, zM);')
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, zM);')
            .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.05, zM);')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uZCol * zM * 0.22;')
            // Una pieza en reparación no tiene barniz: el color del taller se ve parejo.
            .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= 1.0 - 0.9 * zM;');
        };
        p.customProgramCacheKey = () => 'portada-pintura';
        o.material = p;
        m.dispose();
        mats.push(p);
      });
      const piso = makeFloor(largo);
      scene.add(piso);
      geos.push(piso.geometry);
      mats.push(piso.material as THREE.Material);
      ajustar();
      camara(angulo);
      t0 = performance.now();
      pedir();
    }).catch(() => { if (vivo) cb.current.onError(); });

    // Guion: el color del capot sigue a la fase con una transición suave.
    const acentoCol = new THREE.Color(acento), procesoCol = acentoCol.clone().lerp(new THREE.Color(PRIMER), .72);
    const total = GUION.reduce((a, g) => a + g.s, 0);
    let faseActual: Fase | null = null;
    const fase = (s: number) => {
      let r = s % total;
      for (const g of GUION) { if (r < g.s) return g.fase; r -= g.s; }
      return 'reparado' as Fase;
    };

    function cuadro(ahora: number) {
      raf = 0;
      if (!vivo) return;
      const s = (ahora - t0) / 1000;
      if (!quieto) camara(angulo + s * 9);
      const f = fase(s);
      if (f !== faseActual) { faseActual = f; cb.current.onFase(f); }
      // Sin movimiento, el color cambia de una vez; con movimiento, se funde.
      const k = quieto ? 1 : .08, mixMeta = f === 'reparado' ? 0 : .9;
      zona.uZMix.value += (mixMeta - zona.uZMix.value) * k;
      zona.uZCol.value.lerp(f === 'proceso' ? procesoCol : acentoCol, k);
      renderer.render(scene, cam);
      if (primera) { primera = false; cb.current.onListo(); }
      if (visible) raf = quieto ? window.setTimeout(() => cuadro(performance.now()), 250) as unknown as number : requestAnimationFrame(cuadro);
    }
    function pedir() { if (!raf && visible && grupo.children.length) raf = requestAnimationFrame(cuadro); }

    const ro = new ResizeObserver(() => { ajustar(); if (grupo.children.length) { camara(angulo); pedir(); } });
    ro.observe(el);
    // Fuera de pantalla no se dibuja: ahorra batería en el celular.
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) pedir(); });
    io.observe(el);

    return () => {
      vivo = false;
      cancelAnimationFrame(raf); clearTimeout(raf); ro.disconnect(); io.disconnect();
      geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); env.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [acento, quieto, angulo]);

  return <div ref={host} className="hero-auto-lienzo" />;
}
