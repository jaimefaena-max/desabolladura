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
const PROVEEDOR = 'https://api.boostr.cl/vehicle';
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

    if (!env.BOOSTR_KEY) return json({ error: 'el servicio no tiene clave configurada' }, 503, cabeceras);

    // Caché del borde: repetir una patente no gasta cuota del proveedor.
    const cache = caches.default;
    const clave = new Request(`https://patentes.invalid/${patente}`);
    const guardada = await cache.match(clave);
    if (guardada) {
      return new Response(guardada.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'hit', ...cabeceras } });
    }

    const r = await fetch(`${PROVEEDOR}/${patente}.json`, {
      headers: { 'X-API-KEY': env.BOOSTR_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    if (!r) return json({ error: 'no se pudo contactar el registro' }, 504, cabeceras);
    if (r.status === 404) return json({ encontrada: false }, 404, cabeceras);
    if (!r.ok) return json({ error: `el registro respondió ${r.status}` }, 502, cabeceras);

    const j = await r.json().catch(() => null);
    const d = j?.data;
    if (j?.status !== 'success' || !d) return json({ encontrada: false }, 404, cabeceras);

    // Se copian solo los datos del vehículo. Nombre, RUT o cualquier dato del propietario que
    // llegue en la respuesta NO sale de aquí: es dato personal y no hace falta para abrir una orden.
    const datos = {
      patente,
      marca: d.make || undefined,
      modelo: d.model || undefined,
      anio: Number(d.year) || undefined,
      tipo: d.type || undefined,
      motor: d.engine || undefined,
      chasis: d.vin || undefined,
      color: d.color || undefined,
    };

    const respuesta = new Response(JSON.stringify({ encontrada: true, datos }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${DIAS_CACHE * 86400}`,
      },
    });
    await cache.put(clave, respuesta.clone());
    return new Response(respuesta.body, { headers: { ...Object.fromEntries(respuesta.headers), 'X-Cache': 'miss', ...cabeceras } });
  },
};
