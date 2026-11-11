import { interpretarPatente } from './patentes';
import { normalizarPatente } from './vehiculos';

export interface DatosPadron {
  patente?: string; marca?: string; modelo?: string; anio?: number; color?: string;
  motor?: string; chasis?: string; nombre?: string; rut?: string;
}

const limpiar = (s: string) => s.replace(/[|_~*]/g, ' ').replace(/\s+/g, ' ').trim();

function campo(lineas: string[], etiquetas: RegExp) {
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(etiquetas);
    if (!m) continue;
    const resto = limpiar(lineas[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s:.\-]+/, ''));
    if (resto) return resto;
    if (lineas[i + 1]) return limpiar(lineas[i + 1]);
  }
  return undefined;
}

/** Interpreta el texto leído de un padrón chileno. Lo que no reconoce queda vacío para que el maestro lo escriba. */
export function interpretarPadron(texto: string): DatosPadron {
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const d: DatosPadron = {};

  const ppu = campo(lineas, /(inscripci[oó]n|patente|p\.?p\.?u\.?)\b/i);
  const candidato = (ppu ?? '') + ' ' + texto;
  const pat = candidato.toUpperCase().match(/\b([A-Z]{4}[\s.\-·]*\d{2}|[A-Z]{2}[\s.\-·]*\d{4})(?:[\s.\-]*[0-9K])?\b/);
  if (pat) d.patente = normalizarPatente(pat[1]);

  d.marca = campo(lineas, /\bmarca\b/i)?.split(' ')[0];
  d.modelo = campo(lineas, /\bmodelo\b/i);
  d.color = campo(lineas, /\bcolor\b/i);
  d.motor = campo(lineas, /(n[°ºro.]*\s*)?motor\b/i)?.split(' ')[0];
  d.chasis = campo(lineas, /(n[°ºro.]*\s*)?(chasis|vin)\b/i)?.split(' ')[0];
  d.nombre = campo(lineas, /\b(nombre|propietario)\b/i);

  const anio = campo(lineas, /\ba[nñ]o\b/i)?.match(/(19|20)\d{2}/);
  if (anio) d.anio = Number(anio[0]);

  const rut = texto.match(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/);
  if (rut) d.rut = rut[0];
  return d;
}

/** Imagen de padrón ficticia, dibujada en el navegador, para demostrar la lectura sin un documento real. */
export function padronEjemplo(): string {
  const c = document.createElement('canvas');
  c.width = 1100; c.height = 720;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f7f6f1'; x.fillRect(0, 0, 1100, 720);
  x.strokeStyle = '#35506b'; x.lineWidth = 4; x.strokeRect(18, 18, 1064, 684);
  x.fillStyle = '#10202e';
  x.font = 'bold 34px Arial'; x.fillText('CERTIFICADO DE INSCRIPCION', 60, 80);
  x.font = '22px Arial'; x.fillText('DOCUMENTO DE EJEMPLO SIN VALIDEZ', 60, 116);
  const filas = [
    // El mismo vehículo que devuelve la patente de ejemplo: los dos caminos llevan al mismo auto.
    ['INSCRIPCION', 'DEMA.44-4'], ['NOMBRE', 'CLIENTE DEMO CUATRO'], ['RUT', '10.000.004-5'],
    ['MARCA', 'SUZUKI'], ['MODELO', 'SWIFT'], ['ANO', '2019'], ['COLOR', 'BLANCO'],
    ['MOTOR', 'DEMO000004'], ['CHASIS', 'DEMO0000000000004'],
  ];
  x.font = 'bold 30px Arial';
  filas.forEach(([k, v], i) => {
    x.fillText(k + ':', 60, 180 + i * 56);
    x.fillText(v, 360, 180 + i * 56);
  });
  return c.toDataURL('image/png');
}

export async function leerConOCR(imagen: string, avance: (p: number) => void): Promise<DatosPadron> {
  const { createWorker } = await import('tesseract.js');
  // Motor local (publicado con la app, ver vite.config.ts): no se ejecuta código de un CDN.
  const ocr = `${import.meta.env.BASE_URL}ocr/`;
  const w = await createWorker('spa', 1, {
    workerPath: `${ocr}worker.min.js`, corePath: ocr, workerBlobURL: false,
    logger: m => { if (m.status === 'recognizing text') avance(m.progress); },
  });
  try {
    const { data } = await w.recognize(imagen);
    return interpretarPadron(data.text);
  } finally {
    await w.terminate();
  }
}

/**
 * Deja la foto de la patente en las mejores condiciones para el OCR: la pasa a blanco y negro y
 * sube el contraste. Sin esto, el brillo del sol y los reflejos del metal se comen las letras.
 * No se recorta: el trabajador apunta a la placa, pero la placa no siempre queda centrada.
 */
export function prepararFotoPatente(imagen: string): Promise<string> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      // Las placas son anchas: se conserva la proporción y solo se agranda si viene chica.
      const k = Math.min(2, 1600 / Math.max(1, img.width));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d')!;
      x.drawImage(img, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const gris = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        // Contraste fuerte alrededor del punto medio: letras negras sobre fondo claro y al revés.
        const v = Math.max(0, Math.min(255, (gris - 128) * 1.8 + 128));
        p[i] = p[i + 1] = p[i + 2] = v;
      }
      x.putImageData(d, 0, 0);
      ok(c.toDataURL('image/jpeg', .9));
    };
    img.onerror = () => mal(new Error('No se pudo abrir la foto de la patente'));
    img.src = imagen;
  });
}

/**
 * Lee una patente de una foto. Usa el motor local con la lista blanca de caracteres de una placa
 * chilena, que es lo que hace que acierte: no hay que interpretar nada más.
 */
export async function leerPatenteConOCR(imagen: string, avance: (p: number) => void): Promise<string | null> {
  const { createWorker } = await import('tesseract.js');
  const ocr = `${import.meta.env.BASE_URL}ocr/`;
  const w = await createWorker('eng', 1, {
    workerPath: `${ocr}worker.min.js`, corePath: ocr, workerBlobURL: false,
    logger: m => { if (m.status === 'recognizing text') avance(m.progress); },
  });
  try {
    await w.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' });
    const { data } = await w.recognize(await prepararFotoPatente(imagen));
    return interpretarPatente(data.text);
  } finally {
    await w.terminate();
  }
}

/** Reduce la foto antes de procesarla: las cámaras de celular entregan archivos enormes. */
export function reducirImagen(file: File, lado = 1600): Promise<string> {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', .88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo abrir la imagen')); };
    img.src = url;
  });
}
