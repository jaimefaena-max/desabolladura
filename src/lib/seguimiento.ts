import { deflateSync, inflateSync, strFromU8, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { clp, PIEZAS, progreso, tituloItem, TRABAJOS, totales } from './piezas';
import type { Empresa, Item, Orden } from './types';
import { vistasDe } from './vistas';

/**
 * Link de seguimiento para el cliente.
 *
 * La demo no tiene servidor: los datos viven en el navegador del taller. Para que el link abra en el
 * teléfono del cliente, lleva adentro una «instantánea» comprimida de la orden (vehículo, tareas,
 * notas, montos del presupuesto y avance). No incluye nombre, RUT ni teléfono del cliente, ni motor
 * o chasis, ni los precios sugeridos internos, y va después del # (el navegador no la envía a ningún
 * servidor). Las fotos que saca el trabajador pesan demasiado para un link: se ven en el equipo del
 * taller; con servidor, se verían en cualquier teléfono.
 */

const b64url = (u: Uint8Array) => {
  let s = '';
  u.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const desdeB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

interface Paquete {
  t: string; w?: string; n: number; c: string; e: string; a: Orden['aprobacion']; p: Orden['pagador']['tipo'];
  v: Orden['vehiculo']; vi: Record<string, string>; i: Item[];
}

export function empaquetar(o: Orden, taller: string, wspTaller = ''): string {
  // Motor y chasis identifican al vehículo y el cliente no los necesita: no viajan en el link.
  const { motor: _m, chasis: _c, ...vehiculo } = o.vehiculo;
  const v = { ...vehiculo, ficha: vehiculo.ficha && { ...vehiculo.ficha, fuentes: undefined, rasgos: '' } };
  // Solo las fotos públicas del modelo (las de la demo); las del taller viven en su IndexedDB.
  const vi = Object.fromEntries(Object.entries(vistasDe(o) ?? {}).filter(([, r]) => r && !/^(idb|data):/.test(r)));
  // Las fotos del taller no caben en el link: va solo su identificador, para avisar que existen.
  const i = o.items.map(({ sugerido: _s, horas: _h, ...x }) => x);
  const datos: Paquete = { t: taller, w: wspTaller || undefined, n: o.numero, c: o.codigo, e: o.entrega, a: o.aprobacion, p: o.pagador.tipo, v, vi, i };
  return b64url(deflateSync(strToU8(JSON.stringify(datos)), { level: 9 }));
}

/*
 * El link lo puede escribir cualquiera: nada de lo que trae es de confianza. Se acepta solo lo que
 * tiene la forma esperada, con largos acotados; lo demás se descarta o invalida el link completo.
 */
const LARGO_MAX_LINK = 8000, LARGO_MAX_DATOS = 200_000;
const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const texto = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');
const uno = <T extends string>(x: unknown, validos: readonly T[]): T | undefined => validos.find(v => v === x);
const entre = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && x >= min && x <= max;
const TRABAJOS_LINK = [...TRABAJOS.map(t => t.id), 'general'] as const;
const ESTADOS = ['pendiente', 'proceso', 'listo'] as const;
const SEVERIDADES = ['leve', 'medio', 'fuerte'] as const;
const VISTAS_LINK = ['frente', 'lado', 'cola'] as const;
/** Archivo propio del sitio: ruta relativa, sin protocolo ni «..», para que el link no cargue nada de otro servidor. */
const rutaPropia = (x: unknown, extensiones: RegExp) =>
  (typeof x === 'string' && x.length < 120 && !x.includes('..') && /^[a-z0-9][\w./-]*$/i.test(x) && extensiones.test(x) ? x : undefined);

function itemDelLink(x: unknown): Item | null {
  if (!esObjeto(x) || typeof x.id !== 'string') return null;
  const trabajo = uno(x.trabajo, TRABAJOS_LINK), estado = uno(x.estado, ESTADOS), severidad = uno(x.severidad, SEVERIDADES);
  const pieza = x.pieza === null ? null : PIEZAS.find(p => p.id === x.pieza)?.id;
  if (!trabajo || !estado || pieza === undefined || (trabajo !== 'general' && pieza === null)) return null;
  return {
    id: texto(x.id, 40), trabajo, pieza, estado,
    monto: entre(x.monto, 0, 1e9) ? Math.round(x.monto) : null,
    ...(x.titulo ? { titulo: texto(x.titulo, 80) } : {}),
    ...(severidad ? { severidad } : {}),
    ...(x.adicional === true ? { adicional: true } : {}),
    ...(x.nota ? { nota: texto(x.nota, 300) } : {}),
    ...(typeof x.fotoAntes === 'string' ? { fotoAntes: texto(x.fotoAntes, 60) } : {}),
    ...(typeof x.fotoDespues === 'string' ? { fotoDespues: texto(x.fotoDespues, 60) } : {}),
    ...(typeof x.terminadoEl === 'string' && !Number.isNaN(Date.parse(x.terminadoEl)) ? { terminadoEl: texto(x.terminadoEl, 30) } : {}),
  };
}

function vehiculoDelLink(x: unknown): Orden['vehiculo'] | null {
  if (!esObjeto(x) || !texto(x.marca, 40) || !entre(x.anio, 1900, 2100)) return null;
  const f = esObjeto(x.ficha) ? x.ficha : null;
  const m = f && esObjeto(f.medidas) ? f.medidas : null, m3 = f && esObjeto(f.modelo3d) ? f.modelo3d : null;
  const medidas = m && entre(m.largo, 3, 6.5) && entre(m.ancho, 1.45, 2.2) && entre(m.alto, 1.2, 2.2) && entre(m.entreEjes, 2, 4.2) && m.entreEjes < m.largo
    ? { largo: m.largo, ancho: m.ancho, alto: m.alto, entreEjes: m.entreEjes } : undefined;
  const url = m3 ? rutaPropia(m3.url, /\.glb$/i) : undefined;
  const modelo3d = url ? { url, ...(m3 && entre(m3.giro, -360, 360) ? { giro: m3.giro } : {}) } : undefined;
  return {
    marca: texto(x.marca, 40), modelo: texto(x.modelo, 40), anio: Math.round(x.anio),
    patente: texto(x.patente, 12).toUpperCase().replace(/[^A-Z0-9]/g, ''),
    color: texto(x.color, 30), colorHex: typeof x.colorHex === 'string' && /^#[0-9a-f]{6}$/i.test(x.colorHex) ? x.colorHex : '#8a8f96',
    carroceria: uno(x.carroceria, ['sedan', 'hatchback', 'suv', 'pickup'] as const) ?? 'sedan',
    ...(f ? { ficha: { generacion: texto(f.generacion, 80), rasgos: '', ...(medidas ? { medidas } : {}), ...(modelo3d ? { modelo3d } : {}) } } : {}),
  };
}

/** Reconstruye una orden de solo lectura desde el link. Devuelve null si está dañado o no tiene la forma esperada. */
export function desempaquetar(s: string): (Orden & { taller: string; wspTaller: string }) | null {
  try {
    if (typeof s !== 'string' || s.length > LARGO_MAX_LINK) return null;
    const bytes = inflateSync(desdeB64url(s));
    if (bytes.length > LARGO_MAX_DATOS) return null;
    const d: unknown = JSON.parse(strFromU8(bytes));
    if (!esObjeto(d) || !Array.isArray(d.i) || d.i.length > 60) return null;
    const vehiculo = vehiculoDelLink(d.v);
    const items = d.i.map(itemDelLink).filter((i): i is Item => !!i);
    const codigo = texto(d.c, 12), entrega = texto(d.e, 10), wsp = texto(d.w, 30).replace(/\D/g, '');
    if (!vehiculo || items.length !== d.i.length || !/^[A-Z0-9]{4,12}$/i.test(codigo) || Number.isNaN(Date.parse(`${entrega}T12:00:00`))) return null;
    const vi = esObjeto(d.vi) ? d.vi : {};
    const vistas: NonNullable<Orden['vistas']> = {};
    for (const k of VISTAS_LINK) {
      const ruta = rutaPropia(vi[k], /\.(webp|jpe?g|png)$/i);
      if (ruta) vistas[k] = ruta;
    }
    return {
      taller: texto(d.t, 60) || 'Taller', wspTaller: /^\d{8,15}$/.test(wsp) ? wsp : '',
      id: `link-${codigo}`, numero: entre(d.n, 0, 1e9) ? Math.round(d.n) : 0, codigo, creada: '', entrega, maestroId: '',
      vehiculo, cliente: { nombre: '', rut: '', telefono: '' }, pagador: { tipo: uno(d.p, ['aseguradora', 'particular'] as const) ?? 'particular' },
      items, notas: '', aprobacion: uno(d.a, ['pendiente', 'enviada', 'aprobada', 'rechazada'] as const) ?? 'pendiente',
      repuestos: [], fotos: [], historial: [],
      recepcion: { km: null, combustible: '', observaciones: '' }, entregadaEl: null, cobrada: false,
      vistas,
    };
  } catch {
    return null;
  }
}

export function enlaceSeguimiento(o: Orden, taller: string, wspTaller = '') {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/cliente/${o.codigo}/${empaquetar(o, taller, wspTaller)}`;
}

const saludo = (o: Orden, empresa: Pick<Empresa, 'nombre'>) => {
  // Solo el nombre de pila; un nombre genérico («Cliente Demo») no se usa para saludar.
  const nombre = /^cliente\b/i.test(o.cliente.nombre) ? '' : o.cliente.nombre.trim().split(/\s+/)[0];
  return `Hola${nombre ? ` ${nombre}` : ''}, le escribimos de ${empresa.nombre}.`;
};

/** Presupuesto para un particular: total y link donde lo revisa. Responde «Apruebo» y el taller lo registra. */
export function mensajePresupuesto(o: Orden, empresa: Pick<Empresa, 'nombre' | 'whatsapp'>, recordatorio = false) {
  const v = `${o.vehiculo.marca} ${o.vehiculo.modelo}`;
  return [
    saludo(o, empresa),
    recordatorio ? `Le recordamos que el presupuesto de su ${v} sigue esperando su respuesta.` : `El presupuesto de su ${v} está listo.`,
    `Total: *${clp(totales(o).total)}* con IVA.`,
    `Revíselo aquí: ${enlaceSeguimiento(o, empresa.nombre, empresa.whatsapp)}`,
    'Para aprobarlo, responda *Apruebo* a este mensaje.',
  ].join('\n');
}

/** Mensaje de avance: qué se terminó, cuánto subió y el link para verlo. */
export function mensajeAvance(o: Orden, item: Item, antes: number, empresa: Pick<Empresa, 'nombre'>) {
  const v = `${o.vehiculo.marca} ${o.vehiculo.modelo}`;
  const ahora = progreso(o.items);
  return [
    saludo(o, empresa),
    `Su ${v} avanzó de ${antes}% a ${ahora}%: terminamos *${tituloItem(item, o.vehiculo.carroceria).toLowerCase()}*.`,
    item.nota ? `Nota del maestro: «${item.nota}».` : '',
    ahora === 100 ? 'Ya terminamos todos los trabajos. Le avisamos cuando esté listo para retirar.' : '',
    `Vea el avance, el auto en 3D y los detalles aquí: ${enlaceSeguimiento(o, empresa.nombre)}`,
  ].filter(Boolean).join('\n');
}
