/**
 * Intermediario de consulta de patentes chilenas para la demo de Desabolladura.
 *
 * Para qué sirve: el sitio es estático y todo lo que llega al navegador es público. La clave del
 * proveedor de datos vive aquí, como secreto de Cloudflare, y el navegador solo habla con este
 * endpoint, que además filtra cualquier dato personal antes de responder.
 *
 * Deploy: ver README.md (4 comandos).
 */

const PATENTE = /^([A-Z]{4}\d{2}|[A-Z]{2}\d{4})$/;

/**
 * Proveedores soportados. Cambiar de uno a otro es una variable de entorno (`PROVEEDOR`), no
 * código: el día que uno tarde en dar la clave, se usa el otro.
 */
const PROVEEDORES = {
  boostr: {
    url: p => `https://api.boostr.cl/vehicle/${p}.json`,
    cabeceras: key => ({ 'X-API-KEY': key }),
    // {status:'success', data:{make, model, year, type, engine, vin, color}}
    datos: d => ({ marca: d.make, modelo: d.model, anio: d.year, tipo: d.type, motor: d.engine, chasis: d.vin, color: d.color }),
  },
  getapi: {
    url: p => `https://chile.getapi.cl/v1/vehicles/plate/${p}`,
    cabeceras: key => ({ 'x-api-key': key }),
    // Los nombres cambian según el proveedor: se aceptan las dos formas.
    datos: d => ({
      marca: d.make ?? d.marca, modelo: d.model ?? d.modelo, anio: d.year ?? d.anio,
      tipo: d.type ?? d.tipo, motor: d.engine ?? d.motor, chasis: d.vin ?? d.chasis, color: d.color ?? d.colorNombre,
    }),
  },
};

/** 30 días: el parque automotor no cambia de un día para otro y cada consulta se paga. */
const DIAS_CACHE = 30;

function json(cuerpo, estado, cors) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

/** Solo los orígenes declarados pueden usar el servicio: nadie más consume la cuota. */
function cors(request, env) {
  const origen = request.headers.get('Origin') || '';
  const permitidos = (env.ORIGENES || '').split(',').map(o => o.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': permitidos.includes(origen) ? origen : permitidos[0] || '',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const cabeceras = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cabeceras });
    if (request.method !== 'GET') return json({ error: 'solo GET' }, 405, cabeceras);

    const patente = (new URL(request.url).pathname.match(/^\/patente\/([A-Za-z0-9]+)$/)?.[1] || '').toUpperCase();
    if (!PATENTE.test(patente)) return json({ error: 'patente inválida; usa /patente/ABCD12' }, 400, cabeceras);

    const proveedor = PROVEEDORES[env.PROVEEDOR || 'boostr'] || PROVEEDORES.boostr;
    const apiKey = env.CLAVE_PATENTES;
    if (!apiKey) return json({ error: 'el servicio no tiene clave configurada' }, 503, cabeceras);

    // Caché del borde: repetir una patente no gasta cuota del proveedor.
    const cache = caches.default;
    const claveCache = new Request(`https://patentes.invalid/${patente}`);
    const guardada = await cache.match(claveCache);
    if (guardada) {
      return new Response(guardada.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'hit', ...cabeceras } });
    }

    const r = await fetch(proveedor.url(patente), {
      headers: { ...proveedor.cabeceras(apiKey), Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    if (!r) return json({ error: 'no se pudo contactar el registro' }, 504, cabeceras);
    if (r.status === 404) return json({ encontrada: false }, 404, cabeceras);
    if (!r.ok) return json({ error: `el registro respondió ${r.status}` }, 502, cabeceras);

    const j = await r.json().catch(() => null);
    const d = j?.data;
    if (!d) return json({ encontrada: false }, 404, cabeceras);

    // Se copian solo los datos del vehículo. Nombre, RUT o cualquier dato del propietario que
    // llegue en la respuesta NO sale de aquí: es dato personal y no hace falta para abrir una orden.
    const v = proveedor.datos(d);
    const datos = {
      patente,
      marca: v.marca || undefined,
      modelo: v.modelo || undefined,
      anio: Number(v.anio) || undefined,
      tipo: v.tipo || undefined,
      motor: v.motor || undefined,
      chasis: v.chasis || undefined,
      color: v.color || undefined,
    };
    if (!datos.marca && !datos.modelo) return json({ encontrada: false }, 404, cabeceras);

    const respuesta = new Response(JSON.stringify({ encontrada: true, datos }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${DIAS_CACHE * 86400}`,
      },
    });
    await cache.put(claveCache, respuesta.clone());
    return new Response(respuesta.body, { headers: { ...Object.fromEntries(respuesta.headers), 'X-Cache': 'miss', ...cabeceras } });
  },
};
