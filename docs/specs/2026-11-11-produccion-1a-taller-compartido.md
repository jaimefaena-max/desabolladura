---
titulo: Desabolladura en producción 1a — el taller trabaja de verdad: cuentas y órdenes compartidas entre PC y celular
fecha: 2026-11-11
repo: Workspace_Agencia/desabolladura
tamano: grande
estado: en-revision
sha:
linear: SOL-111
plano_maestro: docs/specs/2026-11-11-produccion-fase1.md
---

# Producción 1a — el taller trabaja de verdad

Este es el **primero de tres planos** en que se partió el plano maestro
`docs/specs/2026-11-11-produccion-fase1.md` (versión 4, ya revisado por 7 Peces). El maestro guarda
las decisiones comunes; **este plano manda** en todo lo que dice. Cuando este plano dice
«como en el maestro §X», se toma esa sección **tal cual** y solo para lo que este plano incluye.

| Plano | Qué entrega | Qué permite cobrar |
|---|---|---|
| **1a (este)** | Cuentas reales; órdenes compartidas entre el PC del administrador y el celular del maestro | El primer taller usa la app en su trabajo diario |
| 1b | Fotos en el servidor y portal del cliente en vivo (entra con patente y código, aprueba en línea) | El cliente final ve su auto con fotos desde cualquier teléfono |
| 1c | Supresión de clientes, purga por plazo, módulo de costos en el servidor | Cumplimiento completo de la Ley 21.719 y la rentabilidad real |

## 1. Problema y para quién

Hoy todo se guarda en el navegador de cada equipo (`src/lib/store.ts` sobre `localStorage`): lo que el
maestro registra en su celular no lo ve el administrador en su PC. Ningún taller puede usarla así.

Para quién: el **primer taller que pague**, con su administrador (PC) y uno o más maestros (celular).
El cliente final sigue recibiendo, como hoy, el link de seguimiento por WhatsApp.

## 2. Criterios de aceptación

- [ ] C1 — Hecho cuando una orden creada o cambiada en el equipo A aparece en el equipo B del mismo taller en ≤ 20 s sin recargar.
- [ ] C2 — Hecho cuando se entra a producción solo con correo y contraseña; toda ruta conocida y protegida de `/api/*` (todas salvo `POST /api/entrar`), pedida con su método y cabeceras correctos y sin sesión válida, responde 401; y la app lleva a `#/entrar`.
- [ ] C3 — Hecho cuando un usuario del taller X no puede leer, cambiar ni borrar nada del taller Y: cualquier id de otro taller responde 404. Probado contra el SQL real.
- [ ] C4 — Hecho cuando un maestro: (a) recibe 403 al cambiar montos, facturas, `cobrada`, pagador o costos de repuestos, al borrar órdenes y al editar el taller; (b) nunca recibe montos, rangos sugeridos, facturas, costos de repuestos, `costoHora`, `margenObjetivo` ni `cliente.rut`; (c) puede hacer todo lo que hoy hace su pantalla (§4.3).
- [ ] C5 — Hecho cuando los intentos de `POST /api/entrar` se limitan como en el maestro §7 (por IP, por correo desde una IP y por correo en total) y, pasado el tope, la respuesta es 429 aunque los datos sean correctos; mayúsculas y espacios en el correo no permiten saltarse el tope.
- [ ] C6 — Hecho cuando varios cambios seguidos del mismo equipo producen 0 conflictos; si otro equipo cambió la orden, la app reaplica los cambios propios y reintenta una vez; si vuelve a chocar, muestra «Otra persona cambió esta orden; revisa y vuelve a guardar» con la versión del servidor, sin pisar el cambio ajeno.
- [ ] C7 — Hecho cuando ningún endpoint que modifica acepta GET (405) y ninguna respuesta incluye `hash_clave`, tokens ni datos de otro taller.
- [ ] C8 — Hecho cuando la demo de GitHub Pages sigue igual: `npm test` y `npm run build` en modo demo, con las pruebas actuales sin editar sus expectativas, y sin llamadas a `/api/`.
- [ ] C9 — Hecho cuando `npm run build:produccion` **falla** si en `dist/` (HTML y JS publicados) aparece cualquier frase de la lista `FRASES_DEMO` (§4.1 `scripts/barrido-demo.ts`); y cuando producción no muestra, ni siquiera un instante antes de que arranque React: la portada de la demo (la estática de `index.html` y la de `Landing.tsx`), las tarjetas «Demo Administrador / Trabajador», la franja «Demostración», «La demostración no pudo cargar» / «restablecer la demostración», el campo de clave de Gemini, «Restablecer datos», crear/cambiar empresa, ni el módulo de costos; y sí muestra en Ajustes «Datos del taller» (WhatsApp, costo de una hora de maestro, margen objetivo).
- [ ] C10 — Hecho cuando `#/entrar` y el pie de la app enlazan `#/privacidad`, y `scripts/cuentas.ts alta` se niega a correr sin `--contrato-firmado AAAA-MM-DD`.
- [ ] C11 — Hecho cuando dar de baja o restablecer la contraseña de un usuario corta sus sesiones abiertas al instante (la siguiente petición con su cookie da 401).
- [ ] C12 — Hecho cuando el administrador borra una orden y los demás equipos dejan de verla en ≤ 20 s; el maestro recibe 403 si lo intenta.
- [ ] C13 — Hecho cuando el link de seguimiento por WhatsApp funciona igual que hoy (instantánea dentro del link, sin nombre, RUT, teléfono, motor ni chasis), con el dominio de producción, y se abre **sin sesión** sin desviarse a `#/entrar`; y `#/cliente` sin link dice «Abre el link que te envió tu taller por WhatsApp» (no busca en el equipo ni habla de un auto de prueba).
- [ ] C14 — Hecho cuando una foto tomada en un equipo se ve en ese equipo, y en otro equipo del taller aparece «Foto guardada en el equipo que la tomó» en vez de una imagen rota.
- [ ] C15 — Hecho cuando, en producción, ingresar una patente sin servicio de patentes configurado **nunca** rellena un vehículo ficticio: el maestro escribe marca, modelo y año a mano.
- [ ] C16 — Hecho cuando el link de avance que manda el **maestro** (no recibe montos) muestra el avance sin un presupuesto en $0: el portal dice «El presupuesto te lo envía el taller» en vez de la tabla de montos.

## 3. Alcance

**Entra:** servidor en Cloudflare Pages Functions + D1 (sin R2); cuentas de administrador y maestro con
cookie de sesión; órdenes y taller en el servidor; sincronización entre equipos; borrar orden; script de
cuentas `alta`, `baja`, `restablecer`; página `#/privacidad`; modo de compilación `demo` | `produccion`.

**No entra (va en 1b o 1c):**
- **Fotos en el servidor** → 1b. En 1a las fotos siguen en IndexedDB del equipo que las tomó (`src/lib/fotos.ts` sin cambios) y la orden guarda solo su id, como hoy (C14).
- **Portal del cliente en vivo** → 1b. En 1a el cliente sigue con el link de WhatsApp de hoy, de solo lectura; aprueba respondiendo el WhatsApp y el administrador lo registra en «Respuesta del cliente», como hoy (C13).
- `suprimir-cliente`, `purgar` y plazo de conservación → 1c (el borrado de una orden sí entra: C12).
- Módulo de costos (sueldos, boletas) → 1c; oculto en producción. En su lugar, Ajustes trae en producción la sección nueva **«Datos del taller»** (§4.1 `Admin.tsx`) con el costo de una hora de maestro (`Empresa.costoHora`, que `rentabilidad.ts:horaDe` ya usa primero), el margen objetivo (`Empresa.margenObjetivo`, que hoy solo se edita dentro de `Costos.tsx:125`) y el WhatsApp del taller.
- Gemini desde el servidor, cobro al taller, SII, recuperar contraseña por correo, trabajo sin conexión, registro público, varios talleres por usuario, migrar datos de la demo.

## 4. Diseño técnico

### 4.1 Ficheros

**Servidor**

| Ruta | Nuevo / cambia | Qué cambia |
|---|---|---|
| `functions/api/[[ruta]].ts` | nuevo | `export const onRequest: PagesFunction<Env> = ({ request, env }) => enrutar(request, env)` |
| `servidor/env.ts` | nuevo | `export interface Env { DB: D1Database }` (1b añade `FOTOS`) |
| `servidor/enrutador.ts` | nuevo | Tabla `método + ruta → manejador`; orden de comprobaciones de §4.3 |
| `servidor/sesion.ts` | nuevo | Cookie `dp_s` (`HttpOnly; Secure; SameSite=Strict; Path=/api`, 12 h deslizante; token 32 bytes en base64url, en la base solo su SHA-256). `exigirUsuario(rol?)` valida la sesión **y** `usuarios.activo = 1` en cada petición |
| `servidor/claves.ts` | nuevo | `hashClave`, `verificarClave` (PBKDF2-SHA256, sal de 16 bytes, comparación en tiempo constante), `HASH_FICTICIO`. Solo usa `crypto.subtle` y `TextEncoder` |
| `servidor/limite.ts` | nuevo | Como en el maestro §4.1 (`ClaveLimite`, `comprobarLimite`, `limpiarLimite`) |
| `servidor/validar.ts` | nuevo | `ID_ORDEN` (UUID v4), `CODIGO` (alfabeto de `store.ts:codigoCliente`), `normalizarCorreo`. Orden: tope 256 kB y rechazo de `"data:` → 422. Taller: tope 100 kB; `logo` solo `data:image/(png\|jpeg\|webp);base64,…` |
| `servidor/permisos.ts` | nuevo | `podarParaMaestro`, `podarEmpresaParaMaestro`, `validarAlta`, `fusionarCambioMaestro`, exactamente como en el maestro §4.3 «Permisos del maestro» y fila `POST /api/ordenes` |
| `servidor/base.ts` | nuevo | Interfaz `Base` + `baseD1(db)` con las funciones de §4.2 |
| `servidor/manejadores.ts` | nuevo | Un manejador por endpoint de §4.3 |
| `servidor/pruebas/sqliteD1.ts` | nuevo | Adaptador mínimo con la forma de `D1Database` (`prepare/bind/first/all/run`, `batch` en transacción) sobre `node:sqlite`, que aplica `migraciones/*.sql` |
| `servidor/pruebas/servidorFalso.ts` | nuevo | `crearServidorFalso(): { fetch: typeof fetch; db }`: `enrutar` real sobre `sqliteD1`, con un tarro de cookies; lo usan las pruebas de la app |
| `servidor/*.test.ts` | nuevo | §9 |
| `migraciones/0001_inicial.sql` | nuevo | §4.2 |
| `scripts/cuentas.ts` | nuevo | Subcomandos `alta`, `baja`, `restablecer` (§4.3). Se ejecuta con `node scripts/cuentas.ts …` (Node 24 ejecuta TypeScript, como `scripts/generar-autos-demo.ts`): importaciones con extensión `.ts`, solo sintaxis borrable. Funciones exportadas, puras salvo `main`: `sqlTexto(s: string): string` (comillas simples duplicadas; todo valor va por aquí); `sqlAlta(d: { taller: string; whatsapp?: string; admin: Persona; maestros: Persona[]; contratoFirmado: string; ahora: string; nuevoId: () => string; nuevaClave: () => string }): Promise<{ sql: string; temporales: { correo: string; clave: string }[] }>` con `Persona = { correo: string; nombre: string }`; `sqlBaja(correo: string): string`; `sqlRestablecer(correo: string, hashNuevo: string): string`; `main(argv: string[], ejecutar: Ejecutor = ejecutarWrangler): Promise<number>` con `Ejecutor = (args: string[]) => Promise<{ codigo: number; salida: string }>` (inyectable: las pruebas pasan uno falso y comprueban si se llamó). `ejecutarWrangler(args)` = `spawn('npx', ['wrangler', ...args], { shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'inherit'] })`, junta la salida estándar y resuelve `{ codigo, salida }` al cerrar (con `shell` en Windows, porque allí `npx` es un `.cmd`) |
| `infra/medicion-pbkdf2/index.ts`, `infra/medicion-pbkdf2/wrangler.toml` | nuevo | Worker desechable para el primer paso de §8: `export default { fetch: async () => { await hashClave(<16 bytes aleatorios en hex>); return new Response('ok') } }` (importa `../../servidor/claves.ts`). `wrangler.toml`: `name = "medicion-pbkdf2"`, `main = "index.ts"`, `compatibility_date = "2026-11-01"`. Sin base, sin usuarios y sin Pages: no choca con la compuerta de §6 |
| `scripts/cuentas.test.ts` | nuevo | §9 (C10, C11) |
| `wrangler.toml` | nuevo | `name = "desabolladura"`, `compatibility_date = "2026-11-01"`, `pages_build_output_dir = "dist"`; `[[d1_databases]]` `DB` → `desabolladura` con su `database_id` y `migrations_dir = "migraciones"`; `[env.preview]` con `desabolladura-preview` |
| `tsconfig.servidor.json` | nuevo | `compilerOptions`: `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `strict: true`, `noEmit: true`, `skipLibCheck: true`, `lib: ["ES2022"]`, `types: ["@cloudflare/workers-types"]`; `include: ["servidor", "functions", "infra/medicion-pbkdf2"]`, `exclude: ["servidor/pruebas", "**/*.test.ts"]` |
| `tsconfig.scripts.json` | nuevo | `compilerOptions`: las mismas que `tsconfig.servidor.json` salvo `types: ["node"]`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `allowImportingTsExtensions: true`; `include: ["scripts/cuentas.ts", "scripts/barrido-demo.ts"]` |
| `.node-version` | nuevo | `24` |

**Aplicación**

| Ruta | Nuevo / cambia | Qué cambia |
|---|---|---|
| `src/lib/modo.ts` | nuevo | `export const PRODUCCION = import.meta.env.MODE === 'produccion'` (modo de Vite; **no** un `.env`, que `.gitignore` ignora). Vite reemplaza `import.meta.env.MODE` por un texto fijo al compilar, así el minificador puede quitar las ramas de demo |
| `scripts/barrido-demo.ts` | nuevo | **Compuerta contra restos de la demo.** `export const FRASES_DEMO = ['demostración', 'Demostración', 'Demo Administrador', 'Demo Trabajador', 'datos ficticios', 'sin validez comercial', 'auto de prueba', 'patente de ejemplo', 'patentes de prueba', 'no ingreses datos reales', 'solo funciona en este mismo navegador', 'Restablecer datos']`; `export function barrer(textos: { fichero: string; contenido: string }[]): { fichero: string; frase: string }[]`; `main(dir = 'dist')` lee todos los `.html` y `.js` de `dist/`, imprime cada coincidencia (fichero + frase) y termina con código 1 si hay alguna. Corre al final de `build:produccion`. Si una frase sobrevive en código que solo usa la demo, el arreglo es envolver ese texto o esa rama en `if (!PRODUCCION)` / `PRODUCCION ? … : …` para que el minificador lo quite; **nunca** se quita una frase de `FRASES_DEMO` para que pase |
| `scripts/barrido-demo.test.ts` | nuevo | §9 (C9) |
| `src/lib/persistencia.ts` | nuevo | `crearApi(f: typeof fetch = fetch): Api` con `yo()`, `ordenes(desde?)`, `crearOrden(o)`, `guardarOrden(o, version)`, `borrarOrden(id)`, `guardarTaller(e)`, `entrar(correo, clave)`, `salir()`. Errores `ConflictoError` (409, con la orden actual), `NoAutorizadoError` (401), `ProhibidoError` (403, con el mensaje), `SinRedError` (sin red o 5xx) |
| `src/lib/sincronizador.ts` | nuevo | Como en el maestro §4.1 (`crearSincronizador`, sin lo de fotos ni cliente) y comportamiento del maestro §4.3 «Flujo de una edición», pasos 1-8 |
| `src/lib/rutas.ts` | nuevo | `destino(ruta, usuario): string \| null`, como en el maestro §4.1, más: en producción, una ruta **desconocida** (cualquiera que no sea `entrar`, `privacidad`, `cliente…`, `maestro…` o `admin…`) y la raíz `/` → `'/entrar'` sin usuario, `'/admin'` o `'/maestro'` con usuario según su rol; `cliente…` y `privacidad` → `null` con o sin sesión. En demo, `destino` devuelve `null` para la raíz y las desconocidas (siguen mostrando `Landing.tsx`, como hoy en `main.tsx:97`) |
| `src/lib/patentes.ts` | cambia | En producción, sin `SERVICIO` (línea 94), devuelve `{ estado: 'sin-servicio', motivo: 'Consulta de patentes no configurada' }` (el tipo `Consulta` ya tiene ese estado, `patentes.ts:18`) en vez del vehículo de prueba (`AUTO_DEMO` / `VEHICULOS_DEMO`); `NuevoVehiculo.tsx` con ese estado deja los campos vacíos para escribirlos a mano (C15). En demo, igual que hoy |
| `src/lib/seguimiento.ts` | cambia | `empaquetar` añade al paquete `sm: true` («sin montos») cuando algún item del presupuesto llega con `monto` ausente (`undefined`, la orden podada del maestro); `desempaquetar` lo devuelve como `sinMontos: boolean`. El resto, igual (C13) |
| `src/components/Errores.tsx` | cambia | En producción, `PantallaError` dice «Algo no cargó bien. Revisa tu conexión y recarga la página.», con «Recargar» y «Volver al inicio», y **sin** el botón de restablecer ni su `confirm` |
| `src/components/Cotizacion.tsx`, `src/components/Expediente.tsx` | cambia | En producción no imprimen «Documento de demostración · sin validez comercial» (líneas 58 y 65) |
| `src/pages/NuevoVehiculo.tsx` (además de `finalizar`) | cambia | En producción ocultan los textos y botones de demo (líneas 140, 306, 356, 402: aviso de que el código solo sirve en este navegador, patentes de prueba, «Probar con una patente de ejemplo») y manejan `sin-servicio` (C15) |
| `src/lib/avisoPrivacidad.ts` | nuevo | `export const AVISO_PRIVACIDAD: { titulo: string; parrafos: string[] }`; mientras no llegue el texto aprobado, un párrafo «Aviso en preparación» |
| `src/lib/store.ts` | cambia | Camino demo **sin tocar**. Ramas `if (PRODUCCION)`: arranque vacío, con `ordenes = []`, `usuario = null` y como empresa actual `EMPRESA_NEUTRA = { id: '', nombre: 'Desabolladura Premium', acento: ACENTO, whatsapp: '' }` (la usan `useEmpresa`, `aplicarMarca`, `Marca` y `Pie` antes de la sesión y en el link sin sesión; el portal del link usa además el nombre del taller que trae la instantánea, como hoy). Firmas: `cargarSesion(): Promise<'usuario' \| 'ninguna'>` (demo: resuelve al instante `'usuario'` si `sesion()` existe, si no `'ninguna'`; producción: `GET /api/yo` → si 200 guarda usuario, taller y usuarios, pide `GET /api/ordenes`, carga el sincronizador y arranca el sondeo, y resuelve `'usuario'`; si 401 resuelve `'ninguna'`; otro error → `'ninguna'` y aviso «No se pudo conectar»); `useUsuarios(): Usuario[]` (demo: `USUARIOS` de `seed.ts`; producción: los `usuarios` de `/api/yo`, `[]` sin sesión); `actualizar` → `sincronizador.cambiar`; `guardarOrden` de una orden nueva → `crearOrden`; `editarEmpresa` → empresa completa por la cola; nuevas `cargarSesion()`, `useUsuarios()`, `crearOrden`, `borrarOrden`, `entrar`, `salir` (borra la cookie y las claves `dp.*` de `localStorage`); `sesion()` devuelve el usuario cargado; `cerrarSesion()` limpia el estado y lanza `void salir()`. En los dos modos: `uid()` → `crypto.randomUUID()` y `codigoCliente()` con muestreo por rechazo (bytes ≥ 248 se descartan) |
| `src/lib/types.ts` | cambia | `Orden.version?: number`; `Usuario.correo?: string` |
| `src/lib/gemini.ts` | cambia | `claveGemini()` → `''` si `PRODUCCION` |
| `src/lib/costos.ts` | cambia | `costoHoraDelMes` → `undefined` si `PRODUCCION` |
| `src/components/ui.tsx` | cambia | Nuevo `export function FotoAusente({ alt }: { alt: string })`: el recuadro que hoy dibuja `FotoGuardada` cuando la foto no está (línea 213), con el texto «Foto guardada en el equipo que la tomó» si `PRODUCCION` y «Foto en el sistema del taller» (el de hoy) si no. `FotoGuardada` lo usa cuando `leerFoto` no la encuentra y también en `onError` del `<img>`. Nuevo `export function Pie()`: `<footer className="pie-app">` con el enlace `#/privacidad` y el nombre del taller |
| `index.html` | cambia | La portada estática (`<div class="estatico">`, con su franja y sus botones de demo) y la línea «restablecer la demostración» del bloque `#rescate` van entre los comentarios `<!--solo-demo-->` y `<!--/solo-demo-->`. El título de `#rescate` pasa a «La app no pudo cargar» (vale para los dos modos). El script en línea no cambia (su huella para la CSP sigue igual) |
| `src/lib/indexHtml.ts` | nuevo | `export function adaptarIndex(html: string, modo: string): string`: en `produccion` borra todo lo que hay entre `<!--solo-demo-->` y `<!--/solo-demo-->` (marcadores incluidos); en demo devuelve el HTML igual. La usa `vite.config.ts` en `transformIndexHtml` con `order: 'pre'` |
| `src/App.tsx` | nuevo | `export function App()` con `Rutas`, `Guardia`, `Franja` y `Cargando`, **movidos** desde `main.tsx` sin cambiar su comportamiento en demo (así las pruebas pueden importarlos: `main.tsx` llama a `createRoot` al importarse). En producción: ruta `/privacidad`; `Cargando` hasta que resuelve `cargarSesion()`; `Guardia` y la raíz con `destino()` (`/` no muestra `Landing.tsx`); sin `Franja`; `Pie` debajo de cada pantalla |
| `src/main.tsx` | cambia | Queda solo con la precarga y `createRoot(…).render(<App />)` |
| `src/pages/Login.tsx` | cambia | En producción: formulario correo + contraseña y enlace a `#/privacidad`; en demo: las tarjetas de hoy |
| `src/pages/Privacidad.tsx` | nuevo | Muestra `AVISO_PRIVACIDAD` |
| `src/pages/Cliente.tsx` | cambia | Solo en producción: `ClienteAcceso` (`#/cliente`, sin link) y `ClientePortal` sin instantánea ni sesión de usuario muestran «Abre el link que te envió tu taller por WhatsApp», sin formulario. Con instantánea (link de WhatsApp) o con sesión de usuario («Ver como cliente» del administrador), igual que hoy, salvo: si la instantánea trae `sinMontos`, en vez de la sección «Tu presupuesto» y los totales muestra «El presupuesto te lo envía el taller» (C16). El link con montos lo sigue mandando el administrador al enviar el presupuesto (`Admin.tsx:366`) |
| `src/pages/NuevoVehiculo.tsx` | cambia | En producción `finalizar` espera `crearOrden(o)` y muestra número y código **de la respuesta** |
| `src/pages/Maestro.tsx` | cambia | `aplicar` (línea 73) → `actualizar(id, x => construir(x))`, como en el maestro §4.1 |
| `src/pages/Admin.tsx` | cambia | En `Ajustes` (líneas 636-706), en producción: oculta «Datos de ejemplo» (Restablecer datos), «Empresas», «Conectar Gemini» y `<Costos />`, y añade la tarjeta **«Datos del taller»** con tres campos que guardan con `editarEmpresa`: «WhatsApp del taller» (`whatsapp`), «Costo de una hora de maestro» (`costoHora`, muestra `COSTO_HORA_DEFECTO` si está vacío) y «Margen objetivo (%)» (`margenObjetivo`, 0-90, como hoy en `Costos.tsx:126`); el maestro de la orden sale de `useUsuarios()` (línea 575); botón «Eliminar orden» (con confirmación); `enviar` (línea 366) y `aplicar` (línea 418) con funciones que calculan sobre la orden recibida, como en el maestro §4.1 |
| `src/lib/sinOrdenFija.test.ts` | nuevo | Falla si algún `src/**/*.tsx` contiene `actualizar(<id>, () =>` |
| `src/lib/sincronizador.test.ts`, `src/lib/rutas.test.ts`, `src/lib/demoSinApi.test.ts`, `src/lib/indexHtml.test.ts`, `src/humo.produccion.test.tsx` | nuevo | §9 |
| `tsconfig.json` | cambia | `exclude` añade `src/lib/sincronizador.test.ts` y `src/humo.produccion.test.tsx` (importan `servidor/`); vitest los corre igual |
| `vite.config.ts` | cambia | `base` = `/` en `produccion`, `/desabolladura/` en demo; en `produccion` sin CSP por `<meta>`: `closeBundle` lee `dist/index.html`, calcula las huellas de sus scripts en línea como hoy `transformIndexHtml`, y escribe `dist/_headers` con la CSP (sin `https://generativelanguage.googleapis.com`; con el origen de `VITE_API_PATENTES`) más `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy: camera=(self)`, `X-Frame-Options: DENY`. `test.include` = `src/**/*.test.{ts,tsx}`, `servidor/**/*.test.ts`, `scripts/**/*.test.ts` |
| `package.json` | cambia | `build:produccion`: `tsc --noEmit && tsc -p tsconfig.servidor.json --noEmit && tsc -p tsconfig.scripts.json --noEmit && vite build --mode produccion && node scripts/barrido-demo.ts dist`; `cuentas`: `node scripts/cuentas.ts`; devDependencies `wrangler`, `@cloudflare/workers-types`, `@types/node` |
| `infra/worker-patentes/wrangler.toml` | cambia | Añadir `https://<proyecto>.pages.dev` a `ORIGENES` (§6 paso 5) |
| `.github/workflows/deploy.yml` | **no cambia** | Sigue publicando la demo |
| `src/lib/fotos.ts`, `src/lib/vistas.ts` | **no cambian** | Fotos locales como hoy (C14). `enlaceSeguimiento` ya arma el link con `location.origin + location.pathname`, que en producción es el dominio de Pages |

### 4.2 Datos, tipos y firmas

```sql
CREATE TABLE talleres (id TEXT PRIMARY KEY, datos TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0,
  contrato_firmado TEXT NOT NULL,             -- fecha AAAA-MM-DD de --contrato-firmado: evidencia del encargo
  creado TEXT NOT NULL);
CREATE TABLE usuarios (
  id TEXT PRIMARY KEY, taller_id TEXT NOT NULL REFERENCES talleres(id),
  correo TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin','maestro')), cargo TEXT NOT NULL DEFAULT '',
  hash_clave TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1, creado TEXT NOT NULL);
CREATE TABLE sesiones (
  token_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, taller_id TEXT NOT NULL,
  expira TEXT NOT NULL, creado TEXT NOT NULL);
CREATE TABLE ordenes (
  id TEXT NOT NULL, taller_id TEXT NOT NULL REFERENCES talleres(id),
  numero INTEGER NOT NULL, patente TEXT NOT NULL, codigo TEXT NOT NULL, entregada TEXT,
  datos TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, seq INTEGER NOT NULL,
  PRIMARY KEY (taller_id, id), UNIQUE (taller_id, numero));
CREATE INDEX ordenes_seq ON ordenes (taller_id, seq);
CREATE TABLE borradas (taller_id TEXT NOT NULL, orden_id TEXT NOT NULL, seq INTEGER NOT NULL);
CREATE TABLE intentos (clave_hash TEXT NOT NULL, fecha TEXT NOT NULL);
CREATE INDEX intentos_clave ON intentos (clave_hash, fecha);
```

- `seq`, número de orden, id de orden y `intentar`: como en el maestro §4.2.
- **`Base`**: `taller(id)`, `guardarTaller(id, datos)`, `usuarioPorCorreo(correo)`, `usuario(id)`, `usuariosDe(tallerId)`, `crearSesion(s)`, `sesion(tokenHash)`, `tocarSesion(tokenHash, expira)`, `borrarSesion(tokenHash)`, `borrarSesionesDe(usuarioId)`, `ordenesDe(tallerId, desdeSeq, soloVigentes)`, `orden(tallerId, id)`, `crearOrden(tallerId, orden) → { numero, version, seq } | 'existe'`, `guardarOrden(tallerId, orden, versionBase) → { version, seq } | 'conflicto'`, `borrarOrden(tallerId, id) → boolean`, `borradasDesde(tallerId, desdeSeq)`, `seqActual(tallerId)`, `intentar(claves) → boolean`, `limpiarIntentos(hash)`. Todas las de datos del taller filtran por `taller_id`.

### 4.3 Endpoints y reglas

Orden de comprobaciones: como en el maestro §4.3 (pasos 1-10; los pasos de cliente y fotos no aplican).
Toda mutación exige `Origin` del propio sitio y `Content-Type: application/json`.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/entrar` | público | Como en el maestro §4.3 |
| `POST /api/salir` | usuario | Borra la sesión y la cookie |
| `GET /api/yo` | usuario | `{usuario, taller, usuarios}`; al maestro, `podarEmpresaParaMaestro` y `usuarios` sin correo |
| `GET /api/ordenes?desde=<seq>` | usuario | Como en el maestro §4.3 (`{ordenes, borradas, hasta, taller}`; al maestro solo vigentes y podadas) |
| `POST /api/ordenes` | usuario | Como en el maestro §4.3 (`validarAlta`) |
| `PUT /api/ordenes/:id` | usuario | Como en el maestro §4.3 (409 primero; admin sin cambiar `id`, `numero`, `codigo`; maestro con `fusionarCambioMaestro`) |
| `DELETE /api/ordenes/:id` | admin | Borra la fila y registra `borradas` (en 1a no hay fotos en el servidor que borrar) |
| `PUT /api/taller` | admin | Empresa completa, con la validación de taller |

**Scripts** (`node scripts/cuentas.ts …`, los corre Jaime): `alta`, `baja` y `restablecer`, exactamente como en
el maestro §4.3 «Scripts de cuentas», con `--simular`.

## 5. Alternativas consideradas

Las del maestro §5, más:

| Alternativa | Por qué no |
|---|---|
| Hacer 1a con fotos en el servidor | Las fotos suman R2, permisos del cliente y borrado de objetos: es la mitad del riesgo del maestro. El taller puede trabajar sin ver en el PC las fotos del celular; el cliente ya recibe el avance por WhatsApp |
| Cortar por capas («primero todo el servidor, luego la app») | Ninguna capa sola se puede usar ni cobrar. Cada plano debe dejar algo que el taller use |

## 6. Ruta a producción

Como en el maestro §6, sin los pasos de R2. Resumen para Jaime:
1. `npx wrangler d1 create desabolladura --location enam` y `npx wrangler d1 create desabolladura-preview --location enam`; los `database_id` a `wrangler.toml` (commit).
2. `npx wrangler d1 migrations apply desabolladura --remote` y `npx wrangler d1 migrations apply desabolladura-preview --remote --env preview`.
3. **Compuerta legal** (maestro §7): aviso de privacidad aprobado y contrato de encargo firmado con el taller.
4. Conectar el proyecto de Cloudflare Pages (compilación `npm ci && npm test && npm run build:produccion`, salida `dist`, Node 24 por `.node-version`, variable `VITE_API_PATENTES`). Desde aquí **un push a `main` publica producción y la demo**.
5. Añadir `https://<proyecto>.pages.dev` a `ORIGENES` del Worker de patentes, commit, `npx wrangler deploy`.
6. `npm run cuentas -- alta --taller "…" --admin "correo:Nombre" --maestro "correo:Nombre" --contrato-firmado AAAA-MM-DD`.

## 7. Seguridad y datos

Como en el maestro §7, en lo que aplica a 1a: mutaciones sin GET; rate limit de `/api/entrar`; CSRF;
aislamiento por taller; contraseñas; datos personales (el administrador ve todo lo de su taller; el
maestro sin RUT ni datos económicos y solo órdenes vigentes); D1 con `location hint` `enam` (transferencia
internacional declarada en el aviso y el contrato); taller responsable y agencia encargada; registros solo
con ids; `salir()` limpia `dp.*`; compuerta legal antes del paso 4 de §6.

**Propio de 1a:** las fotos siguen en el equipo que las tomó (IndexedDB), igual que en la demo; el link de
WhatsApp no cambia y ya excluye nombre, RUT, teléfono, motor y chasis (`seguimiento.ts:10-12`). La supresión
completa de un cliente (`suprimir-cliente`) llega en 1c; mientras, el administrador borra sus órdenes una a una (C12).

## 8. Riesgos y rollback

| Riesgo | Mitigación |
|---|---|
| Romper la demo al tocar `store.ts` | Camino demo sin tocar; pruebas actuales sin editar sus expectativas (C8) |
| PBKDF2 supera los 10 ms de CPU del plan gratuito | **Primer paso de la implementación**, con el Worker desechable `infra/medicion-pbkdf2` (no usa Pages, base ni usuarios): Jaime corre `cd infra/medicion-pbkdf2 && npx wrangler deploy`, se llama 20 veces a su dirección `workers.dev`, se lee el tiempo de CPU (mediana y p99) en el panel de Cloudflare → Workers → `medicion-pbkdf2` → Métricas, y se borra con `npx wrangler delete`. El límite de CPU es el mismo para Workers y Pages Functions. Si pasa de 10 ms, decide Jaime: Workers Paid (USD 5/mes, recomendado) o bajar iteraciones |
| El administrador espera ver en el PC las fotos que tomó el maestro | C14 lo dice en pantalla; llega en 1b. Se explica al vender |
| Equipo sin red | No se guarda sin conexión: revierte y avisa |
| Push a `main` publica demo y producción a la vez | Escrito en §6; las pruebas corren en las dos compilaciones |

Rollback: como en el maestro §8 (Pages vuelve a un despliegue anterior con un clic; D1 Time Travel 30 días;
la migración solo crea tablas; `ORIGENES` se revierte con commit + `wrangler deploy`).

## 9. Plan de pruebas

Infraestructura de pruebas como en el maestro §9 (servidor real sobre `sqliteD1`; `vi.stubEnv('MODE', 'produccion')` + `vi.resetModules()` + `await import`).

| Criterio | Prueba |
|---|---|
| C1 | `sincronizador.test.ts`: dos instancias sobre el mismo `servidorFalso`; un cambio en una aparece en la otra en el siguiente sondeo (temporizadores falsos, ≤ 15 s). `servidor/ordenes.test.ts`: `desde=<seq>` devuelve lo escrito después |
| C2 | `servidor/sesion.test.ts`: sin cookie, vencida o alterada → 401 en cada ruta protegida. `rutas.test.ts`: `destino('/admin', null)` y `destino('/maestro', admin)` → `'/entrar'`; en producción `destino('/', null)` → `'/entrar'`. `humo.produccion.test.tsx`: `cargarSesion()` con 401 → `'ninguna'`; `Login` con formulario. `sincronizador.test.ts`: 401 en el sondeo → `alPerderSesion` |
| C3 | `servidor/aislamiento.test.ts`: dos talleres; GET, PUT y DELETE con id ajeno → 404; POST con un id que existe en otro taller → 201 (no confirma nada) |
| C4 | `servidor/permisos.test.ts`, igual que el maestro §9 C4 (a), (b) y (c), **incluido** «foto nueva en `fotos[]`» (en 1a es solo una referencia dentro de la orden) y **sin** «cambiar el código» (esa ruta no existe en 1a) |
| C5 | `servidor/limite.test.ts`: 5 fallos desde una IP con el mismo correo → el 6.º correcto da 429; mayúsculas y espacios cuentan como el mismo correo; 30 intentos desde una IP con correos distintos → el 31.º da 429; 20 simultáneas → como máximo 5 pasan; un acierto limpia; 50 fallos desde IP distintas bloquean ese correo |
| C6 | `sincronizador.test.ts`: dos `actualizar` seguidos → 0 conflictos; 409 con cambio ajeno → reaplica y reintenta; segundo 409 → aviso y versión del servidor; error de red → vuelve a `confirmada`. `servidor/ordenes.test.ts`: PUT viejo de un maestro → 409 (no 403). `sinOrdenFija.test.ts` en verde |
| C7 | `servidor/enrutador.test.ts`: GET a cada ruta mutativa → 405; ninguna respuesta contiene `hash_clave` ni `token` |
| C8 | `npm test` y `npm run build` en demo sin editar expectativas; `demoSinApi.test.ts`: con `fetch` espiado, entrar como administrador y maestro, crear y cambiar una orden → ninguna URL con `/api/` |
| C9 | `barrido-demo.test.ts`: `barrer` encuentra cada frase de `FRASES_DEMO` metida en un `.js` de prueba y no da falsos positivos en un texto limpio; `main` sobre una carpeta temporal con una frase termina con código 1. La compuerta real corre en cada `build:produccion` (y por eso en cada despliegue de Pages). `rutas.test.ts`: en producción `destino('/xyz', null)` → `'/entrar'` y `destino('/xyz', admin)` → `'/admin'`; en demo → `null`. `indexHtml.test.ts`: `adaptarIndex(<index.html real>, 'produccion')` no contiene «Demostración», «Probar la demo», «Ver un seguimiento», «restablecer la demostración» ni `class="estatico"`, y conserva intacto el `<script>` en línea; en demo devuelve el HTML igual. `humo.produccion.test.tsx` (con `location` y `addEventListener` simulados con `vi.stubGlobal`): `renderToString(<App />)` sin «Demostración» (y en demo, como control, con ella); `Login` sin «Demo Administrador»; `destino('/', …)` nunca devuelve la portada; `Ajustes` sin «Conectar Gemini», «Restablecer datos», «Empresas» ni costos, y con «Datos del taller» y sus tres campos |
| C10 | `humo.produccion.test.tsx`: `Login` y `Pie` contienen `href="#/privacidad"`. `cuentas.test.ts`: `main(['alta', …sin --contrato-firmado], ejecutarFalso)` devuelve código ≠ 0 y `ejecutarFalso` no se llamó; con él, `talleres.contrato_firmado` queda con la fecha |
| C11 | `cuentas.test.ts`: SQL de `sqlBaja` y `sqlRestablecer` sobre `sqliteD1` → la cookie anterior da 401 con los manejadores reales; `sesion.test.ts`: `activo = 0` → 401 |
| C12 | `servidor/ordenes.test.ts`: DELETE de admin → la orden aparece en `borradas`; maestro → 403. `sincronizador.test.ts`: la borrada desaparece del otro equipo en el siguiente sondeo |
| C13 | `seguimiento.test.ts` (existente) sigue en verde sin cambios. `rutas.test.ts`: `destino('/cliente/X/Y', null)`, `destino('/cliente/X', null)` y `destino('/cliente', null)` → `null` (sin sesión no se desvía a `#/entrar`). `humo.produccion.test.tsx`: `ClientePortal` con una instantánea real de `empaquetar` y sin sesión dibuja la orden; `ClienteAcceso` dice «Abre el link que te envió tu taller por WhatsApp» y no «auto de prueba» |
| C14 | `humo.produccion.test.tsx`: `renderToString(<FotoAusente alt="x" />)` contiene «Foto guardada en el equipo que la tomó» en producción y «Foto en el sistema del taller» en demo. Que `FotoGuardada` llegue a `FotoAusente` cuando `leerFoto` no encuentra la foto se comprueba en la prueba manual (efecto de React, que `renderToString` no ejecuta) |
| C15 | `patentes.test.ts` (existente, más casos): en producción sin `SERVICIO`, `consultarPatente('DEMA22')` → `estado: 'sin-servicio'` y nunca `datos` (tampoco desde la memoria `dp.patentes` si guarda un vehículo de prueba); en demo, igual que hoy |
| C16 | `seguimiento.test.ts` (más casos): `empaquetar` de una orden podada (items sin `monto`) → `desempaquetar(…).sinMontos === true`; de una orden completa → `false`. `humo.produccion.test.tsx`: `ClientePortal` con una instantánea `sinMontos` en `aprobacion: 'enviada'` muestra «El presupuesto te lo envía el taller» y no «Tu presupuesto» |
| Otros | 256 kB + 1 → 413; con `"data:` → 422; id repetido en el mismo taller → 409; logo `data:image/png;base64,…` → 200 y `data:text/html,…` → 400; maestro crea orden con monto → 403 y sin montos → 201 con su `codigo` y un `numero` del servidor |
| Todos | Prueba manual con `npx wrangler pages dev dist` y dos navegadores (administrador y maestro): crear, cambiar y borrar órdenes en uno y verlas en el otro; una foto tomada en el maestro muestra en el administrador «Foto guardada en el equipo que la tomó»; recargar en `/` no deja ver ningún texto de la demo |

## Decisiones de Jaime (con su valor por defecto)

| Decisión | Por defecto | Cuándo |
|---|---|---|
| Plan de Cloudflare si el inicio de sesión supera 10 ms de CPU | Workers Paid, USD 5/mes | Tras la medición del primer paso |
| Texto del aviso de privacidad y contrato de encargo | Los redacta Nacho, los aprueba Jaime | Antes del paso 4 de §6 |

## Registro de revisión (Peces)

Hereda las respuestas del registro del plano maestro (rondas 1 a 3) en lo que aplica a 1a.

| Ronda | Pez | Severidad | Hallazgo (§) | Respuesta |
|---|---|---|---|---|
| 1 | Go/No-Go (NO-GO) | — | §4.1 `index.html` trae la portada estática de la demo (C9) | Aceptado: marcadores `<!--solo-demo-->` + `adaptarIndex` en `transformIndexHtml`; prueba con el `index.html` real |
| 1 | Go/No-Go | — | §4.1 el «pie de la app» no existe (C10) | Aceptado: `Pie` en `ui.tsx`, dibujado por `App` debajo de cada pantalla |
| 1 | Go/No-Go | — | §3 no hay dónde escribir `costoHora`, `margenObjetivo` ni el WhatsApp en producción | Aceptado: tarjeta «Datos del taller» en Ajustes |
| 1 | Go/No-Go | — | §9 C14 no se puede probar con `renderToString` | Aceptado: `FotoAusente` aparte y probada; el paso por el efecto, en la prueba manual |
| 1 | Go/No-Go | — | §9 C9 `Franja` vive en `main.tsx`, que no se puede importar | Aceptado: `App.tsx` aparte; `main.tsx` solo monta |
| 1 | Go/No-Go | — | §9 C13 no probaba abrir el link sin sesión | Aceptado: casos de `destino` y de `ClientePortal` con instantánea real |
| 1 | Go/No-Go | — | §6/§8 medir PBKDF2 exigía un proyecto de Pages antes de la compuerta | Aceptado: Worker desechable `infra/medicion-pbkdf2`, sin Pages ni base |
| 1 | Go/No-Go | MENOR | §4.1 firmas de `cuentas.ts` y ejecutor no inyectable | Aceptado: firmas escritas, `Ejecutor` inyectable, `sqlTexto`, `contrato_firmado` en `talleres` |
| 1 | Go/No-Go | MENOR | §4.1 `ClienteAcceso` en producción hablaba de un auto de prueba y buscaba en el equipo | Aceptado: mensaje «Abre el link…»; `Cliente.tsx` pasa a «cambia» |
| 2 | Go/No-Go 2 (NO-GO) | — | §4.1 `Errores.tsx`, `Cotizacion.tsx`, `Expediente.tsx`, `NuevoVehiculo.tsx` con textos de demo (C9) | Aceptado, y **de raíz**: además de corregir esos ficheros, `scripts/barrido-demo.ts` hace fallar `build:produccion` si queda cualquier frase de demo en `dist/`. Hay frases de demo en 15 ficheros; enumerarlos no basta |
| 2 | Go/No-Go 2 | — | §2 C13 frente a C4(b): el link de avance del maestro sale sin montos | Decidido (Elefante, por delegación de Jaime del 11-nov): se acepta que el link del maestro no traiga montos y el portal lo dice (C16); el presupuesto con montos lo manda el administrador. En 1b el portal en vivo lo resuelve |
| 2 | Go/No-Go 2 | — | §4.1 `patentes.ts` rellena un vehículo ficticio sin servicio configurado | Decidido: en producción nunca; ingreso a mano (C15). La clave de Boostr sigue pendiente |
| 2 | Go/No-Go 2 | — | §4.1 `cargarSesion`, `useUsuarios` y la empresa antes de la sesión sin definir | Aceptado: firmas, comportamiento y `EMPRESA_NEUTRA` |
| 2 | Go/No-Go 2 | — | §4.1 rutas desconocidas mostraban la portada de demo | Aceptado: `destino` las manda a `#/entrar` o al tablero del rol; prueba |
| 2 | Go/No-Go 2 | MENOR | `tsconfig`, `ejecutarWrangler`, `wrangler.toml` del Worker de medición, `compatibility_date`; C4 ambigua | Aceptado: escritos en §4.1 y §9 |

## Desvíos durante la implementación

- (ninguno aún)
