import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { densidadPara, liberarPiso, makeEnv, makeFloor, opcionesRender } from './studio';
import { PRIMER } from './escena';

/**
 * Auto de la portada: un modelo de estudio que gira y cuenta la historia del producto en bucle.
 * El capot pasa por «por reparar» (color del taller), «en trabajo» (el mismo color atenuado)
 * y «reparado» (pintura con barniz), igual que las piezas dentro de la app.
 *
 * Se gira con el dedo o el mouse; solo, gira despacio.
 *
 * Modelo: «Boss 302 1969» de NoodleGames (CGTrader, Royalty Free License), convertido con
 * scripts/obj-a-glb-portada.ts: sin logos ni insignias, con sus franjas, aligerado de 47 MB a ≈2,9 MB.
 * Después, comprimido con gltfpack (`-cc -km`: meshopt, conserva los materiales con nombre) a ≈0,86 MB
 * (≈630 kB transferidos). La geometría no se simplificó.
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
  /** El visitante tomó el auto con el dedo o el mouse (para ocultar la indicación). */
  onGirar?: () => void;
  /** Sin giro solo (opción «reducir movimiento»): se gira con la mano y el capot igual cambia de color. */
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

export default function HeroAuto({ acento, onListo, onFase, onError, onGirar, quieto = false, angulo = 38 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef({ onListo, onFase, onError, onGirar });
  cb.current = { onListo, onFase, onError, onGirar };

  useEffect(() => {
    const el = host.current!;
    let vivo = true;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: opcionesRender().antialias, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    } catch { cb.current.onError(); return; }
    renderer.setPixelRatio(opcionesRender().dpr);
    // iOS y Android sueltan el contexto 3D con poca memoria: se vuelve a la foto en vez de quedar en negro.
    const perdido = (e: Event) => { e.preventDefault(); if (vivo) cb.current.onError(); };
    renderer.domElement.addEventListener('webglcontextlost', perdido);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Auto clásico amarillo con franjas negras; se puede girar. El capot se marca por reparar, pasa a trabajo y queda reparado');

    const scene = new THREE.Scene();
    const env = makeEnv(renderer);
    scene.environment = env.texture;
    const cam = new THREE.PerspectiveCamera(26, 1, .1, 80);
    // Girar con el dedo o el mouse. Sin zoom ni arrastre lateral: la rueda y el dedo siguen haciendo scroll.
    const controles = new OrbitControls(cam, renderer.domElement);
    controles.enableZoom = false; controles.enablePan = false; controles.enableDamping = true; controles.dampingFactor = .08;
    controles.minPolarAngle = Math.PI * .3; controles.maxPolarAngle = Math.PI * .49;
    controles.autoRotate = !quieto; controles.autoRotateSpeed = 1.4;
    controles.addEventListener('start', () => cb.current.onGirar?.());
    // En el celular, deslizar vertical sigue bajando la página; horizontal gira el auto.
    renderer.domElement.style.touchAction = 'pan-y';
    const grupo = new THREE.Group();
    scene.add(grupo);

    const zona = { uZMin: { value: new THREE.Vector3() }, uZMax: { value: new THREE.Vector3() }, uZCol: { value: new THREE.Color(acento) }, uZMix: { value: 0 } };
    let raf = 0, visible = true, t0 = performance.now(), primera = true, largo = 4.7, alto = 1.3;
    const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [];

    let densidadFija = 0;
    const ajustar = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setPixelRatio(densidadFija || densidadPara(w, h));
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      // Encuadre: el largo del auto cabe completo, con aire alrededor.
      const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const d = Math.max((largo * .6) / (t * cam.aspect), (alto * 1.15) / t);
      cam.updateProjectionMatrix();
      // Conserva el ángulo actual y solo ajusta la distancia.
      const objetivo = controles.target, dir = cam.position.clone().sub(objetivo);
      if (dir.lengthSq() > 0) cam.position.copy(objetivo).add(dir.setLength(d));
      cam.userData.d = d;
    };
    const camara = (grados: number) => {
      const a = THREE.MathUtils.degToRad(grados), d = cam.userData.d as number;
      controles.target.set(0, alto * .42, 0);
      cam.position.set(Math.sin(a) * d, alto * .55 + d * .16, Math.cos(a) * d);
      controles.update();
    };

    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${import.meta.env.BASE_URL}portada/mustang.glb`).then(gltf => {
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
        if (m.name !== 'pintura' && m.name !== 'pintura2') { mats.push(m); return; }
        // Pintura amarilla con las franjas negras del modelo (textura: blanco = pintura, negro = franja)
        // y barniz; el capot se tiñe según la fase.
        const p = new THREE.MeshPhysicalMaterial({ color: '#e3a41c', map: m.map, metalness: .2, roughness: .38, clearcoat: .8, clearcoatRoughness: .14 });
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
        if (p.map) mats.push({ dispose: () => p.map!.dispose() } as THREE.Material);
        mats.push(p);
      });
      const piso = makeFloor(largo);
      // Sombra un poco más angosta: con el auto grande, el piso completo se salía del lienzo y se cortaba.
      piso.scale.set(.82, .9, 1);
      scene.add(piso);
      mats.push({ dispose: () => liberarPiso(piso) } as THREE.Material);
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

    // Equipos lentos: si los cuadros tardan, se apaga el giro solo y se baja la resolución
    // antes de que la página se trabe (el auto se sigue girando con el dedo).
    let lentos = 0, previo = 0, sucio = true, espera = 0;
    function medir(ahora: number) {
      const dt = ahora - previo;
      previo = ahora;
      if (dt > 45 && dt < 1000) lentos++;
      if (lentos > 12 && controles.autoRotate) { controles.autoRotate = false; densidadFija = 1; ajustar(); sucio = true; }
    }
    const proximoCambio = (s: number) => {
      let r = s % total;
      for (const g of GUION) { if (r < g.s) return g.s - r + .01; r -= g.s; }
      return .1;
    };

    function cuadro(ahora: number) {
      raf = 0;
      if (!vivo) return;
      medir(ahora);
      const s = (ahora - t0) / 1000;
      const movido = controles.update();
      const f = fase(s);
      if (f !== faseActual) { faseActual = f; cb.current.onFase(f); sucio = true; }
      // Sin movimiento, el color cambia de una vez; con movimiento, se funde.
      const k = quieto ? 1 : .08, mixMeta = f === 'reparado' ? 0 : .9;
      const colMeta = f === 'proceso' ? procesoCol : acentoCol, col = zona.uZCol.value;
      const fundiendo = Math.abs(mixMeta - zona.uZMix.value) > .002 || Math.abs(colMeta.r - col.r) + Math.abs(colMeta.g - col.g) + Math.abs(colMeta.b - col.b) > .003;
      zona.uZMix.value += (mixMeta - zona.uZMix.value) * k;
      col.lerp(colMeta, k);
      // Solo se dibuja si algo cambió: auto quieto y color estable = GPU en reposo.
      if (sucio || movido || fundiendo) { renderer.render(scene, cam); sucio = false; }
      if (primera) { primera = false; cb.current.onListo(); }
      if (!visible) return;
      if (controles.autoRotate || movido || fundiendo) raf = requestAnimationFrame(cuadro);
      // En reposo solo falta el próximo cambio de fase: se despierta justo en ese momento.
      else espera = window.setTimeout(pedir, Math.max(50, proximoCambio(s) * 1000));
    }
    function pedir() { clearTimeout(espera); if (!raf && visible && grupo.children.length) raf = requestAnimationFrame(cuadro); }
    controles.addEventListener('change', () => { sucio = true; pedir(); });

    const ro = new ResizeObserver(() => { ajustar(); sucio = true; if (grupo.children.length) pedir(); });
    ro.observe(el);
    // Fuera de pantalla no se dibuja: ahorra batería en el celular.
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) pedir(); });
    io.observe(el);

    return () => {
      vivo = false;
      cancelAnimationFrame(raf); clearTimeout(espera); controles.dispose(); ro.disconnect(); io.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', perdido);
      geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); env.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [acento, quieto, angulo]);

  return <div ref={host} className="hero-auto-lienzo" />;
}
