import * as THREE from 'three';
import type { Carroceria, Medidas, PiezaId } from '../lib/types';

/** Vehículo paramétrico: cada pieza de carrocería es una malla propia, seleccionable y pintable. */

type Pts = [number, number][];

export interface Spec {
  L: number; W: number; nF: number; nR: number;
  wheelR: number; axleF: number; axleR: number; sill: number; arch: number;
  belt: Pts; top: Pts;
  cowl: number; wsTop: number; roofEnd: number; rearBase: number;
  doors: [number, number, number]; tail: number; tumble: number; crown: number;
  winEnd: number; bed?: [number, number];
}

const SPECS: Record<Carroceria, Spec> = {
  sedan: {
    L: 4.65, W: 1.8, nF: 3.6, nR: 4.6, wheelR: 0.33, axleF: 0.185, axleR: 0.785, sill: 0.17, arch: 0.375,
    belt: [[0, .6], [.05, .73], [.16, .8], [.31, .89], [.6, .94], [.84, .98], [.97, .97], [1, .84]],
    top: [[0, .6], [.045, .77], [.16, .85], [.3, .94], [.33, 1.0], [.42, 1.31], [.48, 1.42], [.6, 1.44], [.7, 1.4], [.77, 1.28], [.86, 1.03], [.9, 1.015], [.97, .985], [1, .84]],
    cowl: .31, wsTop: .45, roofEnd: .72, rearBase: .86,
    doors: [.335, .525, .7], tail: .945, tumble: .2, crown: .045, winEnd: .735,
  },
  hatchback: {
    L: 4.0, W: 1.74, nF: 3.6, nR: 6, wheelR: 0.31, axleF: 0.185, axleR: 0.81, sill: 0.17, arch: 0.355,
    belt: [[0, .58], [.06, .75], [.2, .84], [.33, .93], [.7, 1.0], [.95, 1.02], [.985, 1.0], [1, .82]],
    top: [[0, .58], [.05, .8], [.2, .905], [.32, .985], [.35, 1.04], [.46, 1.42], [.52, 1.49], [.75, 1.48], [.88, 1.37], [.955, 1.09], [.99, 1.04], [1, .82]],
    cowl: .33, wsTop: .49, roofEnd: .85, rearBase: .955,
    doors: [.35, .55, .72], tail: .94, tumble: .17, crown: .045, winEnd: .86,
  },
  suv: {
    L: 4.62, W: 1.88, nF: 4.2, nR: 7, wheelR: 0.365, axleF: 0.19, axleR: 0.785, sill: 0.25, arch: 0.42,
    belt: [[0, .72], [.05, .89], [.2, .98], [.33, 1.06], [.7, 1.12], [.93, 1.16], [.985, 1.13], [1, .98]],
    top: [[0, .72], [.04, .92], [.2, 1.04], [.31, 1.125], [.335, 1.19], [.42, 1.59], [.47, 1.67], [.7, 1.69], [.88, 1.65], [.93, 1.51], [.975, 1.21], [.995, 1.15], [1, .98]],
    cowl: .31, wsTop: .445, roofEnd: .895, rearBase: .975,
    doors: [.335, .525, .685], tail: .95, tumble: .13, crown: .05, winEnd: .905,
  },
  pickup: {
    L: 5.7, W: 2.0, nF: 5, nR: 12, wheelR: 0.415, axleF: 0.175, axleR: 0.785, sill: 0.4, arch: 0.47,
    belt: [[0, .95], [.035, 1.14], [.2, 1.24], [.3, 1.3], [.62, 1.32], [.985, 1.34], [1, 1.22]],
    top: [[0, .95], [.03, 1.2], [.2, 1.31], [.275, 1.36], [.3, 1.42], [.37, 1.84], [.41, 1.91], [.58, 1.92], [.612, 1.86], [.624, 1.43], [.632, 1.37], [.985, 1.36], [1, 1.22]],
    cowl: .285, wsTop: .395, roofEnd: .6, rearBase: .63,
    doors: [.3, .455, .615], tail: .975, tumble: .1, crown: .04, winEnd: .6, bed: [.64, .975],
  },
};

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const gauss = (v: number) => Math.exp(-v * v);

/** Interpolación cúbica monótona: sin sobrepasos en los quiebres de la silueta. */
function curve(p: Pts) {
  const n = p.length, d: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d[i] = (p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (f: number) => {
    f = clamp(f);
    let i = 0;
    while (i < n - 2 && f > p[i + 1][0]) i++;
    const h = p[i + 1][0] - p[i][0], t = (f - p[i][0]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
}

type V3 = [number, number, number];

class Forma {
  s: Spec; half: number; beltF: (f: number) => number; topF: (f: number) => number;
  xs: number[]; yc: number; hRoof: number;
  constructor(s: Spec) {
    this.s = s; this.half = s.L / 2;
    this.beltF = curve(s.belt); this.topF = curve(s.top);
    this.xs = [this.X(s.axleF), this.X(s.axleR)];
    this.yc = s.wheelR;
    this.hRoof = Math.max(...s.top.map(p => p[1])) - this.beltF(.5);
  }
  X = (f: number) => this.half - f * this.s.L;
  F = (x: number) => (this.half - x) / this.s.L;
  belt = (x: number) => this.beltF(this.F(x));
  top = (x: number) => this.topF(this.F(x));
  n = (x: number) => (x >= 0 ? this.s.nF : this.s.nR);
  u = (x: number) => clamp(Math.abs(x) / this.half);
  hw = (x: number) => { const n = this.n(x); return (this.s.W / 2) * Math.pow(Math.max(0, 1 - Math.pow(this.u(x), n)), 1 / n); };
  sill = (x: number) => this.s.sill + .13 * smooth(.78, 1, this.u(x));
  end = (x: number) => smooth(.72, 1, this.u(x));
  nose = (t: number) => .04 * (1 - t) * (1 - t) + .018 * t * t * t;
  shape(t: number, x: number) {
    const low = .925 + .075 * Math.sin(Math.min(t / .6, 1) * Math.PI / 2);
    const up = t > .6 ? .036 * Math.pow((t - .6) / .4, 2) : 0;
    const crease = .0075 * gauss((t - .72) / .035) - .0035 * gauss((t - .66) / .05);
    const flare = this.xs.reduce((a, xw) => a + .017 * gauss((x - xw) / .62), 0) * smooth(.15, .5, t) * (1 - smooth(.72, .98, t));
    return low - up + crease + flare;
  }
  shell(x: number, t: number, side: number, lift = 0): V3 {
    const y = lerp(this.sill(x), this.belt(x), t);
    const z = this.hw(x) * this.shape(t, x);
    const e = this.end(x);
    return [x * (1 - e * this.nose(t)) + Math.sign(x) * lift * e, y, side * (z + lift * (1 - e * .6))];
  }
  railZ(x: number) {
    const h = clamp((this.top(x) - this.belt(x) - this.s.crown) / this.hRoof);
    return this.hw(x) * this.shape(1, x) * (1 - this.s.tumble * h);
  }
  railY(x: number) { return this.belt(x) + Math.max(0, this.top(x) - this.belt(x) - this.s.crown) * .955; }
  deck(x: number, s: number, lift = 0): V3 {
    const r = this.railY(x), p = 2.5;
    return [x * (1 - this.end(x) * this.nose(1)), r + (this.top(x) - r) * (1 - Math.pow(Math.abs(s), p)) + lift, s * this.railZ(x)];
  }
  green(x: number, t: number, side: number, lift = 0): V3 {
    const zb = this.hw(x) * this.shape(1, x), zr = this.railZ(x);
    return [x, lerp(this.belt(x), this.railY(x), t), side * (lerp(zb, zr, t) + .012 * Math.sin(t * Math.PI) + lift)];
  }
  /** Punto del frontal o la zaga a partir de su ancho real: sirve para focos, parrilla y patente. */
  fascia(front: boolean, z: number, t: number, lift = 0): V3 {
    const sgn = front ? 1 : -1, n = front ? this.s.nF : this.s.nR;
    const w = (this.s.W / 2) * this.shape(t, sgn * this.half * .98);
    const r = clamp(Math.abs(z) / w, 0, .995);
    const x = sgn * this.half * Math.pow(1 - Math.pow(r, n), 1 / n);
    const p = this.shell(x, t, z >= 0 ? 1 : -1);
    return [p[0] + sgn * lift * (1 - r), p[1], p[2] + Math.sign(z || 1) * lift * r];
  }
  /** Ancho al que la superficie retrocede hasta la fracción u del semilargo: limita cuánto envuelve una óptica. */
  zAt(front: boolean, u: number) { const n = front ? this.s.nF : this.s.nR; return (this.s.W / 2) * Math.pow(1 - Math.pow(u, n), 1 / n); }
  stations(a: number, b: number, n: number) {
    const aX = (x: number) => { const v = clamp(Math.abs(x) / this.half); return Math.sign(x) * Math.asin(Math.pow(v, this.n(x) / 2)); };
    const xA = (w: number) => { const e = 2 / (w >= 0 ? this.s.nF : this.s.nR); return Math.sign(w) * this.half * Math.pow(Math.sin(Math.abs(w)), e); };
    const wa = aX(a), wb = aX(b);
    return Array.from({ length: n + 1 }, (_, i) => xA(lerp(wa, wb, i / n)));
  }
}

function grid(cols: number, rows: number, fn: (i: number, j: number) => V3) {
  const pos = new Float32Array((cols + 1) * (rows + 1) * 3), idx: number[] = [];
  for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) pos.set(fn(i, j), (i * (rows + 1) + j) * 3);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const a = i * (rows + 1) + j, b = a + rows + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface Pintura { color: THREE.Color; metalness: number; roughness: number; clearcoat: number; clearcoatRoughness: number; }

export interface Auto {
  group: THREE.Group;
  piezas: Map<PiezaId, { mat: THREE.MeshPhysicalMaterial; meshes: THREE.Mesh[] }>;
  pickables: THREE.Mesh[];
  largo: number; alto: number;
  dispose(): void;
}

export function paintFor(hex: string): Pintura {
  return { color: new THREE.Color(hex), metalness: .45, roughness: .34, clearcoat: 1, clearcoatRoughness: .05 };
}

/**
 * Lleva la carrocería base a las medidas reales del modelo. Los topes evitan que un dato
 * erróneo de internet deforme el auto: fuera de ellos se queda en el límite.
 * El largo se reparte por tramos (voladizo delantero, entre ejes, voladizo trasero) para que
 * puertas, pilares y arcos sigan a las ruedas en vez de estirarse parejo.
 */
export function ajustarSpec(s: Spec, m?: Medidas): Spec {
  if (!m) return s;
  const L = clamp(m.largo, s.L * .8, s.L * 1.2);
  const W = clamp(m.ancho, s.W * .9, s.W * 1.1);
  const techo = Math.max(...s.top.map(p => p[1]));
  const kH = clamp(m.alto / techo, .85, 1.15);
  const w = clamp(m.entreEjes / L, .5, .68), w0 = s.axleR - s.axleF;
  const parte = s.axleF / (s.axleF + 1 - s.axleR);
  const aF = (1 - w) * parte, aR = aF + w;
  const g = (f: number) => (f <= s.axleF ? (f / s.axleF) * aF
    : f <= s.axleR ? aF + ((f - s.axleF) / w0) * w
      : aR + ((f - s.axleR) / (1 - s.axleR)) * (1 - aR));
  const perfil = (p: Pts): Pts => p.map(([x, y]) => [g(x), y * kH]);
  return {
    ...s, L, W, axleF: aF, axleR: aR,
    belt: perfil(s.belt), top: perfil(s.top),
    cowl: g(s.cowl), wsTop: g(s.wsTop), roofEnd: g(s.roofEnd), rearBase: g(s.rearBase),
    doors: s.doors.map(g) as Spec['doors'], tail: g(s.tail), winEnd: g(s.winEnd),
    bed: s.bed && [g(s.bed[0]), g(s.bed[1])],
  };
}

export const specDe = (tipo: Carroceria, m?: Medidas) => ajustarSpec(SPECS[tipo], m);

export function buildCar(tipo: Carroceria, colorHex: string, medidas?: Medidas): Auto {
  const s = specDe(tipo, medidas), f = new Forma(s), group = new THREE.Group();
  const G = .0045; // separación entre piezas
  const base = paintFor(colorHex);
  const piezas: Auto['piezas'] = new Map();
  const pickables: THREE.Mesh[] = [];
  const side = THREE.DoubleSide;

  const mats = {
    inner: new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: .9, side }),
    trim: new THREE.MeshStandardMaterial({ color: 0x0d0f11, roughness: .55, side }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0e12, metalness: .2, roughness: .06, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: .9, side }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xcfd9e2, metalness: .8, roughness: .14, emissive: 0xf4f8ff, emissiveIntensity: .55, clearcoat: 1, side }),
    housing: new THREE.MeshStandardMaterial({ color: 0x14171a, metalness: .7, roughness: .3, side }),
    tail: new THREE.MeshPhysicalMaterial({ color: 0x5b0710, roughness: .2, emissive: 0xc40f1e, emissiveIntensity: .75, clearcoat: 1, side }),
    grille: new THREE.MeshStandardMaterial({ color: 0x08090a, metalness: .5, roughness: .45, side }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd6dade, metalness: 1, roughness: .16, side }),
    plate: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: .55, side }),
    tire: new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: .85, side }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb9bec4, metalness: 1, roughness: .26, side }),
    disc: new THREE.MeshStandardMaterial({ color: 0x4a4d50, metalness: .9, roughness: .42, side }),
  };

  const pieza = (id: PiezaId) => {
    let p = piezas.get(id);
    if (!p) {
      p = { mat: new THREE.MeshPhysicalMaterial({ ...base, color: base.color.clone(), side, envMapIntensity: 1.15 }), meshes: [] };
      piezas.set(id, p);
    }
    return p;
  };
  const add = (g: THREE.BufferGeometry, id: PiezaId) => {
    const p = pieza(id), m = new THREE.Mesh(g, p.mat);
    m.userData.pieza = id; p.meshes.push(m); pickables.push(m); group.add(m);
  };
  const plain = (g: THREE.BufferGeometry, mat: THREE.Material) => group.add(new THREE.Mesh(g, mat));

  // Normales analíticas: el reflejo corre continuo de una pieza a otra, sin arrugas en los bordes.
  const suave = (g: THREE.BufferGeometry, cols: number, rows: number, uv: (i: number, j: number) => [number, number], sd: number) => {
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute, e = .004;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), o = new THREE.Vector3();
    for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) {
      const [x, t] = uv(i, j), k = i * (rows + 1) + j;
      if (Math.abs(x) > f.half * .985) continue;
      const dx = Math.sign(x || 1) * -e;
      o.set(...f.shell(x, t, sd));
      a.set(...f.shell(x + dx, t, sd)).sub(o);
      b.set(...f.shell(x, t + e, sd)).sub(o);
      c.crossVectors(a, b).normalize();
      if (c.x * nrm.getX(k) + c.y * nrm.getY(k) + c.z * nrm.getZ(k) < 0) c.negate();
      nrm.setXYZ(k, c.x, c.y, c.z);
    }
    return g;
  };

  // Panel lateral con recorte exacto del arco de rueda.
  const arcoT = (x: number, xw: number) => {
    const dx = x - xw, y = f.yc + Math.sqrt(Math.max(0, s.arch * s.arch - dx * dx));
    return (y - f.sill(x)) / (f.belt(x) - f.sill(x));
  };
  const lateral = (xa: number, xb: number, t0: number, t1: number, sd: number, out: (g: THREE.BufferGeometry) => void) => {
    const cortes = [Math.min(xa, xb), Math.max(xa, xb)];
    f.xs.forEach(xw => [xw - s.arch, xw + s.arch].forEach(c => { if (c > cortes[0] && c < cortes[1]) cortes.push(c); }));
    cortes.sort((a, b) => a - b);
    for (let k = 0; k < cortes.length - 1; k++) {
      const a = cortes[k], b = cortes[k + 1], mid = (a + b) / 2;
      const xw = f.xs.find(w => Math.abs(mid - w) < s.arch);
      if (xw === undefined) {
        const punta = Math.max(Math.abs(a), Math.abs(b)) > f.half * .8;
        const st = f.stations(a, b, punta ? 44 : Math.max(6, Math.ceil((b - a) * 26)));
        out(suave(grid(st.length - 1, 30, (i, j) => f.shell(st[i], lerp(t0, t1, j / 30), sd)), st.length - 1, 30, (i, j) => [st[i], lerp(t0, t1, j / 30)], sd));
      } else {
        const n = 44;
        const aA = Math.acos(clamp((b - xw) / s.arch, -1, 1)), aB = Math.acos(clamp((a - xw) / s.arch, -1, 1));
        const st = Array.from({ length: n + 1 }, (_, i) => xw + s.arch * Math.cos(lerp(aA, aB, i / n)));
        const lim = (x: number) => Math.min(t1 - .004, Math.max(t0, arcoT(x, xw)));
        out(suave(grid(n, 30, (i, j) => f.shell(st[i], lerp(lim(st[i]), t1, j / 30), sd)), n, 30, (i, j) => [st[i], lerp(lim(st[i]), t1, j / 30)], sd));
      }
    }
  };
  const lado = (id: PiezaId | null, xa: number, xb: number, t0: number, t1: number, sd: number, mat?: THREE.Material) =>
    lateral(xa, xb, t0, t1, sd, g => (id ? add(g, id) : plain(g, mat!)));

  const deck = (xa: number, xb: number, s0: number, s1: number, lift: number, cols: number, out: (g: THREE.BufferGeometry) => void) => {
    const st = f.stations(xa, xb, cols);
    out(grid(cols, 26, (i, j) => f.deck(st[i], lerp(s0, s1, j / 26), lift)));
  };

  const xTip = f.half, xCowl = f.X(s.cowl), xWs = f.X(s.wsTop), xRoof = f.X(s.roofEnd), xBase = f.X(s.rearBase);
  const [d0, d1, d2] = s.doors.map(f.X);
  const xFrontCut = f.xs[0] + s.arch * 1.03, xRearCut = f.xs[1] - s.arch * 1.03;
  const xTail = f.X(s.tail), xHood = f.X(tipo === 'pickup' ? .028 : .04);
  const SK = .13, BL = .46, gt = .0035;

  // Casco interior oscuro: es lo que se ve por las juntas y dentro de los arcos.
  for (const sd of [1, -1]) {
    const st = f.stations(-xTip, xTip, 120);
    plain(grid(120, 10, (i, j) => f.shell(st[i], j / 10, sd, -.014)), mats.inner);
    plain(grid(120, 4, (i, j) => f.green(st[i], j / 4, sd, -.01)), mats.inner);
  }
  {
    const st = f.stations(-xTip, xTip, 90);
    plain(grid(90, 16, (i, j) => f.deck(st[i], lerp(-1, 1, j / 16), -.012)), mats.inner);
    plain(grid(90, 6, (i, j) => [st[i] * .93, f.sill(st[i]) + .01, lerp(-1, 1, j / 6) * f.hw(st[i]) * .9]), mats.inner);
  }

  const W2 = s.W / 2;
  for (const sd of [1, -1]) {
    const L = sd > 0 ? 'der' : 'izq';
    lado('parachoque_del', xFrontCut + G, xTip, 0, 1, sd);
    lado(`tapabarro_del_${L}` as PiezaId, d0 + G, xFrontCut - G, SK, 1 - gt, sd);
    lado(`puerta_del_${L}` as PiezaId, d1 + G, d0 - G, SK + gt, 1 - gt, sd);
    lado(`puerta_tras_${L}` as PiezaId, d2 + G, d1 - G, SK + gt, 1 - gt, sd);
    lado(`costado_tras_${L}` as PiezaId, xRearCut, d2 - G, SK, 1 - gt, sd);
    lado(`costado_tras_${L}` as PiezaId, xTail + G, xRearCut, BL + gt, 1 - gt, sd);
    lado('maletera', -xTip, xTail - G, BL + gt, 1 - gt, sd);
    lado('parachoque_tras', -xTip, xRearCut - G, 0, BL - gt, sd);
    lado(null, xRearCut, xFrontCut, 0, SK - gt, sd, mats.trim);

    // Marcos de puerta y pilares sobre la línea de cintura.
    const verde = (id: PiezaId, a: number, b: number) => {
      const st = f.stations(a, b, Math.max(8, Math.ceil((b - a) * 24)));
      add(grid(st.length - 1, 8, (i, j) => f.green(st[i], j / 8, sd)), id);
    };
    verde(`puerta_del_${L}` as PiezaId, d1 + G, xCowl);
    verde(`puerta_tras_${L}` as PiezaId, d2 + G, d1 - G);
    verde(`costado_tras_${L}` as PiezaId, xBase, d2 - G);

    // Vidrios laterales.
    const vidrio = (a: number, b: number) => {
      const st = f.stations(a, b, 22);
      plain(grid(22, 6, (i, j) => f.green(st[i], lerp(.1, .9, j / 6), sd, .0035)), mats.glass);
    };
    vidrio(d1 + .035, f.X(s.cowl + (s.wsTop - s.cowl) * .34));
    if (tipo === 'hatchback' || tipo === 'suv') { vidrio(d2 + .03, d1 - .035); vidrio(f.X(s.winEnd), d2 - .03); }
    else vidrio(tipo === 'pickup' ? d2 + .05 : f.X(s.winEnd), d1 - .035);

    // Manillas.
    for (const xh of [d0 - .16, d1 - .16]) {
      const p = f.shell(xh, .8, sd, .006);
      const h = new THREE.Mesh(new THREE.CapsuleGeometry(.011, .13, 4, 10), mats.chrome);
      h.position.set(...p); h.rotation.z = Math.PI / 2; group.add(h);
    }

    // Espejo.
    const xm = d0 - .1, zm = f.hw(xm) * f.shape(1, xm);
    const esp = new THREE.SphereGeometry(1, 28, 18);
    esp.scale(.075, .058, .105);
    esp.translate(xm, f.belt(xm) + .1, sd * (zm + .135));
    add(esp, `espejo_${L}` as PiezaId);
    const brazo = new THREE.BoxGeometry(.05, .022, .13);
    brazo.translate(xm, f.belt(xm) + .06, sd * (zm + .05));
    plain(brazo, mats.trim);

    const parche = (front: boolean, za: number, zb: number, ta: number, tb: number, lift: number, mat: THREE.Material, nu = 16, nv = 5) =>
      plain(grid(nu, nv, (i, j) => f.fascia(front, sd * lerp(za, zb, i / nu), lerp(ta, tb, j / nv), lift)), mat);
    parche(true, f.zAt(true, .985), f.zAt(true, .885), .7, .95, .004, mats.housing, 28);
    parche(true, f.zAt(true, .975), f.zAt(true, .9), .76, .9, .007, mats.lens, 28);
    if (tipo === 'pickup') {
      parche(false, f.zAt(false, .99), f.zAt(false, .93), .42, .93, .006, mats.tail, 10, 12);
    } else {
      parche(false, f.zAt(false, .997), f.zAt(false, .91), .68, .92, .005, mats.tail, 28);
    }
  }

  // Frontal y zaga.
  const centro = (front: boolean, w: number, ta: number, tb: number, lift: number, mat: THREE.Material, n = 24) =>
    plain(grid(n, 6, (i, j) => f.fascia(front, lerp(-w, w, i / n), lerp(ta, tb, j / 6), lift)), mat);
  const gW = f.zAt(true, .985) / W2 - .035;
  centro(true, W2 * gW, tipo === 'pickup' ? .5 : .56, tipo === 'pickup' ? .93 : .82, .005, mats.grille);
  if (tipo === 'pickup' || tipo === 'suv') {
    for (const tb of [.62, .74, .86]) if (tb < .85 || tipo === 'pickup') centro(true, W2 * gW, tb, tb + .018, .009, mats.chrome);
  } else centro(true, W2 * gW, .8, .82, .009, mats.chrome);
  centro(true, W2 * .62, .12, .3, .004, mats.grille);
  centro(true, .25, .38, .47, .006, mats.plate, 8);
  centro(false, .25, .52, .62, .006, mats.plate, 8);
  centro(false, W2 * .7, .08, .2, .004, mats.trim);
  if (tipo !== 'pickup') centro(false, f.zAt(false, .997) - .012, .78, .8, .006, mats.chrome);

  // Cubierta superior.
  const deckId = (id: PiezaId, a: number, b: number, cols: number) => deck(a, b, -1, 1, 0, cols, g => add(g, id));
  deckId('parachoque_del', xHood + G, xTip, 24);
  deckId('capot', xCowl + G, xHood - G, 34);
  deckId('techo', xBase + G, xCowl - G, 60);
  if (s.bed) {
    const b0 = f.X(s.bed[0]), b1 = f.X(s.bed[1]);
    deckId('maletera', -xTip, b1 - G, 10);
    deckId('maletera', b0 + .002, xBase - G, 6);
    deck(b1, b0, -1, -.93, 0, 30, g => add(g, 'maletera'));
    deck(b1, b0, .93, 1, 0, 30, g => add(g, 'maletera'));
    const drop = .52, n = 40;
    const st = f.stations(b1, b0, n);
    plain(grid(n, 24, (i, j) => {
      const sv = lerp(-.93, .93, j / 24), p = f.deck(st[i], sv, .002);
      const k = smooth(0, .05, i / n) * smooth(1, .95, i / n) * smooth(.93, .88, Math.abs(sv));
      return [p[0], p[1] - drop * k, p[2]];
    }), mats.trim);
  } else {
    deckId('maletera', -xTip, xBase - G, 30);
  }
  deck(xWs - .002, xCowl - .02, -.9, .9, .004, 26, g => plain(g, mats.glass));
  deck(xBase + .03, xRoof + .01, -.88, .88, .004, 22, g => plain(g, mats.glass));

  // Ruedas.
  const r = s.wheelR, tw = tipo === 'pickup' ? .29 : .235;
  const rueda = (x: number, sd: number) => {
    const w = new THREE.Group();
    const perfil = [[r * .62, -tw / 2], [r * .9, -tw / 2], [r * .985, -tw / 2 + .02], [r, -tw / 2 + .05], [r, tw / 2 - .05], [r * .985, tw / 2 - .02], [r * .9, tw / 2], [r * .62, tw / 2]]
      .map(([a, b]) => new THREE.Vector2(a, b));
    w.add(new THREE.Mesh(new THREE.LatheGeometry(perfil, 48), mats.tire));
    w.add(new THREE.Mesh(new THREE.CylinderGeometry(r * .66, r * .66, tw * .92, 40, 1, true), mats.disc));
    const fondo = new THREE.Mesh(new THREE.CircleGeometry(r * .66, 40), mats.inner);
    fondo.rotation.x = -Math.PI / 2; fondo.position.y = tw * .12; w.add(fondo);
    const disco = new THREE.Mesh(new THREE.CylinderGeometry(r * .46, r * .46, .02, 40), mats.disc);
    disco.position.y = tw * .17; w.add(disco);
    const aro = new THREE.Mesh(new THREE.TorusGeometry(r * .655, r * .028, 12, 56), mats.rim);
    aro.rotation.x = Math.PI / 2; aro.position.y = tw * .44; w.add(aro);
    const buje = new THREE.Mesh(new THREE.CylinderGeometry(r * .15, r * .17, .05, 24), mats.rim);
    buje.position.y = tw * .4; w.add(buje);
    for (let i = 0; i < 10; i++) {
      const g = new THREE.BoxGeometry(r * .5, .024, r * .075);
      g.translate(r * .39, 0, 0);
      const m = new THREE.Mesh(g, mats.rim);
      m.rotation.y = (i / 10) * Math.PI * 2; m.position.y = tw * .4; w.add(m);
    }
    w.rotation.x = sd > 0 ? Math.PI / 2 : -Math.PI / 2;
    w.position.set(x, f.yc, sd * (s.W / 2 - tw / 2 - .03));
    group.add(w);
  };
  for (const x of f.xs) for (const sd of [1, -1]) rueda(x, sd);

  return {
    group, piezas, pickables, largo: s.L, alto: Math.max(...s.top.map(p => p[1])),
    dispose() {
      group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      Object.values(mats).forEach(m => m.dispose());
      piezas.forEach(p => p.mat.dispose());
    },
  };
}
