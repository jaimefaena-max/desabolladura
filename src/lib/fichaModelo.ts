import type { Carroceria, FichaModelo, Medidas, Vehiculo, Vista } from './types';

/**
 * Instrucciones para identificar el modelo exacto y generar sus fotos.
 * Módulo puro: lo usan la app (gemini.ts) y el script que genera las fotos de la demo,
 * así ambos producen el mismo resultado.
 *
 * Se buscan en internet los DATOS del modelo (generación, rasgos, medidas), no fotos:
 * las imágenes se generan nuevas y nunca se copian fotos ajenas.
 */

type DatosAuto = Pick<Vehiculo, 'marca' | 'modelo' | 'anio' | 'color'>;

export const VISTAS: { id: Vista; nombre: string }[] = [
  { id: 'frente', nombre: 'Frente' },
  { id: 'lado', nombre: 'Costado' },
  { id: 'cola', nombre: 'Atrás' },
];

export function promptFicha(v: DatosAuto) {
  return [
    `Busca en internet el ${v.marca} ${v.modelo} año ${v.anio} vendido en Chile.`,
    'Identifica la generación exacta de ese año (código y período) y sus rasgos visuales distintivos:',
    'forma de los focos delanteros y traseros, parrilla, parachoques, línea lateral, pilares y llantas de serie.',
    'Busca también sus medidas exteriores oficiales en milímetros.',
    'Responde solo un JSON, sin texto adicional, con esta forma:',
    '{"generacion": "nombre corto de la generación y período", "carroceria": "sedan | hatchback | suv | pickup",',
    '"rasgos": "descripción visual en máximo 70 palabras", "largo_mm": numero, "ancho_mm": numero sin espejos,',
    '"alto_mm": numero, "entre_ejes_mm": numero}',
  ].join(' ');
}

/** Identificador de un modelo y año: nombra las fotos de la demo (`public/autos/<slug>-<vista>.webp`). */
export const slugAuto = (a: { marca: string; modelo: string; anio: number }) =>
  `${a.marca}-${a.modelo}-${a.anio}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const CARROCERIAS: Carroceria[] = ['sedan', 'hatchback', 'suv', 'pickup'];

interface FichaCruda {
  generacion?: string; carroceria?: string; rasgos?: string;
  largo_mm?: number; ancho_mm?: number; alto_mm?: number; entre_ejes_mm?: number;
}

/** Medidas fuera de lo que mide un auto o camioneta liviana se descartan: el 3D se queda con las de su tipo. */
export function medidasValidas(c: FichaCruda): Medidas | undefined {
  const { largo_mm: l, ancho_mm: a, alto_mm: h, entre_ejes_mm: e } = c;
  const ok = (n: unknown, min: number, max: number) => typeof n === 'number' && n >= min && n <= max;
  if (!ok(l, 3000, 6500) || !ok(a, 1450, 2200) || !ok(h, 1200, 2200) || !ok(e, 2000, 4200) || e! >= l!) return undefined;
  const m = (n: number) => Math.round(n) / 1000;
  return { largo: m(l!), ancho: m(a!), alto: m(h!), entreEjes: m(e!) };
}

export function leerFicha(c: FichaCruda, fuentes: string[] = []): { ficha: FichaModelo; carroceria?: Carroceria } {
  const generacion = (c.generacion ?? '').trim();
  const rasgos = (c.rasgos ?? '').trim();
  if (!generacion || !rasgos) throw new Error('No se pudo identificar el modelo');
  const carroceria = CARROCERIAS.find(x => x === c.carroceria?.trim().toLowerCase());
  return { ficha: { generacion, rasgos, medidas: medidasValidas(c), fuentes: fuentes.slice(0, 3) }, carroceria };
}

const ENCUADRE: Record<Vista, string> = {
  frente: 'Vista tres cuartos frontal: se ve el frente completo y el costado izquierdo del auto, cámara a la altura de los focos.',
  lado: 'Vista de perfil exacto del costado izquierdo, auto completo de parachoque a parachoque, cámara a media altura.',
  cola: 'Vista tres cuartos trasera: se ve la parte trasera completa y el costado derecho del auto, cámara a la altura de los focos.',
};

const ESTUDIO = 'Fotografía de estudio fotorrealista, fondo gris carbón liso, piso oscuro con reflejo suave, luz de estudio difusa, '
  + 'auto completo y centrado con margen alrededor, sin personas, sin texto, patente en blanco sin caracteres, sin marcas de agua.';

/** La vista frontal se genera primero; las otras dos la reciben como referencia para que sea el mismo auto. */
export function promptVista(v: DatosAuto, ficha: FichaModelo, vista: Vista) {
  const auto = `${v.marca} ${v.modelo} ${v.anio} (${ficha.generacion}), pintura color ${v.color.toLowerCase()}`;
  if (vista === 'frente') {
    return `${ESTUDIO} El auto es un ${auto}. Debe ser exactamente ese modelo y generación, fiel a la realidad: ${ficha.rasgos} ${ENCUADRE.frente}`;
  }
  return `Es exactamente el mismo auto de la imagen de referencia: mismo ${auto}, mismas llantas, mismo color y mismo estudio. `
    + `${ENCUADRE[vista]} ${ESTUDIO} Rasgos del modelo: ${ficha.rasgos}`;
}
