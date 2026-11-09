/**
 * Convierte el auto de la portada (OBJ de varios materiales, ≈700 mil triángulos) en un GLB liviano:
 * - quita logos e insignias de marca (piezas con nombre de logo o texto),
 * - agrupa por tipo de material (pintura, cromo, vidrio, neumático…) con materiales PBR propios,
 * - suelda vértices, simplifica cada grupo y cuantiza (KHR_mesh_quantization).
 *
 * Uso: node scripts/obj-a-glb-portada.ts <entrada.obj> <salida.glb> [proporcion=0.25] [franjas.png]
 *   franjas.png: textura de franjas (blanco = pintura, negro = franja) para la carrocería, por sus UV.
 * Solo usa lo que el proyecto ya trae (three.js y su simplificador meshoptimizer).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';

const [entrada, salida, proporcionTxt, franjas] = process.argv.slice(2);
if (!entrada || !salida) { console.error('Uso: node scripts/obj-a-glb-portada.ts <entrada.obj> <salida.glb> [proporcion]'); process.exit(1); }
const PROPORCION = Number(proporcionTxt ?? .25);

/** Piezas que son marca registrada: no van en la portada. */
const LOGOS = /logo|text|keyhole/i;

interface Mat { nombre: string; color: [number, number, number]; metal: number; rugoso: number; emisivo?: [number, number, number] }
/** Material de destino por material de origen. La pintura se reemplaza en la app por una con barniz. */
const GRUPOS: Record<string, Mat> = {
  pintura: { nombre: 'pintura', color: [.16, .17, .19], metal: .55, rugoso: .32 },
  pintura2: { nombre: 'pintura2', color: [.16, .17, .19], metal: .55, rugoso: .32 },
  cromo: { nombre: 'cromo', color: [.92, .93, .95], metal: 1, rugoso: .12 },
  negro: { nombre: 'negro', color: [.02, .02, .025], metal: .1, rugoso: .55 },
  vidrio: { nombre: 'vidrio', color: [.015, .02, .025], metal: .9, rugoso: .04 },
  neumatico: { nombre: 'neumatico', color: [.018, .018, .02], metal: 0, rugoso: .88 },
  llanta: { nombre: 'llanta', color: [.55, .56, .58], metal: 1, rugoso: .22 },
  llanta_oscura: { nombre: 'llanta_oscura', color: [.07, .07, .08], metal: .9, rugoso: .3 },
  freno: { nombre: 'freno', color: [.55, .04, .05], metal: .2, rugoso: .45 },
  faro: { nombre: 'faro', color: [.9, .92, .95], metal: .3, rugoso: .08, emisivo: [.9, .93, 1] },
  faro_vidrio: { nombre: 'faro_vidrio', color: [.8, .84, .88], metal: .6, rugoso: .05 },
  trasero: { nombre: 'trasero', color: [.5, .02, .03], metal: .2, rugoso: .2, emisivo: [.6, .02, .03] },
  senal: { nombre: 'senal', color: [.9, .5, .08], metal: .2, rugoso: .2, emisivo: [.5, .25, .02] },
};
/** Proporción de triángulos que se conserva por grupo (con proporción global 0.25). */
const PROPORCIONES: Record<string, number> = {
  pintura: 4, pintura2: 4, vidrio: 4, faro: .3, faro_vidrio: 1, trasero: .8, senal: 4, freno: .25,
  cromo: .35, negro: .3, neumatico: .2, llanta: .15, llanta_oscura: .15,
};
const DESTINO: Record<string, string> = {
  // Paintjob1 es la carrocería con UV de franjas; PaintJob2 (espejos, pasos de rueda) va lisa.
  M_Paintjob1: 'pintura', M_PaintJob2: 'pintura2',
  M_ChromeTrim: 'cromo', M_ChromeTrim2: 'cromo', M_Mirror1: 'cromo', M_Exhaust: 'cromo',
  M_BlackTrim: 'negro', M_BlackTrimTextured: 'negro', M_dark: 'negro', M_GrillTrim: 'negro', M_GrillTrim2: 'negro', M_GrillTrim3: 'negro',
  M_Glass1: 'vidrio', M_WindShield: 'vidrio',
  M_Tire1: 'neumatico', M_Rim1: 'llanta', M_Rim2: 'llanta_oscura', M_BrakePad1: 'freno', M_BrakePad2: 'llanta_oscura',
  M_HeadLight1: 'faro', M_HeadLight2: 'faro_vidrio', M_Tailight1: 'trasero', M_Tailight2: 'trasero', M_TurnSignalLight1: 'senal',
};

// --- Lectura y agrupación ---
const raiz = new OBJLoader().parse(readFileSync(entrada, 'utf8'));
/** Grupo que conserva las UV (para las franjas). */
const CON_UV = new Set(['pintura']);
const partes = new Map<string, { pos: Float32Array; uv?: Float32Array }[]>();
let quitados = 0, triOriginales = 0;
raiz.traverse(o => {
  if (!(o instanceof THREE.Mesh)) return;
  if (LOGOS.test(o.name)) { quitados++; return; }
  const g = o.geometry as THREE.BufferGeometry, pos = g.getAttribute('position').array as Float32Array;
  const uv = g.getAttribute('uv')?.array as Float32Array | undefined;
  const mats = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.Material[];
  const grupos = g.groups.length ? g.groups : [{ start: 0, count: pos.length / 3, materialIndex: 0 }];
  for (const gr of grupos) {
    const destino = DESTINO[mats[gr.materialIndex ?? 0]?.name] ?? 'negro';
    const trozo = { pos: pos.slice(gr.start * 3, (gr.start + gr.count) * 3), uv: CON_UV.has(destino) && uv ? uv.slice(gr.start * 2, (gr.start + gr.count) * 2) : undefined };
    triOriginales += gr.count / 3;
    partes.set(destino, [...(partes.get(destino) ?? []), trozo]);
  }
});

await MeshoptSimplifier.ready;
interface Malla { nombre: string; pos: Float32Array; nor: Float32Array; uv?: Float32Array; idx: Uint32Array }
const mallas: Malla[] = [];
let triFinales = 0;
for (const [nombre, trozos] of partes) {
  const total = trozos.reduce((a, t) => a + t.pos.length, 0), pos = new Float32Array(total);
  const conUv = trozos.every(t => t.uv), uvs = conUv ? new Float32Array((total / 3) * 2) : null;
  let k = 0;
  for (const t of trozos) { pos.set(t.pos, k); if (uvs) uvs.set(t.uv!, (k / 3) * 2); k += t.pos.length; }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (uvs) g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  // Suelda vértices iguales; con UV, las costuras de la textura se mantienen separadas.
  g = mergeVertices(g, 1e-5);
  const idx = new Uint32Array(g.getIndex()!.array);
  const p = g.getAttribute('position').array as Float32Array;
  const u = g.getAttribute('uv')?.array as Float32Array | undefined;
  // Cuánto se conserva de cada grupo: la carrocería entera (es lo que se ve y donde corren los
  // reflejos); las ruedas, que son muchas piezas chicas, se aligeran fuerte.
  const prop = Math.min(1, (PROPORCIONES[nombre] ?? 1) * PROPORCION / .25);
  let simple = idx;
  if (prop < 1) [simple] = MeshoptSimplifier.simplify(idx, p, 3, Math.max(3, Math.floor((idx.length * prop) / 3) * 3), .004, ['LockBorder']);
  // Se conservan solo los vértices usados.
  const mapa = new Map<number, number>(), nuevos = new Uint32Array(simple.length);
  simple.forEach((v, i) => { if (!mapa.has(v)) mapa.set(v, mapa.size); nuevos[i] = mapa.get(v)!; });
  const compacto = new Float32Array(mapa.size * 3);
  mapa.forEach((d, o) => compacto.set(p.subarray(o * 3, o * 3 + 3), d * 3));
  // glTF cuenta la V desde arriba; OBJ desde abajo.
  const uvC = u ? new Float32Array(mapa.size * 2) : undefined;
  if (u && uvC) mapa.forEach((d, o) => { uvC[d * 2] = u[o * 2]; uvC[d * 2 + 1] = 1 - u[o * 2 + 1]; });
  // Normales suaves: la malla está soldada, así la luz corre continua sobre la carrocería.
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(compacto, 3));
  out.setIndex(new THREE.BufferAttribute(nuevos, 1));
  out.computeVertexNormals();
  mallas.push({ nombre, pos: compacto, nor: out.getAttribute('normal').array as Float32Array, uv: uvC, idx: nuevos });
  triFinales += out.getIndex()!.count / 3;
}

// --- Escritura GLB con cuantización ---
const trozos: Buffer[] = [];
let cursor = 0;
const vistas: Record<string, number>[] = [], accesores: Record<string, unknown>[] = [];
const agregar = (b: ArrayBufferView, target?: number, paso?: number) => {
  const datos = Buffer.from(b.buffer, b.byteOffset, b.byteLength);
  const relleno = (4 - (cursor % 4)) % 4;
  if (relleno) { trozos.push(Buffer.alloc(relleno)); cursor += relleno; }
  vistas.push({ buffer: 0, byteOffset: cursor, byteLength: datos.length, ...(target ? { target } : {}), ...(paso ? { byteStride: paso } : {}) });
  trozos.push(datos); cursor += datos.length;
  return vistas.length - 1;
};
const nodos: Record<string, unknown>[] = [], mallasGltf: Record<string, unknown>[] = [], materiales: Record<string, unknown>[] = [];
for (const m of mallas) {
  const n = m.pos.length / 3;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.pos[i + k]); mx[k] = Math.max(mx[k], m.pos[i + k]); }
  const centro = mn.map((v, k) => (v + mx[k]) / 2), escala = mn.map((v, k) => Math.max((mx[k] - v) / 2, 1e-6));
  const pq = new Int16Array(n * 4), qmin = [32767, 32767, 32767], qmax = [-32767, -32767, -32767];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    const q = Math.round(((m.pos[i * 3 + k] - centro[k]) / escala[k]) * 32767);
    pq[i * 4 + k] = q; qmin[k] = Math.min(qmin[k], q); qmax[k] = Math.max(qmax[k], q);
  }
  const nq = new Int8Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) nq[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, m.nor[i * 3 + k])) * 127);
  accesores.push({ bufferView: agregar(pq, 34962, 8), componentType: 5122, normalized: true, count: n, type: 'VEC3', min: qmin, max: qmax });
  const aPos = accesores.length - 1;
  accesores.push({ bufferView: agregar(nq, 34962, 4), componentType: 5120, normalized: true, count: n, type: 'VEC3' });
  const aNor = accesores.length - 1;
  let aUv: number | undefined;
  if (m.uv) { accesores.push({ bufferView: agregar(m.uv, 34962), componentType: 5126, count: n, type: 'VEC2' }); aUv = accesores.length - 1; }
  const ix = n < 65536 ? Uint16Array.from(m.idx) : m.idx;
  accesores.push({ bufferView: agregar(ix, 34963), componentType: ix instanceof Uint16Array ? 5123 : 5125, count: ix.length, type: 'SCALAR' });
  const aIdx = accesores.length - 1;
  const g = GRUPOS[m.nombre];
  materiales.push({
    name: g.nombre,
    pbrMetallicRoughness: { baseColorFactor: [...g.color, 1], metallicFactor: g.metal, roughnessFactor: g.rugoso, ...(m.uv && franjas ? { baseColorTexture: { index: 0 } } : {}) },
    ...(g.emisivo ? { emissiveFactor: g.emisivo } : {}),
  });
  mallasGltf.push({ name: m.nombre, primitives: [{ attributes: { POSITION: aPos, NORMAL: aNor, ...(aUv !== undefined ? { TEXCOORD_0: aUv } : {}) }, indices: aIdx, material: materiales.length - 1 }] });
  nodos.push({ name: m.nombre, mesh: mallasGltf.length - 1, translation: centro, scale: escala });
}
// Textura de franjas embebida (PNG en escala de grises, 2048 px).
const imagen = franjas ? { images: [{ bufferView: agregar(readFileSync(franjas)), mimeType: 'image/png' }], textures: [{ source: 0, sampler: 0 }], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }] } : {};
const gltf = {
  asset: { version: '2.0', generator: 'desabolladura/obj-a-glb-portada' }, ...imagen,
  scene: 0, scenes: [{ nodes: nodos.map((_, i) => i) }], nodes: nodos, meshes: mallasGltf, materials: materiales,
  accessors: accesores, bufferViews: vistas, buffers: [{ byteLength: cursor }],
  extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'],
};
const json = Buffer.from(JSON.stringify(gltf));
const jp = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const bin = Buffer.concat(trozos), bp = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const cab = Buffer.alloc(12); cab.write('glTF', 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + jp.length + 8 + bp.length, 8);
const chunk = (t: number, d: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32LE(d.length, 0); h.writeUInt32LE(t, 4); return Buffer.concat([h, d]); };
const archivo = Buffer.concat([cab, chunk(0x4e4f534a, jp), chunk(0x004e4942, bp)]);
writeFileSync(salida, archivo);
console.log(`Logos quitados: ${quitados} piezas`);
console.log(`Triángulos: ${Math.round(triOriginales)} → ${triFinales}`);
console.log(`Grupos: ${mallas.map(m => `${m.nombre} ${m.idx.length / 3}`).join(', ')}`);
console.log(`Tamaño: ${(archivo.length / 1e6).toFixed(2)} MB`);
