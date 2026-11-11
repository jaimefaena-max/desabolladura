# Consulta de patentes · intermediario

La demo de Desabolladura es un sitio estático (GitHub Pages): **cualquier clave que pongas en el
navegador queda publicada**. Este Worker de Cloudflare es la única pieza que tiene la clave; el
navegador solo habla con él.

```
navegador ──► worker (Cloudflare, gratis) ──► proveedor de patentes
              aquí vive la clave              api.boostr.cl
              aquí se borra el nombre y RUT del dueño
```

## Cómo se enciende (una vez)

```bash
cd infra/worker-patentes
npx wrangler login                 # abre el navegador, autoriza tu cuenta
npx wrangler secret put CLAVE_PATENTES # pega la clave de Boostr: no queda en ningún archivo
npx wrangler deploy
```

Al terminar imprime la dirección del servicio, del estilo
`https://patentes-zasa.TU-SUBDOMINIO.workers.dev`.

Después, en la raíz del repo, crea `.env.local` con esa dirección:

```
VITE_API_PATENTES=https://patentes-zasa.TU-SUBDOMINIO.workers.dev
```

y publica como siempre (`npm run build` + push a `main`). Sin esa variable la app funciona igual:
la consulta automática queda apagada y solo responde la patente de ejemplo.

## La clave

Se pide gratis en `https://api.boostr.cl/patente` (formulario; llega por correo). El plan gratuito
da **5 consultas diarias** y dura un mes. Para un taller en serio: créditos a **CLP 50 por
consulta** (mínimo CLP 10.000, no vencen) o **CLP 5.000/mes** por 50 consultas diarias.

Cada patente consultada queda cacheada 30 días en el borde: preguntar dos veces por el mismo auto
no gasta cuota.

## Comprobar que está vivo

```bash
curl -s https://patentes-zasa.TU-SUBDOMINIO.workers.dev/patente/DEMA44
# {"encontrada":true,"datos":{"patente":"DEMA44","marca":"SUZUKI","modelo":"SWIFT","anio":2019,...}}
```

## Límites puestos a propósito

- **Solo GET** y solo patentes con formato chileno válido.
- **Solo desde los orígenes de `ORIGENES`** (`wrangler.toml`): otro sitio no puede consumir tu cuota.
- **El propietario nunca sale de aquí.** Aunque el proveedor devuelva nombre y RUT, el Worker
  responde únicamente los datos del vehículo (marca, modelo, año, tipo, motor, chasis, color).
  Es dato personal bajo la Ley 19.628 y no hace falta para abrir una orden de trabajo.
- Si el proveedor falla o se acaba la cuota, respuesta de error explícita: la app cae al ingreso
  manual, nunca se queda en blanco.
