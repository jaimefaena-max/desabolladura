/**
 * Aliviana el modelo 3D que entrega TRELLIS (≈12 MB, ≈300 mil triángulos) para que cargue en un celular:
 * simplifica la malla, reduce las texturas a WebP y escribe un GLB liviano (≈1,5 MB).
 *
 * Uso: node scripts/optimizar-glb.ts <entrada.glb> <salida.glb> [triangulos=120000] [textura=2048]
 *
 * Solo usa lo que el proyecto ya trae: el simplificador de meshoptimizer incluido en three.js y ffmpeg.
 * Pensado para la salida de TRELLIS: una malla con POSITION, NORMAL, TEXCOORD_0 y un material PBR.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';

const [entrada, salida, objetivoTxt, ladoTxt] = process.argv.slice(2);
if (!entrada || !salida) { console.error('Uso: node scripts/optimizar-glb.ts <entrada.glb> <salida.glb> [triangulos]'); process.exit(1); }
const OBJETIVO = Number(objetivoTxt ?? 120000);
const LADO = Number(ladoTxt ?? 2048);

interface Acc { bufferView: number; byteOffset?: number; componentType: number; normalized?: boolean; count: number; type: string; min?: number[]; max?: number[] }
interface Gltf {
  accessors: Acc[]; bufferViews: { buffer: number; byteOffset?: number; byteLength: number }[];
  meshes: { primitives: { attributes: Record<string, number>; indices: number; material?: number }[] }[];
  images?: { bufferView: number; mimeType: string }[]; materials?: unknown[]; textures?: unknown[];
  samplers?: unknown[]; nodes: unknown[]; scenes: unknown[]; scene?: number; extensionsUsed?: string[]; extensionsRequired?: string[];
}

// --- Lectura del GLB ---
const glb = readFileSync(entrada);
if (glb.toString('utf8', 0, 4) !== 'glTF') throw new Error('No es un GLB');
const largoJson = glb.readUInt32LE(12);
const g = JSON.parse(glb.toString('utf8', 20, 20 + largoJson)) as Gltf;
const bin = glb.subarray(20 + largoJson + 8);
const vista = (i: number) => { const v = g.bufferViews[i]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };
const leer = (i: number) => {
  const a = g.accessors[i], b = vista(a.bufferView), off = a.byteOffset ?? 0;
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]!;
  const buf = b.buffer.slice(b.byteOffset + off, b.byteOffset + off + a.count * comps * (a.componentType === 5126 || a.componentType === 5125 ? 4 : 2));
  if (a.componentType === 5126) return new Float32Array(buf);
  if (a.componentType === 5125) return new Uint32Array(buf);
  if (a.componentType === 5123) return Uint32Array.from(new Uint16Array(buf));
  throw new Error(`Tipo de componente no soportado: ${a.componentType}`);
};

const prim = g.meshes[0].primitives[0];
const pos = leer(prim.attributes.POSITION) as Float32Array;
const nor = prim.attributes.NORMAL !== undefined ? (leer(prim.attributes.NORMAL) as Float32Array) : null;
const uv = prim.attributes.TEXCOORD_0 !== undefined ? (leer(prim.attributes.TEXCOORD_0) as Float32Array) : null;
const idx = leer(prim.indices) as Uint32Array;

// --- Simplificación ---
await MeshoptSimplifier.ready;
const meta = Math.min(idx.length, OBJETIVO * 3);
const [simple, error] = MeshoptSimplifier.simplify(idx, pos, 3, meta - (meta % 3), 0.01, []);

// Se conservan solo los vértices usados, en el orden en que aparecen.
const mapa = new Map<number, number>();
const nuevos = new Uint32Array(simple.length);
simple.forEach((v, i) => { if (!mapa.has(v)) mapa.set(v, mapa.size); nuevos[i] = mapa.get(v)!; });
const n = mapa.size;
const copiar = (src: Float32Array, k: number) => { const out = new Float32Array(n * k); mapa.forEach((d, o) => out.set(src.subarray(o * k, o * k + k), d * k)); return out; };
const pos2 = copiar(pos, 3), nor2 = nor && copiar(nor, 3), uv2 = uv && copiar(uv, 2);
const idx2 = n < 65536 ? Uint16Array.from(nuevos) : nuevos;

// --- Texturas: WebP más chicas con ffmpeg ---
const tmp = mkdtempSync(join(tmpdir(), 'glb-'));
const imagenes = (g.images ?? []).map((im, i) => {
  const ent = join(tmp, `t${i}.bin`), sal = join(tmp, `t${i}.webp`);
  writeFileSync(ent, vista(im.bufferView));
  const lado = i === 0 ? LADO : 512; // color base nítido; metal/rugosidad no necesita tanto
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', ent, '-vf', `scale='min(${lado},iw)':-2`, '-c:v', 'libwebp', '-quality', '82', sal]);
  return readFileSync(sal);
});
rmSync(tmp, { recursive: true, force: true });

// --- Escritura del GLB nuevo ---
const trozos: Buffer[] = [];
let cursor = 0;
const vistas: { buffer: number; byteOffset: number; byteLength: number; target?: number }[] = [];
const agregar = (datos: Buffer, target?: number) => {
  const relleno = (4 - (cursor % 4)) % 4;
  if (relleno) { trozos.push(Buffer.alloc(relleno)); cursor += relleno; }
  vistas.push({ buffer: 0, byteOffset: cursor, byteLength: datos.length, ...(target ? { target } : {}) });
  trozos.push(datos); cursor += datos.length;
  return vistas.length - 1;
};
const comoBuffer = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const accesores: Acc[] = [];
const accesor = (a: Float32Array | Uint16Array | Uint32Array, type: string, target?: number, minmax = false) => {
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type]!;
  const acc: Acc = { bufferView: agregar(comoBuffer(a), target), componentType: a instanceof Float32Array ? 5126 : a instanceof Uint16Array ? 5123 : 5125, count: a.length / comps, type };
  if (minmax) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], a[i + k]); mx[k] = Math.max(mx[k], a[i + k]); }
    acc.min = mn; acc.max = mx;
  }
  accesores.push(acc);
  return accesores.length - 1;
};
// Cuantización (KHR_mesh_quantization): posiciones en 16 bits, normales en 8 y UV en 16.
// Baja el peso de cada vértice de 32 a 16 bytes sin diferencia visible.
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < pos2.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos2[i + k]); mx[k] = Math.max(mx[k], pos2[i + k]); }
const centro = mn.map((v, k) => (v + mx[k]) / 2), escala = mn.map((v, k) => Math.max((mx[k] - v) / 2, 1e-6));
const posQ = new Int16Array(n * 4); // stride de 8 bytes: alineación a 4
for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) posQ[i * 4 + k] = Math.round(((pos2[i * 3 + k] - centro[k]) / escala[k]) * 32767);
const vistaConPaso = (a: ArrayBufferView, paso: number) => { const i = agregar(comoBuffer(a), 34962); (vistas[i] as { byteStride?: number }).byteStride = paso; return i; };
// min y max van en los valores enteros guardados (lo exige glTF para accesores normalizados).
const qMin = [32767, 32767, 32767], qMax = [-32767, -32767, -32767];
for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { qMin[k] = Math.min(qMin[k], posQ[i * 4 + k]); qMax[k] = Math.max(qMax[k], posQ[i * 4 + k]); }
accesores.push({ bufferView: vistaConPaso(posQ, 8), componentType: 5122, normalized: true, count: n, type: 'VEC3', min: qMin, max: qMax } as Acc);
const atributos: Record<string, number> = { POSITION: accesores.length - 1 };
if (nor2) {
  const q = new Int8Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) q[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, nor2[i * 3 + k])) * 127);
  accesores.push({ bufferView: vistaConPaso(q, 4), componentType: 5120, normalized: true, count: n, type: 'VEC3' } as Acc);
  atributos.NORMAL = accesores.length - 1;
}
if (uv2) {
  const dentro = uv2.every(v => v >= 0 && v <= 1);
  if (dentro) {
    const q = Uint16Array.from(uv2, v => Math.round(v * 65535));
    accesores.push({ bufferView: vistaConPaso(q, 4), componentType: 5123, normalized: true, count: n, type: 'VEC2' } as Acc);
    atributos.TEXCOORD_0 = accesores.length - 1;
  } else atributos.TEXCOORD_0 = accesor(uv2, 'VEC2', 34962);
}
const indices = accesor(idx2, 'SCALAR', 34963);
const imgs = imagenes.map(b => ({ bufferView: agregar(b), mimeType: 'image/webp' }));

const nuevo = {
  asset: { version: '2.0', generator: 'desabolladura/optimizar-glb' },
  scene: g.scene ?? 0, scenes: g.scenes,
  nodes: (g.nodes as Record<string, unknown>[]).map(nd => (nd.mesh === 0 ? { ...nd, translation: centro, scale: escala } : nd)),
  meshes: [{ primitives: [{ attributes: atributos, indices, material: prim.material ?? 0 }] }],
  materials: g.materials, textures: g.textures, samplers: g.samplers, images: imgs,
  accessors: accesores, bufferViews: vistas, buffers: [{ byteLength: cursor }],
  extensionsUsed: [...new Set([...(g.extensionsUsed ?? []), 'KHR_mesh_quantization'])],
  extensionsRequired: [...new Set([...(g.extensionsRequired ?? []), 'KHR_mesh_quantization'])],
};
const json = Buffer.from(JSON.stringify(nuevo));
const jsonPad = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const binDatos = Buffer.concat(trozos);
const binPad = Buffer.concat([binDatos, Buffer.alloc((4 - (binDatos.length % 4)) % 4)]);
const cab = Buffer.alloc(12);
cab.write('glTF', 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + jsonPad.length + 8 + binPad.length, 8);
const chunk = (tipo: number, datos: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32LE(datos.length, 0); h.writeUInt32LE(tipo, 4); return Buffer.concat([h, datos]); };
writeFileSync(salida, Buffer.concat([cab, chunk(0x4e4f534a, jsonPad), chunk(0x004e4942, binPad)]));

const mb = (b: number) => `${(b / 1e6).toFixed(2)} MB`;
console.log(`Triángulos: ${idx.length / 3} → ${simple.length / 3} (error relativo ${error.toFixed(4)})`);
console.log(`Vértices: ${pos.length / 3} → ${n}`);
console.log(`Texturas: ${imagenes.map(b => `${(b.length / 1024).toFixed(0)} kB`).join(', ')}`);
console.log(`Tamaño: ${mb(glb.length)} → ${mb(statSize(salida))}`);
function statSize(f: string) { return readFileSync(f).length; }
