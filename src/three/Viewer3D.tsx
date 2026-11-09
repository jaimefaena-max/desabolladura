import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Carroceria, EstadoPieza, Medidas, Modelo3D, PiezaId } from '../lib/types';
import { buildCar, paintFor, type Auto } from './carModel';
import type { AutoReal } from './modeloReal';
import { makeEnv, makeFloor } from './studio';

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

type Estados = Partial<Record<PiezaId, EstadoPieza>>;

interface Props {
  carroceria: Carroceria;
  medidas?: Medidas;
  /** Auto realista creado con IA. Si no carga, se muestra el modelo paramétrico. */
  modelo?: Modelo3D;
  color: string;
  /** Color del taller: pinta las piezas por reparar y en trabajo. */
  acento?: string;
  estados?: Estados;
  seleccion?: PiezaId | null;
  onPick?: (p: PiezaId) => void;
  autoRotate?: boolean;
  /** Ángulo inicial de cámara en grados, 0 = lateral derecho. */
  angulo?: number;
  etiqueta: string;
}

interface Meta { color: THREE.Color; metalness: number; roughness: number; clearcoat: number; emissive: THREE.Color; }

function metaPara(estado: EstadoPieza | undefined, color: string, acento?: string): Meta {
  const p = paintFor(color), negro = new THREE.Color(0), c = coloresTrabajo(acento);
  if (estado === 'pendiente') return { color: c.dano, metalness: .05, roughness: .5, clearcoat: .3, emissive: c.dano.clone().multiplyScalar(.28) };
  if (estado === 'proceso') return { color: c.proceso, metalness: 0, roughness: .8, clearcoat: 0, emissive: negro };
  return { color: p.color, metalness: p.metalness, roughness: p.roughness, clearcoat: p.clearcoat, emissive: negro };
}

/** Tinte de una zona del auto realista: cuánto se cubre la textura y con qué color. */
function tintePara(estado: EstadoPieza | undefined, sel: boolean, acento?: string) {
  const c = coloresTrabajo(acento);
  const col = estado === 'pendiente' ? c.dano : estado === 'proceso' ? c.proceso : new THREE.Color('#ffb199');
  const mix = estado === 'pendiente' ? .86 : estado === 'proceso' ? .8 : sel ? .42 : 0;
  const brillo = (estado === 'pendiente' ? .26 : 0) + (sel ? .22 : 0);
  return { col, mix, brillo };
}

export function encuadre(cam: THREE.PerspectiveCamera, auto: { largo: number; alto: number }, angulo: number, aspecto: number) {
  // Distancia para que el largo y el alto quepan completos, sea cual sea la forma del visor.
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const d = Math.max((auto.largo * .5) / (t * aspecto), (auto.alto * .72) / t) + .9;
  const a = THREE.MathUtils.degToRad(angulo);
  cam.position.set(Math.sin(a) * d, auto.alto * .5 + d * .2, Math.cos(a) * d);
  cam.lookAt(0, auto.alto * .43, 0);
}

/** Lo que el visor necesita de cualquiera de los dos modelos para pintar piezas y elegirlas con el dedo. */
interface Montado {
  group: THREE.Group; largo: number; alto: number;
  aplicar(e: Estados, sel: PiezaId | null | undefined, animar: boolean): void;
  /** Avanza la animación de pintura; devuelve si sigue animando. */
  paso(): boolean;
  pieza(hit: THREE.Intersection): PiezaId | undefined;
  dispose(): void;
}

function montarParametrico(auto: Auto, color: string, acento: string | undefined, reduce: boolean): Montado {
  const objetivos = new Map<PiezaId, Meta>();
  let quedan = 0;
  const fijar = () => auto.piezas.forEach((p, id) => {
    const m = objetivos.get(id)!;
    p.mat.color.copy(m.color); p.mat.metalness = m.metalness; p.mat.roughness = m.roughness;
    p.mat.clearcoat = m.clearcoat; p.mat.emissive.copy(m.emissive);
  });
  return {
    group: auto.group, largo: auto.largo, alto: auto.alto,
    aplicar(e, sel, animar) {
      auto.piezas.forEach((_, id) => {
        const m = metaPara(e[id], color, acento);
        if (sel === id) m.emissive = new THREE.Color('#ffb199').multiplyScalar(.34);
        objetivos.set(id, m);
      });
      if (animar && !reduce) quedan = 50; else { quedan = 0; fijar(); }
    },
    paso() {
      if (quedan <= 0) return false;
      const k = .12;
      auto.piezas.forEach((p, id) => {
        const m = objetivos.get(id);
        if (!m) return;
        p.mat.color.lerp(m.color, k); p.mat.emissive.lerp(m.emissive, k);
        p.mat.metalness += (m.metalness - p.mat.metalness) * k;
        p.mat.roughness += (m.roughness - p.mat.roughness) * k;
        p.mat.clearcoat += (m.clearcoat - p.mat.clearcoat) * k;
      });
      return --quedan > 0;
    },
    pieza: hit => hit.object.userData.pieza as PiezaId | undefined,
    dispose: () => auto.dispose(),
  };
}

function montarReal(auto: AutoReal, acento: string | undefined, reduce: boolean): Montado {
  const objetivos = auto.zonas.map(() => tintePara(undefined, false, acento));
  let quedan = 0;
  const fijar = () => auto.zonas.forEach((z, i) => { z.col.copy(objetivos[i].col); z.mix.value = objetivos[i].mix; z.brillo.value = objetivos[i].brillo; });
  return {
    group: auto.group, largo: auto.largo, alto: auto.alto,
    aplicar(e, sel, animar) {
      auto.zonas.forEach((z, i) => {
        const t = tintePara(e[z.id], sel === z.id, acento);
        // Al aparecer, el color parte del destino: solo se anima cuánto cubre.
        if (z.mix.value < .01) z.col.copy(t.col);
        objetivos[i] = t;
      });
      if (animar && !reduce) quedan = 50; else { quedan = 0; fijar(); }
    },
    paso() {
      if (quedan <= 0) return false;
      const k = .12;
      auto.zonas.forEach((z, i) => {
        const o = objetivos[i];
        z.col.lerp(o.col, k);
        z.mix.value += (o.mix - z.mix.value) * k;
        z.brillo.value += (o.brillo - z.brillo.value) * k;
      });
      return --quedan > 0;
    },
    pieza: hit => auto.piezaEn(hit.point),
    dispose: () => auto.dispose(),
  };
}

export default function Viewer3D({ carroceria, medidas, modelo, color, acento, estados, seleccion, onPick, autoRotate = false, angulo = 38, etiqueta }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ aplicar(e: Estados, sel: PiezaId | null | undefined, animar: boolean): void } | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const estadoRef = useRef({ estados, seleccion });
  estadoRef.current = { estados, seleccion };
  const [fallo, setFallo] = useState(false);
  const [cargando, setCargando] = useState(false);

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
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cam = new THREE.PerspectiveCamera(30, 1, .1, 60);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.enablePan = false; controls.maxPolarAngle = Math.PI * .495; controls.minPolarAngle = Math.PI * .12;
    controls.autoRotate = autoRotate && !reduce; controls.autoRotateSpeed = .9;

    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      cam.aspect = w / h; cam.updateProjectionMatrix();
      return w / h;
    };
    resize();
    const ro = new ResizeObserver(() => { resize(); pedir(); });
    ro.observe(el);

    let auto: Montado | null = null;
    let floor: THREE.Mesh | null = null;
    let vivo = true;
    let animando = false;

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
      if (!auto) return;
      medir();
      animando = auto.paso();
      const movido = controls.update();
      if (sucio || movido || animando) { renderer.render(scene, cam); sucio = false; }
      if (visible && (controls.autoRotate || animando || movido)) raf = requestAnimationFrame(tick);
    }
    controls.addEventListener('change', pedir);
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) pedir(); });
    io.observe(el);

    const montar = (m: Montado) => {
      auto = m;
      scene.add(m.group);
      floor = makeFloor(m.largo);
      scene.add(floor);
      encuadre(cam, m, angulo, resize());
      controls.target.set(0, m.alto * .43, 0);
      const dist = cam.position.distanceTo(controls.target);
      controls.minDistance = dist * .55; controls.maxDistance = dist * 1.35;
      controls.update();
      api.current = { aplicar: (e, sel, animar) => { m.aplicar(e, sel, animar); pedir(); } };
      m.aplicar(estadoRef.current.estados ?? {}, estadoRef.current.seleccion, false);
      pedir();
    };
    const parametrico = () => montarParametrico(buildCar(carroceria, color, medidas), color, acento, reduce);

    if (modelo) {
      setCargando(true);
      import('./modeloReal')
        .then(({ cargarModeloReal }) => cargarModeloReal(modelo, carroceria, medidas, color))
        .then(real => { if (vivo) montar(montarReal(real, acento, reduce)); else real.dispose(); })
        .catch(() => { if (vivo) montar(parametrico()); })
        .finally(() => { if (vivo) setCargando(false); });
    } else {
      montar(parametrico());
    }

    // Toque sobre pieza: se distingue de arrastre para girar.
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    const dom = renderer.domElement;
    const onDown = (ev: PointerEvent) => { down = { x: ev.clientX, y: ev.clientY }; controls.autoRotate = false; };
    const onUp = (ev: PointerEvent) => {
      if (!down || !pickRef.current || !auto) return;
      const mov = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      down = null;
      if (mov > 8) return;
      const r = dom.getBoundingClientRect();
      ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, cam);
      // Vale solo lo primero bajo el dedo: un vidrio o una rueda no seleccionan la pieza del lado opuesto.
      const hit = ray.intersectObject(auto.group, true)[0];
      const id = hit && auto.pieza(hit);
      if (id) pickRef.current(id);
    };
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    if (onPick) dom.style.cursor = 'pointer';

    return () => {
      vivo = false;
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointerup', onUp);
      controls.dispose(); auto?.dispose(); env.dispose();
      floor?.geometry.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      dom.remove(); api.current = null;
    };
    // El modelo se reconstruye solo si cambia carrocería, color, medidas o el modelo realista.
    // Las medidas y el modelo llegan como objetos nuevos en cada render: se comparan por valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carroceria, color, acento, JSON.stringify(medidas ?? null), JSON.stringify(modelo ?? null)]);

  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    api.current?.aplicar(estados ?? {}, seleccion, true);
  }, [estados, seleccion]);

  if (fallo) return <div className="viewer viewer-fallo"><p>Este equipo no puede mostrar el modelo 3D.</p></div>;
  return <div ref={host} className={cargando ? 'viewer cargando-3d' : 'viewer'} aria-busy={cargando || undefined} />;
}
