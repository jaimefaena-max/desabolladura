import { leerFicha, promptFicha, promptVista } from './fichaModelo';
import type { DatosPadron } from './padron';
import type { FichaModelo, Sugerido, Vehiculo, Vista } from './types';

/**
 * Conexión opcional con Gemini desde el navegador.
 * La clave vive solo en el localStorage de este equipo: sirve para demostrar, no para producción.
 * En producción estas llamadas pasan por un backend propio y la clave nunca llega al navegador.
 */
const CLAVE = 'dp.gemini';
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const TEXTO = 'gemini-2.5-flash';
const IMAGEN = 'gemini-3.1-flash-image-preview';

/* El navegador puede bloquear el almacenamiento (modo privado): sin clave guardada, Gemini queda desconectado. */
export const claveGemini = () => { try { return localStorage.getItem(CLAVE) ?? ''; } catch { return ''; } };
export const guardarClave = (k: string) => { try { if (k) localStorage.setItem(CLAVE, k.trim()); else localStorage.removeItem(CLAVE); } catch { /* no se pudo guardar */ } };

interface Parte { text?: string; inlineData?: { mimeType: string; data: string }; inline_data?: { mime_type: string; data: string }; }
interface Respuesta {
  candidates?: { content?: { parts?: Parte[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
  error?: { message?: string };
}

async function llamar(modelo: string, cuerpo: unknown): Promise<Respuesta> {
  const k = claveGemini();
  if (!k) throw new Error('Gemini no está conectado');
  const r = await fetch(`${API}${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
    body: JSON.stringify(cuerpo),
    // Sin tope de tiempo, una red colgada deja la pantalla en «Leyendo…» para siempre.
    signal: AbortSignal.timeout(modelo === IMAGEN ? 90_000 : 30_000),
  }).catch(() => { throw new Error('No hay conexión con Gemini. Revisa internet e intenta otra vez.'); });
  const j = (await r.json().catch(() => ({}))) as Respuesta;
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 || /api key/i.test(j.error?.message ?? '') ? 'Gemini rechazó la clave' : j.error?.message ?? `Gemini respondió ${r.status}`);
  return j;
}

const textoDe = (r: Respuesta) => r.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';

export function extraerJSON<T>(s: string): T {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Gemini no devolvió datos');
  return JSON.parse(m[0]) as T;
}

export async function probarClave() {
  await llamar(TEXTO, { contents: [{ parts: [{ text: 'Responde OK' }] }] });
}

export async function leerPadronGemini(dataUrl: string): Promise<DatosPadron> {
  const [cab, data] = dataUrl.split(',');
  const mime = cab.match(/data:(.*?);/)?.[1] ?? 'image/jpeg';
  const r = await llamar(TEXTO, {
    contents: [{
      parts: [
        { text: 'Extrae los datos de este padrón chileno de vehículo. Devuelve solo JSON con las claves patente, marca, modelo, anio (número), color, motor, chasis, nombre, rut. Omite la clave si no se lee con claridad.' },
        { inline_data: { mime_type: mime, data } },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });
  return extraerJSON<DatosPadron>(textoDe(r));
}

export async function buscarPrecioGemini(descripcion: string, v: Vehiculo): Promise<Sugerido> {
  const r = await llamar(TEXTO, {
    contents: [{
      parts: [{ text: `Busca en internet el valor actual en Chile, en pesos chilenos netos, de este trabajo de taller: ${descripcion} para ${v.marca} ${v.modelo} ${v.anio}. Responde solo un JSON {"min": numero, "max": numero} sin puntos ni símbolos.` }],
    }],
    tools: [{ google_search: {} }],
  });
  const { min, max } = extraerJSON<{ min: number; max: number }>(textoDe(r));
  if (!(min > 0) || !(max >= min)) throw new Error('Gemini no encontró un rango confiable');
  const enlaces = (r.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).flatMap(c => (c.web?.uri ? [c.web.uri] : [])).slice(0, 3);
  return { min, max, fuente: 'Búsqueda en internet con Gemini', enlaces };
}

/** Paso 1: Gemini busca en internet la generación exacta, sus rasgos y sus medidas. */
export async function fichaModeloGemini(v: Vehiculo): Promise<ReturnType<typeof leerFicha>> {
  // La búsqueda en internet no admite respuesta JSON forzada: se extrae del texto.
  const r = await llamar(TEXTO, { contents: [{ parts: [{ text: promptFicha(v) }] }], tools: [{ google_search: {} }] });
  const enlaces = (r.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).flatMap(c => (c.web?.uri ? [c.web.uri] : []));
  return leerFicha(extraerJSON(textoDe(r)), enlaces);
}

async function imagen(texto: string, referencia?: string): Promise<string> {
  const parts: Parte[] = [{ text: texto }];
  if (referencia) {
    const [cab, data] = referencia.split(',');
    parts.push({ inline_data: { mime_type: cab.match(/data:(.*?);/)?.[1] ?? 'image/jpeg', data } });
  }
  const r = await llamar(IMAGEN, { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } } });
  const p = r.candidates?.[0]?.content?.parts?.find(x => x.inlineData || x.inline_data);
  const d = p?.inlineData ?? (p?.inline_data && { mimeType: p.inline_data.mime_type, data: p.inline_data.data });
  if (!d) throw new Error('Gemini no devolvió imagen');
  return comprimir(`data:${d.mimeType};base64,${d.data}`);
}

/**
 * Paso 2: tres fotos del mismo auto. El frente sale primero y sirve de referencia a las otras
 * dos, que se piden en paralelo. Si una vista falla, se entregan las que sí salieron.
 */
export async function generarVistasGemini(v: Vehiculo, ficha: FichaModelo, avance: (vista: Vista, src: string) => void) {
  const frente = await imagen(promptVista(v, ficha, 'frente'));
  avance('frente', frente);
  await Promise.allSettled((['lado', 'cola'] as const).map(async vista => avance(vista, await imagen(promptVista(v, ficha, vista), frente))));
}

/** El navegador guarda poco espacio: la imagen se reduce antes de almacenarla. */
function comprimir(src: string): Promise<string> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 960 / img.width), c = document.createElement('canvas');
      c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', .8));
    };
    img.onerror = () => mal(new Error('Imagen de Gemini no válida'));
    img.src = src;
  });
}
