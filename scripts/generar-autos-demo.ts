/**
 * Genera las fotos de los vehículos de la demo con el mismo camino que usa la app:
 * 1) Gemini busca en internet la ficha del modelo (generación, rasgos, medidas);
 * 2) crea la vista frontal y, con ella de referencia, el costado y la zaga.
 *
 * Uso (la clave se lee de GEMINI_API_KEY y nunca se imprime):
 *   node scripts/generar-autos-demo.ts            genera lo que falte
 *   node scripts/generar-autos-demo.ts --rehacer  vuelve a generar todo
 *   node scripts/generar-autos-demo.ts --solo toyota-corolla-2020   prueba con un solo auto
 *
 * Es idempotente: si la ficha o la imagen ya existen, no las vuelve a pedir (no se paga dos veces).
 * Salida: public/autos/<slug>-<vista>.webp y src/lib/autosDemo.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerFicha, promptFicha, promptVista, slugAuto } from '../src/lib/fichaModelo.ts';
import type { FichaModelo, Vista } from '../src/lib/types.ts';

const RAIZ = join(import.meta.dirname, '..');
const SALIDA = join(RAIZ, 'public', 'autos');
const DATOS = join(RAIZ, 'src', 'lib', 'autosDemo.json');
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const REHACER = process.argv.includes('--rehacer');
const SOLO = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : null;

interface Auto { marca: string; modelo: string; anio: number; color: string; vistas: Vista[] }

/** Deben coincidir con los vehículos de seed.ts. El histórico solo necesita la foto de tarjeta. */
const AUTOS: Auto[] = [
  { marca: 'Ford', modelo: 'F-150', anio: 2020, color: 'Rojo', vistas: ['frente', 'lado', 'cola'] },
  { marca: 'Toyota', modelo: 'Corolla', anio: 2020, color: 'Gris azulado', vistas: ['frente', 'lado', 'cola'] },
  { marca: 'Hyundai', modelo: 'Tucson', anio: 2023, color: 'Azul', vistas: ['frente', 'lado', 'cola'] },
  { marca: 'Kia', modelo: 'Rio', anio: 2021, color: 'Gris', vistas: ['frente', 'lado', 'cola'] },
  { marca: 'Suzuki', modelo: 'Swift', anio: 2019, color: 'Blanco', vistas: ['frente', 'lado', 'cola'] },
  { marca: 'Chevrolet', modelo: 'Sail', anio: 2018, color: 'Plateado', vistas: ['frente'] },
  { marca: 'Chevrolet', modelo: 'Tracker', anio: 2019, color: 'Plateado', vistas: ['frente'] },
  { marca: 'Chevrolet', modelo: 'Onix', anio: 2020, color: 'Plateado', vistas: ['frente'] },
  { marca: 'Chevrolet', modelo: 'Colorado', anio: 2021, color: 'Plateado', vistas: ['frente'] },
  { marca: 'Chevrolet', modelo: 'Captiva', anio: 2022, color: 'Plateado', vistas: ['frente'] },
  { marca: 'Chevrolet', modelo: 'Sail', anio: 2023, color: 'Plateado', vistas: ['frente'] },
];

const clave = process.env.GEMINI_API_KEY;
if (!clave) { console.error('Falta GEMINI_API_KEY en el entorno.'); process.exit(1); }

interface Respuesta {
  candidates?: { content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] } }[];
  error?: { message?: string };
}

async function llamar(modelo: string, cuerpo: unknown, intentos = 2): Promise<Respuesta> {
  for (let i = 1; ; i++) {
    const r = await fetch(`${API}${modelo}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave! }, body: JSON.stringify(cuerpo) });
    const j = (await r.json().catch(() => ({}))) as Respuesta;
    if (r.ok) return j;
    if (i >= intentos) throw new Error(`Gemini ${r.status}: ${j.error?.message ?? 'sin detalle'}`);
    await new Promise(ok => setTimeout(ok, 4000));
  }
}

type Datos = Record<string, { ficha: FichaModelo; carroceria?: string; vistas: Partial<Record<Vista, string>> }>;
const datos: Datos = existsSync(DATOS) && !REHACER ? JSON.parse(readFileSync(DATOS, 'utf8')) : {};
const guardarDatos = () => writeFileSync(DATOS, JSON.stringify(datos, null, 2) + '\n');

async function ficha(a: Auto) {
  const r = await llamar('gemini-2.5-flash', { contents: [{ parts: [{ text: promptFicha(a) }] }], tools: [{ google_search: {} }] });
  const texto = r.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  const json = texto.match(/\{[\s\S]*\}/);
  if (!json) throw new Error('la búsqueda no devolvió JSON');
  const enlaces = (r.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).flatMap(c => (c.web?.uri ? [c.web.uri] : []));
  return leerFicha(JSON.parse(json[0]), enlaces);
}

async function imagen(texto: string, referencia?: Buffer) {
  const parts: unknown[] = [{ text: texto }];
  if (referencia) parts.push({ inline_data: { mime_type: 'image/webp', data: referencia.toString('base64') } });
  const r = await llamar('gemini-3.1-flash-image-preview', { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } } });
  const d = r.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
  if (!d) throw new Error('Gemini no devolvió imagen');
  return Buffer.from(d.data, 'base64');
}

/** 1280 px de ancho en WebP: nítida en la ficha y liviana (~80-120 kB) para GitHub Pages. */
function aWebp(bruto: Buffer, destino: string) {
  const tmp = mkdtempSync(join(tmpdir(), 'autos-'));
  try {
    const entrada = join(tmp, 'entrada.bin');
    writeFileSync(entrada, bruto);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', entrada, '-vf', 'scale=1280:-2', '-c:v', 'libwebp', '-quality', '80', destino]);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

mkdirSync(SALIDA, { recursive: true });
let imagenes = 0, fallas = 0;
for (const a of AUTOS) {
  const slug = slugAuto(a);
  if (SOLO && slug !== SOLO) continue;
  try {
    if (!datos[slug]) {
      const f = await ficha(a);
      datos[slug] = { ficha: f.ficha, carroceria: f.carroceria, vistas: {} };
      guardarDatos();
      console.log(`ficha  ${slug}: ${f.ficha.generacion}${f.ficha.medidas ? '' : ' (sin medidas válidas)'}`);
    }
    const d = datos[slug];
    for (const vista of a.vistas) {
      const archivo = join(SALIDA, `${slug}-${vista}.webp`), ruta = `autos/${slug}-${vista}.webp`;
      if (existsSync(archivo) && !REHACER) { d.vistas[vista] = ruta; continue; }
      const ref = vista === 'frente' ? undefined : readFileSync(join(SALIDA, `${slug}-frente.webp`));
      aWebp(await imagen(promptVista(a, d.ficha, vista), ref), archivo);
      d.vistas[vista] = ruta;
      guardarDatos();
      imagenes++;
      console.log(`imagen ${ruta}`);
    }
  } catch (e) {
    fallas++;
    console.error(`ERROR  ${slug}: ${(e as Error).message}`);
  }
}
console.log(`\nListo: ${imagenes} imagen(es) nuevas, ${fallas} auto(s) con error. Costo aprox.: US$${(imagenes * 0.067).toFixed(2)} en imágenes.`);
