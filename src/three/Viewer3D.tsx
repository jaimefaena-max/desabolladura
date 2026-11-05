import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Carroceria, EstadoPieza, PiezaId } from '../lib/types';
import { buildCar, paintFor, type Auto } from './carModel';
import { makeEnv, makeFloor } from './studio';

export const ACENTO_DANO = '#e8501f';
export const PRIMER = '#6b7078';

type Estados = Partial<Record<PiezaId, EstadoPieza>>;

interface Props {
  carroceria: Carroceria;
  color: string;
  estados?: Estados;
  seleccion?: PiezaId | null;
  onPick?: (p: PiezaId) => void;
  autoRotate?: boolean;
  /** Ángulo inicial de cámara en grados, 0 = lateral derecho. */
  angulo?: number;
  etiqueta: string;
}

interface Meta { color: THREE.Color; metalness: number; roughness: number; clearcoat: number; emissive: THREE.Color; }

function metaPara(estado: EstadoPieza | undefined, color: string): Meta {
  const p = paintFor(color), negro = new THREE.Color(0);
  if (estado === 'pendiente') return { color: new THREE.Color(ACENTO_DANO), metalness: .05, roughness: .5, clearcoat: .3, emissive: new THREE.Color(ACENTO_DANO).multiplyScalar(.28) };
  if (estado === 'proceso') return { color: new THREE.Color(PRIMER), metalness: 0, roughness: .8, clearcoat: 0, emissive: negro };
  return { color: p.color, metalness: p.metalness, roughness: p.roughness, clearcoat: p.clearcoat, emissive: negro };
}

export function encuadre(cam: THREE.PerspectiveCamera, auto: Auto, angulo: number, aspecto: number) {
  // Distancia para que el largo y el alto quepan completos, sea cual sea la forma del visor.
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const d = Math.max((auto.largo * .5) / (t * aspecto), (auto.alto * .72) / t) + .9;
  const a = THREE.MathUtils.degToRad(angulo);
  cam.position.set(Math.sin(a) * d, auto.alto * .5 + d * .2, Math.cos(a) * d);
  cam.lookAt(0, auto.alto * .43, 0);
}

export default function Viewer3D({ carroceria, color, estados, seleccion, onPick, autoRotate = false, angulo = 38, etiqueta }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ aplicar(e: Estados, sel: PiezaId | null | undefined, animar: boolean): void } | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const estadoRef = useRef({ estados, seleccion });
  estadoRef.current = { estados, seleccion };
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFallo(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', etiqueta);
    renderer.domElement.setAttribute('role', 'img');

    const scene = new THREE.Scene();
    const env = makeEnv(renderer);
    scene.environment = env.texture;
    const auto = buildCar(carroceria, color);
    scene.add(auto.group);
    const floor = makeFloor(auto.largo);
    scene.add(floor);

    const cam = new THREE.PerspectiveCamera(30, 1, .1, 60);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.enablePan = false; controls.maxPolarAngle = Math.PI * .495; controls.minPolarAngle = Math.PI * .12;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.autoRotate = autoRotate && !reduce; controls.autoRotateSpeed = .9;

    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      cam.aspect = w / h; cam.updateProjectionMatrix();
      return w / h;
    };
    encuadre(cam, auto, angulo, resize());
    controls.target.set(0, auto.alto * .43, 0);
    const dist = cam.position.distanceTo(controls.target);
    controls.minDistance = dist * .55; controls.maxDistance = dist * 1.35;
    controls.update();
    const ro = new ResizeObserver(() => { resize(); pedir(); });
    ro.observe(el);

    // Transiciones de pintura: cada pieza interpola hacia su estado.
    const objetivos = new Map<PiezaId, Meta>();
    let animando = 0;
    const aplicar = (e: Estados, sel: PiezaId | null | undefined, animar: boolean) => {
      auto.piezas.forEach((p, id) => {
        const m = metaPara(e[id], color);
        if (sel === id) m.emissive = new THREE.Color('#ffb199').multiplyScalar(.34);
        objetivos.set(id, m);
        if (!animar) {
          p.mat.color.copy(m.color); p.mat.metalness = m.metalness; p.mat.roughness = m.roughness;
          p.mat.clearcoat = m.clearcoat; p.mat.emissive.copy(m.emissive);
        }
      });
      if (animar && !reduce) animando = 50;
      else if (animar) { animando = 0; aplicar(e, sel, false); }
      pedir();
    };
    const pasoPintura = () => {
      const k = .12;
      auto.piezas.forEach((p, id) => {
        const m = objetivos.get(id);
        if (!m) return;
        p.mat.color.lerp(m.color, k); p.mat.emissive.lerp(m.emissive, k);
        p.mat.metalness += (m.metalness - p.mat.metalness) * k;
        p.mat.roughness += (m.roughness - p.mat.roughness) * k;
        p.mat.clearcoat += (m.clearcoat - p.mat.clearcoat) * k;
      });
      animando--;
    };
    api.current = { aplicar };

    // Render a demanda: sin giro ni animación, la GPU queda en reposo.
    let raf = 0, visible = true, sucio = true;
    function pedir() { sucio = true; if (!raf && visible) raf = requestAnimationFrame(tick); }
    // Equipos lentos: se apaga el giro y se baja la resolución antes de que la página se trabe.
    let lentos = 0, previo = 0;
    function medir() {
      const ahora = performance.now();
      if (previo && ahora - previo < 1000 && ahora - previo > 90) lentos++;
      previo = ahora;
      if (lentos > 8 && controls.autoRotate) { controls.autoRotate = false; renderer.setPixelRatio(1); resize(); }
    }
    function tick() {
      raf = 0;
      medir();
      if (animando > 0) pasoPintura();
      const movido = controls.update();
      if (sucio || movido || animando > 0) { renderer.render(scene, cam); sucio = false; }
      if (visible && (controls.autoRotate || animando > 0 || movido)) raf = requestAnimationFrame(tick);
    }
    controls.addEventListener('change', pedir);
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) pedir(); });
    io.observe(el);

    // Toque sobre pieza: se distingue de arrastre para girar.
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    const dom = renderer.domElement;
    const onDown = (ev: PointerEvent) => { down = { x: ev.clientX, y: ev.clientY }; controls.autoRotate = false; };
    const onUp = (ev: PointerEvent) => {
      if (!down || !pickRef.current) return;
      const mov = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      down = null;
      if (mov > 8) return;
      const r = dom.getBoundingClientRect();
      ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, cam);
      // Vale solo lo primero bajo el dedo: un vidrio o una rueda no seleccionan la pieza del lado opuesto.
      const hit = ray.intersectObject(auto.group, true)[0];
      const id = hit?.object.userData.pieza as PiezaId | undefined;
      if (id) pickRef.current(id);
    };
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    if (onPick) dom.style.cursor = 'pointer';

    aplicar(estadoRef.current.estados ?? {}, estadoRef.current.seleccion, false);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointerup', onUp);
      controls.dispose(); auto.dispose(); env.dispose();
      floor.geometry.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      dom.remove(); api.current = null;
    };
    // El modelo se reconstruye solo si cambia carrocería o color.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carroceria, color]);

  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    api.current?.aplicar(estados ?? {}, seleccion, true);
  }, [estados, seleccion]);

  if (fallo) return <div className="viewer viewer-fallo"><p>Este equipo no puede mostrar el modelo 3D.</p></div>;
  return <div ref={host} className="viewer" />;
}
