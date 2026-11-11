import { AUTO_DEMO, VEHICULOS_DEMO } from './patentesDemo';
import type { Carroceria } from './types';
import { normalizarPatente, patenteValida } from './vehiculos';

/** Lo que se puede llenar solo con una patente. Nunca incluye datos del propietario. */
export interface DatosVehiculo {
  patente: string;
  marca?: string; modelo?: string; anio?: number;
  tipo?: string; motor?: string; chasis?: string; color?: string;
}

/** De dónde salió el dato: del servicio, de una consulta anterior guardada, o de la tabla de ejemplo. */
export type Fuente = 'servicio' | 'memoria' | 'ejemplo';

export type Consulta =
  | { estado: 'ok'; datos: DatosVehiculo; fuente: Fuente }
  | { estado: 'no-encontrada' }
  | { estado: 'sin-servicio'; motivo: string };

/**
 * Dirección del intermediario (worker propio) que consulta la patente. La clave del proveedor
 * vive allá, nunca en el navegador: este sitio es estático y todo lo que llegue aquí es público.
 * Sin esta variable la app funciona igual, solo que la consulta automática queda apagada.
 */
const SERVICIO = (import.meta.env.VITE_API_PATENTES ?? '').replace(/\/+$/, '');
const MEMORIA = 'dp.patentes';
const VIGENCIA = 30 * 24 * 60 * 60 * 1000;

interface Guardada { datos: DatosVehiculo; cuando: number }

/* El navegador puede negar el almacenamiento (modo privado): la consulta funciona igual, solo que sin memoria. */
function leerMemoria(): Record<string, Guardada> {
  try { return JSON.parse(localStorage.getItem(MEMORIA) ?? '{}') as Record<string, Guardada>; } catch { return {}; }
}

function guardarMemoria(patente: string, datos: DatosVehiculo) {
  try {
    const m = leerMemoria();
    m[patente] = { datos, cuando: Date.now() };
    // Lo viejo se descarta: el parque automotor cambia y una ficha de hace un año engaña.
    const corte = Date.now() - VIGENCIA;
    for (const k of Object.keys(m)) if (!(m[k].cuando > corte)) delete m[k];
    localStorage.setItem(MEMORIA, JSON.stringify(m));
  } catch { /* sin almacenamiento */ }
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Acepta dos formas: la del worker propio (`{encontrada, datos}`) y la del proveedor en crudo
 * (`{status, data:{make, model, year, engine}}`), para poder apuntar la variable al proveedor
 * directo si algún día hiciera falta.
 */
export function leerRespuesta(j: unknown, patente: string): DatosVehiculo | null {
  const r = j as { encontrada?: boolean; datos?: Record<string, unknown>; status?: string; data?: Record<string, unknown> } | null;
  if (!r) return null;
  const d = (r.datos ?? r.data) as Record<string, unknown> | undefined;
  if (!d || r.encontrada === false || (r.status && r.status !== 'success')) return null;
  const datos: DatosVehiculo = {
    patente,
    marca: texto(d.marca) ?? texto(d.make),
    modelo: texto(d.modelo) ?? texto(d.model),
    anio: Number(d.anio ?? d.year) || undefined,
    tipo: texto(d.tipo) ?? texto(d.type),
    motor: texto(d.motor) ?? texto(d.engine),
    chasis: texto(d.chasis) ?? texto(d.vin),
    color: texto(d.color),
  };
  // Sin marca ni modelo no sirve de nada: se trata como no encontrada para que el maestro escriba.
  return datos.marca || datos.modelo ? datos : null;
}

/** Convierte el tipo que informa el registro (AUTOMOVIL, CAMIONETA…) en la carrocería de la app. */
export function carroceriaDeTipo(tipo?: string): Carroceria | null {
  const t = (tipo ?? '').toUpperCase();
  if (/CAMIONETA|PICK ?UP/.test(t)) return 'pickup';
  if (/SUV|JEEP|TODO ?TERRENO|STATION ?WAGON|FAMILIAR/.test(t)) return 'suv';
  if (/HATCH/.test(t)) return 'hatchback';
  if (/AUTOMOVIL|SEDAN/.test(t)) return 'sedan';
  return null;
}

/**
 * Busca un vehículo por patente. Nunca lanza: cualquier problema se devuelve como estado, porque
 * el maestro está atendiendo a alguien en el mesón y la pantalla no puede quedarse en blanco.
 */
export async function consultarPatente(entrada: string): Promise<Consulta> {
  const patente = normalizarPatente(entrada);
  if (!patenteValida(patente)) return { estado: 'no-encontrada' };

  const guardada = leerMemoria()[patente];
  if (guardada && Date.now() - guardada.cuando < VIGENCIA) return { estado: 'ok', datos: guardada.datos, fuente: 'memoria' };

  if (!SERVICIO) {
    // Sin registro conectado la consulta no se puede hacer, pero la demo tiene que fluir: se
    // devuelve el vehículo de prueba con la patente que escribió el maestro. El aviso en pantalla
    // deja claro que los datos son de demostración, así que nadie los confunde con reales.
    const ejemplo = VEHICULOS_DEMO[patente];
    return { estado: 'ok', datos: ejemplo ? { ...ejemplo } : { ...AUTO_DEMO, patente }, fuente: 'ejemplo' };
  }

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 8000);
  try {
    const r = await fetch(`${SERVICIO}/patente/${patente}`, { headers: { Accept: 'application/json' }, signal: control.signal });
    if (r.status === 404) return { estado: 'no-encontrada' };
    if (!r.ok) return { estado: 'sin-servicio', motivo: `El servicio de patentes respondió ${r.status}.` };
    const datos = leerRespuesta(await r.json(), patente);
    if (!datos) return { estado: 'no-encontrada' };
    guardarMemoria(patente, datos);
    return { estado: 'ok', datos, fuente: 'servicio' };
  } catch {
    // Un corte de red no puede dejar al maestro sin nada: se usa lo guardado, aunque esté viejo.
    if (guardada) return { estado: 'ok', datos: guardada.datos, fuente: 'memoria' };
    return { estado: 'sin-servicio', motivo: 'No se pudo contactar el servicio de patentes.' };
  } finally {
    clearTimeout(reloj);
  }
}

/* Confusiones típicas del OCR de una patente, según la posición del carácter. */
const A_DIGITO: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7' };
const A_LETRA: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B' };

function ajustar(seis: string, letras: number) {
  return seis.split('').map((c, i) => (i < letras ? A_LETRA[c] ?? c : A_DIGITO[c] ?? c)).join('');
}

/**
 * Saca una patente chilena de un texto leído por OCR. Prueba los dos formatos vigentes
 * (BBBB12 nuevo, BB1234 antiguo) corrigiendo las confusiones típicas de posición.
 */
export function interpretarPatente(textoLeido: string): string | null {
  const limpio = textoLeido.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (let i = 0; i + 6 <= limpio.length; i++) {
    const seis = limpio.slice(i, i + 6);
    // Una tanda de puros números no es una placa: si no hay letras, ninguna corrección es creíble.
    if ((seis.match(/[A-Z]/g) ?? []).length < 2) continue;
    // Se prueban los dos formatos y gana el que necesitó menos correcciones: «AB1234» es la
    // patente antigua, no una nueva con dos letras mal leídas.
    const candidatos = [4, 2]
      .map(letras => {
        const valor = ajustar(seis, letras);
        const valida = letras === 4 ? /^[A-Z]{4}\d{2}$/.test(valor) : /^[A-Z]{2}\d{4}$/.test(valor);
        return valida ? { valor, cambios: [...valor].filter((c, j) => c !== seis[j]).length } : null;
      })
      .filter((c): c is { valor: string; cambios: number } => c !== null)
      .sort((a, b) => a.cambios - b.cambios);
    if (candidatos.length) return candidatos[0].valor;
  }
  return null;
}
