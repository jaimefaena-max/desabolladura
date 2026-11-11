/**
 * Lectura de una boleta de servicios (luz, agua, teléfono) para no tener que teclear el monto.
 * Igual que con la patente: la foto no sale del equipo, el OCR corre aquí mismo, y lo que se lee
 * es una **sugerencia** que el administrador confirma antes de guardar.
 */

/** Los montos chilenos llegan como `$61.400`, `61.400` o `61400`: se aceptan las tres formas. */
function aNumero(crudo: string): number | null {
  const limpio = crudo.replace(/[^\d]/g, '');
  if (!limpio) return null;
  const n = Number(limpio);
  return n >= 100 && n <= 100000000 ? n : null;
}

/**
 * Saca el monto total del texto de una boleta. Busca primero el renglón que dice TOTAL (el último,
 * porque arriba suele haber subtotales) y, si no aparece, el monto más grande de la página.
 */
export function interpretarMontoBoleta(texto: string): number | null {
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const montos = (l: string) => (l.match(/\$?\s?\d{1,3}(?:[.\s]\d{3})+|\$?\s?\d{4,9}/g) ?? [])
    .map(aNumero).filter((n): n is number => n !== null);

  const conTotal = lineas.filter(l => /\btotal\b/i.test(l) && !/sub\s*total/i.test(l));
  for (const l of conTotal.reverse()) {
    const enLinea = montos(l);
    // El total suele venir al final del renglón: se toma el mayor de esa línea.
    if (enLinea.length) return Math.max(...enLinea);
  }
  const todos = lineas.flatMap(montos);
  return todos.length ? Math.max(...todos) : null;
}

/** Intenta reconocer el mes que cubre la boleta: «noviembre 2026», «11/2026», «2026-11». */
export function interpretarPeriodoBoleta(texto: string): string | null {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const porNombre = texto.toLowerCase().match(new RegExp(`\\b(${meses.join('|')})\\b[^\\d]{0,12}(20\\d{2})`));
  if (porNombre) return `${porNombre[2]}-${String(meses.indexOf(porNombre[1]) + 1).padStart(2, '0')}`;
  const iso = texto.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  const mesAnio = texto.match(/\b(0?[1-9]|1[0-2])[-/](20\d{2})\b/);
  if (mesAnio) return `${mesAnio[2]}-${mesAnio[1].padStart(2, '0')}`;
  return null;
}

/**
 * Boleta ficticia dibujada en el navegador, para mostrar la función sin subir una cuenta real.
 * Mismo criterio que el padrón de ejemplo: dice en grande que no tiene validez.
 */
export function boletaEjemplo(mes = 'noviembre 2026', monto = '61.400'): string {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 1200;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fbfaf7'; x.fillRect(0, 0, 900, 1200);
  x.strokeStyle = '#2f4858'; x.lineWidth = 4; x.strokeRect(20, 20, 860, 1160);

  x.fillStyle = '#0d1c26';
  x.font = 'bold 40px Arial'; x.fillText('ELECTRICA DEMO S.A.', 60, 100);
  x.font = '20px Arial'; x.fillText('RUT 76.543.210-K · Servicio de distribución eléctrica', 60, 132);
  x.fillText('BOLETA DE EJEMPLO SIN VALIDEZ TRIBUTARIA', 60, 164);

  x.strokeStyle = '#c9c4b8'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(60, 190); x.lineTo(840, 190); x.stroke();

  x.fillStyle = '#0d1c26'; x.font = '22px Arial';
  const datos = [
    ['N.º de cliente', '1234567-8'], ['N.º de boleta', '884521'],
    ['Período facturado', mes], ['Vencimiento', '10 de diciembre de 2026'],
    ['Dirección', 'Av. Siempre Viva 742, Ñuñoa'],
  ];
  datos.forEach(([k, v], i) => {
    x.fillStyle = '#5a6b75'; x.fillText(k, 60, 240 + i * 44);
    x.fillStyle = '#0d1c26'; x.fillText(v, 380, 240 + i * 44);
  });

  // Detalle de consumo
  x.fillStyle = '#eceae3'; x.fillRect(60, 480, 780, 60);
  x.fillStyle = '#0d1c26'; x.font = 'bold 22px Arial';
  x.fillText('Detalle', 80, 518); x.fillText('Monto', 650, 518);
  x.font = '22px Arial';
  const filas = [['Cargo fijo', '$ 1.890'], ['Energía consumida 312 kWh', '$ 47.200'], ['Alumbrado público', '$ 4.980'], ['Ajuste de lectura', '$ 6.130']];
  filas.forEach(([k, v], i) => {
    x.fillStyle = '#26343d'; x.fillText(k, 80, 590 + i * 46);
    x.fillStyle = '#26343d'; x.fillText(v, 650, 590 + i * 46);
  });

  x.strokeStyle = '#c9c4b8'; x.beginPath(); x.moveTo(60, 800); x.lineTo(840, 800); x.stroke();
  x.fillStyle = '#0d1c26'; x.font = 'bold 26px Arial'; x.fillText('Subtotal', 80, 850); x.fillText('$ 60.200', 650, 850);
  x.fillText('IVA 19 %', 80, 892); x.fillText('$ 1.200', 650, 892);

  x.fillStyle = '#0d1c26'; x.fillRect(60, 930, 780, 90);
  x.fillStyle = '#ffffff'; x.font = 'bold 34px Arial';
  x.fillText('TOTAL A PAGAR', 80, 986); x.fillText('$ ' + monto, 600, 986);

  x.fillStyle = '#5a6b75'; x.font = '20px Arial';
  x.fillText('Este documento es un ejemplo creado para la demostración.', 60, 1080);
  x.fillText('No corresponde a un suministro real ni a un pago efectivo.', 60, 1112);
  return c.toDataURL('image/png');
}

/** Lee una foto de boleta con el motor local de OCR. Devuelve lo que pudo reconocer, sin decidir nada. */
export async function leerBoletaConOCR(imagen: string, avance: (p: number) => void) {
  const { createWorker } = await import('tesseract.js');
  const ocr = `${import.meta.env.BASE_URL}ocr/`;
  const w = await createWorker('spa', 1, {
    workerPath: `${ocr}worker.min.js`, corePath: ocr, workerBlobURL: false,
    logger: m => { if (m.status === 'recognizing text') avance(m.progress); },
  });
  try {
    const { data } = await w.recognize(imagen);
    return { monto: interpretarMontoBoleta(data.text), periodo: interpretarPeriodoBoleta(data.text), texto: data.text };
  } finally {
    await w.terminate();
  }
}
