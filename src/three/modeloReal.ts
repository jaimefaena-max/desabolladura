import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Carroceria, Medidas, Modelo3D, PiezaId } from '../lib/types';

/**
 * Auto 3D realista creado con IA a partir de la foto del modelo (TRELLIS). Es una sola malla:
 * no trae las piezas separadas. Las piezas se marcan por ZONAS: cajas en coordenadas del auto
 * que un shader tiñe según el estado (por reparar, en trabajo) y que el dedo selecciona.
 *
 * Convención (igual que el modelo paramétrico): el frente mira a +x, el lado derecho a +z, el piso en y = 0.
 */

/** Tramo de una zona: t = 0 frente → 1 cola; h = 0 piso → 1 techo; z = −1 lado izquierdo → +1 derecho (fracción del medio ancho). */
interface Zona { id: PiezaId; t: [number, number]; h: [number, number]; z: [number, number] }

const lados = (id: (l: 'der' | 'izq') => PiezaId, t: [number, number], h: [number, number], z: [number, number]): Zona[] => [
  { id: id('der'), t, h, z },
  { id: id('izq'), t, h, z: [-z[1], -z[0]] },
];

/** Proporciones por carrocería. El orden es la prioridad: la primera zona que contiene el punto gana. */
function zonasDe(tipo: Carroceria): Zona[] {
  const cintura = tipo === 'pickup' ? .6 : tipo === 'suv' ? .6 : .64;
  const comunes: Zona[] = [
    ...lados(l => `espejo_${l}`, [.26, .38], [.56, .8], [.7, 1.4]),
    { id: 'parachoque_del', t: [-.05, .085], h: [0, .38], z: [-1.4, 1.4] },
    { id: 'parachoque_tras', t: [.925, 1.05], h: [0, .46], z: [-1.4, 1.4] },
  ];
  if (tipo === 'pickup') {
    return [
      ...comunes,
      { id: 'capot', t: [0, .3], h: [.5, .82], z: [-.8, .8] },
      { id: 'maletera', t: [.6, 1.05], h: [.4, .8], z: [-1.4, 1.4] },
      { id: 'techo', t: [.32, .6], h: [.86, 1.05], z: [-.8, .8] },
      ...lados(l => `tapabarro_del_${l}`, [.03, .27], [.08, cintura], [.3, 1.4]),
      ...lados(l => `puerta_del_${l}`, [.27, .44], [.08, cintura], [.3, 1.4]),
      ...lados(l => `puerta_tras_${l}`, [.44, .6], [.08, cintura], [.3, 1.4]),
      ...lados(l => `costado_tras_${l}`, [.6, .93], [.08, .4], [.3, 1.4]),
    ];
  }
  const portón = tipo === 'sedan' ? { t: [.8, 1.05] as [number, number], h: [.5, .85] as [number, number] } : { t: [.88, 1.05] as [number, number], h: [.32, .95] as [number, number] };
  return [
    ...comunes,
    { id: 'capot', t: [.045, .3], h: [.47, .68], z: [-.8, .8] },
    { id: 'maletera', ...portón, z: [-.9, .9] },
    { id: 'techo', t: [.42, tipo === 'sedan' ? .74 : .88], h: [.9, 1.05], z: [-.78, .78] },
    ...lados(l => `tapabarro_del_${l}`, [.03, .27], [.08, cintura], [.3, 1.4]),
    ...lados(l => `puerta_del_${l}`, [.27, .5], [.08, cintura], [.3, 1.4]),
    ...lados(l => `puerta_tras_${l}`, [.5, .7], [.08, cintura], [.3, 1.4]),
    ...lados(l => `costado_tras_${l}`, [.7, .93], [.08, cintura + .06], [.3, 1.4]),
  ];
}

export interface ZonaViva { id: PiezaId; min: THREE.Vector3; max: THREE.Vector3; col: THREE.Color; mix: { value: number }; brillo: { value: number } }

export interface AutoReal {
  group: THREE.Group;
  largo: number; alto: number;
  zonas: ZonaViva[];
  /** Pieza bajo un punto de la superficie (en coordenadas del auto). */
  piezaEn(p: THREE.Vector3): PiezaId | undefined;
  dispose(): void;
}

const NZ = 15;
const GLSL_ZONAS = /* glsl */ `
#define NZ ${NZ}
uniform vec3 uZMin[NZ];
uniform vec3 uZMax[NZ];
uniform vec3 uZCol[NZ];
uniform float uZMix[NZ];
uniform float uZBrillo[NZ];
uniform vec4 uRuedas; // x eje delantero, x eje trasero, radio, |z| desde donde hay rueda
uniform vec3 uPintIA;    // color de carrocería que la IA puso en la textura
uniform vec3 uPintGan;   // ganancia por canal que lo lleva al color real del auto
uniform float uPintOn;
varying vec3 vPosAuto;
// Devuelve la zona que contiene p y, en "borde", cuánto la cubre (se desvanece en los últimos 2,5 cm).
int zonaDe(vec3 p, out float borde) {
  borde = 0.0;
  float dR = min(length(p.xy - vec2(uRuedas.x, uRuedas.z)), length(p.xy - vec2(uRuedas.y, uRuedas.z)));
  float fueraRueda = abs(p.z) > uRuedas.w ? smoothstep(uRuedas.z * 1.02, uRuedas.z * 1.1, dR) : 1.0;
  for (int i = 0; i < NZ; i++) {
    if (all(greaterThanEqual(p, uZMin[i])) && all(lessThanEqual(p, uZMax[i]))) {
      vec3 d = min(p - uZMin[i], uZMax[i] - p);
      borde = smoothstep(0.0, 0.025, min(min(d.x, d.y), d.z)) * fueraRueda; // neumático y llanta no se pintan
      return i;
    }
  }
  return -1;
}
// La IA tiende a correr el tono (p. ej. gris azulado → morado): se repintan solo los pixeles
// del tono de la carrocería; vidrios, neumáticos, cromados y focos quedan como están.
vec3 repintar(vec3 c) {
  if (uPintOn < 0.5) return c;
  const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float rel = (mx - mn) / max(mx, 1e-4);
  vec3 d = c - dot(c, LUM), dp = uPintIA - dot(uPintIA, LUM);
  float w = smoothstep(0.55, 0.85, dot(normalize(d + 1e-6), normalize(dp))) * smoothstep(0.06, 0.16, rel);
  return mix(c, c * uPintGan, w);
}
`;

const cargador = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/**
 * Color de carrocería en la textura: el tono más frecuente entre los pixeles con color
 * (el resto son vidrios, neumáticos y sombras, casi grises). Devuelve null si la textura es gris.
 */
function pinturaDeTextura(tex: THREE.Texture | null): THREE.Color | null {
  const img = tex?.image as CanvasImageSource | undefined;
  if (!img) return null;
  const lado = 96, cv = document.createElement('canvas');
  cv.width = cv.height = lado;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  if (!cx) return null;
  cx.drawImage(img, 0, 0, lado, lado);
  const px = cx.getImageData(0, 0, lado, lado).data;
  const bins = Array.from({ length: 12 }, () => ({ n: 0, peso: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < .12 || (mx - mn) / mx < .15) continue;
    const h = new THREE.Color(r, g, b).getHSL({ h: 0, s: 0, l: 0 }).h;
    const bin = bins[Math.min(11, Math.floor(h * 12))], w = mx - mn;
    bin.n++; bin.peso += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
  }
  const top = bins.reduce((a, b) => (b.peso > a.peso ? b : a));
  if (top.n < lado * lado * .01) return null; // menos del 1 % con color: textura gris
  return new THREE.Color().setRGB(top.r / top.peso, top.g / top.peso, top.b / top.peso, THREE.SRGBColorSpace);
}

export async function cargarModeloReal(modelo: Modelo3D, tipo: Carroceria, medidas?: Medidas, colorHex?: string): Promise<AutoReal> {
  const url = /^(https?:|data:|blob:)/.test(modelo.url) ? modelo.url : `${import.meta.env.BASE_URL}${modelo.url}`;
  const gltf = await cargador.loadAsync(url);
  const interno = gltf.scene;
  interno.rotation.y = THREE.MathUtils.degToRad(modelo.giro ?? 90);

  // Al tamaño real: el largo manda (escala pareja, para no deformar lo que la IA modeló).
  const group = new THREE.Group();
  group.add(interno);
  group.updateMatrixWorld(true);
  let caja = new THREE.Box3().setFromObject(interno);
  const largo = medidas?.largo ?? 4.5;
  const k = largo / Math.max(caja.max.x - caja.min.x, 1e-6);
  interno.scale.setScalar(k);
  group.updateMatrixWorld(true);
  caja = new THREE.Box3().setFromObject(interno);
  const c = caja.getCenter(new THREE.Vector3());
  interno.position.set(-c.x, -caja.min.y, -c.z);
  group.updateMatrixWorld(true);
  caja = new THREE.Box3().setFromObject(interno);
  const alto = caja.max.y, medioAncho = (caja.max.z - caja.min.z) / 2, xF = caja.max.x;

  const zonas: ZonaViva[] = zonasDe(tipo).map(z => ({
    id: z.id,
    min: new THREE.Vector3(xF - z.t[1] * largo, z.h[0] * alto, z.z[0] * medioAncho),
    max: new THREE.Vector3(xF - z.t[0] * largo, z.h[1] * alto, z.z[1] * medioAncho),
    col: new THREE.Color(), mix: { value: 0 }, brillo: { value: 0 },
  }));

  // Ruedas: los ejes salen de la distancia entre ejes real; el radio, del alto (≈ 22 %).
  const ee = medidas?.entreEjes ?? largo * .6;
  const voladizoF = (largo - ee) * .47;
  const radio = alto * .215;
  const ruedas = new THREE.Vector4(xF - voladizoF, xF - voladizoF - ee, radio, medioAncho * .55);

  const uniforms = {
    uZMin: { value: zonas.map(z => z.min) },
    uZMax: { value: zonas.map(z => z.max) },
    uZCol: { value: zonas.map(z => z.col) },
    uZMix: { value: zonas.map(() => 0) },
    uZBrillo: { value: zonas.map(() => 0) },
    uRuedas: { value: ruedas },
    uPintIA: { value: new THREE.Color() },
    uPintGan: { value: new THREE.Vector3(1, 1, 1) },
    uPintOn: { value: 0 },
  };
  // Repintado hacia el color real del auto (el del 3D y las fotos).
  let mapa: THREE.Texture | null = null;
  interno.traverse(o => { if (!mapa && o instanceof THREE.Mesh) mapa = (o.material as THREE.MeshStandardMaterial).map; });
  const ia = pinturaDeTextura(mapa);
  if (ia && colorHex) {
    // Tono y luz por separado: el tono se corrige completo; la luz, con tope, porque la IA suele
    // hornear la pintura más oscura y aclararla de más lava los reflejos.
    const real = new THREE.Color(colorHex), lum = (c: THREE.Color) => Math.max(.2126 * c.r + .7152 * c.g + .0722 * c.b, 1e-4);
    const kLuz = THREE.MathUtils.clamp(lum(real) / lum(ia), .5, 2.5);
    const tono = (a: number, b: number) => THREE.MathUtils.clamp((a / lum(real)) / Math.max(b / lum(ia), 1e-4), .3, 3);
    uniforms.uPintIA.value.copy(ia);
    uniforms.uPintGan.value.set(tono(real.r, ia.r) * kLuz, tono(real.g, ia.g) * kLuz, tono(real.b, ia.b) * kLuz);
    uniforms.uPintOn.value = 1;
  }
  // Los valores animados se leen por referencia en cada cuadro.
  Object.defineProperty(uniforms.uZMix, 'value', { get: () => zonas.map(z => z.mix.value) });
  Object.defineProperty(uniforms.uZBrillo, 'value', { get: () => zonas.map(z => z.brillo.value) });

  const materiales: THREE.Material[] = [];
  interno.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshStandardMaterial;
    // La IA hornea luces y reflejos en la textura: menos metal evita el tono morado y los parches oscuros.
    m.metalness = Math.min(m.metalness, .35);
    m.roughness = Math.max(m.roughness, .45);
    m.envMapIntensity = 1.1;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPosAuto;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvPosAuto = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLSL_ZONAS}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          diffuseColor.rgb = repintar(diffuseColor.rgb);
          float zBorde;
          int zi = zonaDe(vPosAuto, zBorde);
          float zMix = zi >= 0 ? uZMix[zi] * zBorde : 0.0;
          vec3 zCol = zi >= 0 ? uZCol[zi] : vec3(0.0);
          float zBrillo = zi >= 0 ? uZBrillo[zi] * zBorde : 0.0;
          diffuseColor.rgb = mix(diffuseColor.rgb, zCol, zMix);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.5, zMix);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.05, zMix);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += zCol * zBrillo;');
    };
    m.customProgramCacheKey = () => 'zonas-auto';
    m.needsUpdate = true;
    materiales.push(m);
  });

  return {
    group, largo, alto, zonas,
    piezaEn(p) {
      if (Math.min(Math.hypot(p.x - ruedas.x, p.y - radio), Math.hypot(p.x - ruedas.y, p.y - radio)) < radio * 1.06 && Math.abs(p.z) > ruedas.w) return undefined;
      return zonas.find(z => p.x >= z.min.x && p.x <= z.max.x && p.y >= z.min.y && p.y <= z.max.y && p.z >= z.min.z && p.z <= z.max.z)?.id;
    },
    dispose() {
      interno.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        const m = o.material as THREE.MeshStandardMaterial;
        [m.map, m.metalnessMap, m.roughnessMap, m.normalMap].forEach(t => t?.dispose());
      });
      materiales.forEach(m => m.dispose());
    },
  };
}
