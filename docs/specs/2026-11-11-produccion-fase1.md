---
titulo: Desabolladura en producción, fase 1 — servidor, cuentas reales y datos compartidos entre equipos
fecha: 2026-11-11
repo: Workspace_Agencia/desabolladura
tamano: grande
estado: maestro
version_plano: 4
dividido_en: docs/specs/2026-11-11-produccion-1a-taller-compartido.md (1a), 1b y 1c por escribir
sha:
linear: SOL-111
---

# Desabolladura en producción, fase 1

## 1. Problema y para quién

Hoy Desabolladura es una demo: todo se guarda en el navegador de cada equipo
(`src/lib/store.ts` sobre `localStorage`, fotos en IndexedDB vía `src/lib/fotos.ts`). Un taller real
no puede usarla: lo que el maestro registra en su celular no lo ve el administrador en su PC, el
cliente solo ve su auto si abre el portal en el mismo navegador del taller, y no hay cuentas: se
entra con un botón (`src/pages/Login.tsx` → `entrarDemo`).

Para quién: el **primer taller que pague**. Sus tres perfiles: administrador (PC), maestro (celular)
y cliente final (celular, desde el link de WhatsApp).

## 2. Criterios de aceptación

- [ ] C1 — Hecho cuando una orden creada o cambiada por el maestro en el equipo A aparece en el tablero del administrador en el equipo B en ≤ 20 s sin recargar.
- [ ] C2 — Hecho cuando se entra a la versión de producción solo con correo y contraseña; sin sesión válida, toda ruta conocida y protegida de `/api/*` (todas salvo `POST /api/entrar` y `POST /api/cliente/entrar`), pedida con su método y cabeceras correctos, responde 401, y la app lleva a `#/entrar`.
- [ ] C3 — Hecho cuando un usuario del taller X no puede leer ni modificar nada del taller Y: cualquier petición con un id de otro taller responde 404 (no 403, para no confirmar que existe). Probado contra el SQL real.
- [ ] C4 — Hecho cuando un maestro: (a) recibe 403 al intentar acciones de administrador (editar el taller, borrar órdenes, cambiar montos, facturas, cobro, pagador, costos de repuestos); (b) nunca recibe en ninguna respuesta montos, rangos sugeridos, facturas, costos, `costoHora`, `margenObjetivo` ni `cliente.rut`; (c) sí puede hacer todo lo que hoy hace la pantalla del maestro (§4.3 «Permisos del maestro»).
- [ ] C5 — Hecho cuando el cliente final entra con patente + código desde cualquier teléfono; recibe solo los campos de `podarParaCliente` (§4.3; sin RUT, teléfono, motor, chasis, costos, rangos sugeridos, horas, notas internas, historial ni facturas); y su única escritura posible es aprobar o rechazar el presupuesto cuando `aprobacion === 'enviada'` y `pagador.tipo === 'particular'` (con seguro aprueba la compañía; misma regla que hoy aplica `Cliente.tsx:187`).
- [ ] C6 — Hecho cuando los intentos de entrada se limitan según §7 (por IP, por correo/patente desde una IP y por correo/patente en total) y, pasado el tope, la respuesta es 429 aunque los datos sean correctos; mayúsculas, espacios o guiones no permiten saltarse el tope.
- [ ] C7 — Hecho cuando: (a) varios cambios seguidos del mismo equipo sobre una orden producen 0 conflictos; (b) si otro equipo cambió la orden, la app reaplica los cambios propios sobre la versión nueva y reintenta una vez; (c) si vuelve a chocar, muestra «Otra persona cambió esta orden; revisa y vuelve a guardar» con la versión del servidor, sin pisar el cambio ajeno.
- [ ] C8 — Hecho cuando las fotos (avance, antes/después, vistas del modelo) se suben al servidor y se ven desde cualquier equipo del taller, y el cliente ve las que su orden referencia; nadie más puede bajarlas, y nadie puede sobrescribir una foto existente.
- [ ] C9 — Hecho cuando ningún endpoint que modifica estado acepta GET (405) y ninguna respuesta incluye `hash_clave`, tokens de sesión ni datos de otro taller.
- [ ] C10 — Hecho cuando la demo de GitHub Pages sigue funcionando igual: `npm test` y `npm run build` en modo demo, con las pruebas actuales sin editar sus expectativas, y sin llamadas a `/api/`.
- [ ] C11 — Hecho cuando la versión de producción no tiene la entrada «Demo Administrador / Trabajador», ni la franja «Demostración», ni el campo de clave de Gemini, ni «Restablecer demo», ni crear/cambiar empresa, ni el módulo de costos (sueldos y boletas).
- [ ] C12 — Hecho cuando la entrada del cliente y el pie de la app enlazan `#/privacidad`, y `scripts/cuentas.ts alta` se niega a correr sin `--contrato-firmado AAAA-MM-DD`.
- [ ] C13 — Hecho cuando dar de baja o restablecer la contraseña de un usuario corta sus sesiones abiertas al instante (la siguiente petición con su cookie da 401).
- [ ] C14 — Hecho cuando borrar una orden (administrador) o suprimir a un cliente (script) borra sus filas y las fotos que ninguna otra orden referencia, y los demás equipos dejan de verla en ≤ 20 s.

## 3. Alcance

**Entra:**
- Servidor en Cloudflare Pages Functions con base D1 (SQLite) y fotos en R2, mismo origen que la app.
- Cuentas reales (administrador y maestro) con correo y contraseña; sesión por cookie.
- Entrada del cliente final con patente + código, validada en el servidor.
- Órdenes, taller (empresa) y fotos guardados en el servidor y compartidos entre equipos.
- Script de cuentas (alta, baja, restablecer, suprimir cliente, purgar) que corre la agencia.
- Borrar una orden (administrador).
- Página `#/privacidad` y su enlace (el texto legal lo redacta Nacho y lo aprueba Jaime; ver §7).
- Modo de compilación `demo` | `produccion`: la demo actual queda intacta.

**No entra (fases siguientes):**
- Gemini desde el servidor. En producción las funciones de IA usan su camino sin clave: OCR local, tabla de precios, 3D por carrocería.
- **Módulo de costos** (sueldos con nombre, boletas, gastos e insumos de `src/lib/costos.ts` / `src/components/Costos.tsx`): oculto en producción. El costo por hora se escribe a mano en Ajustes (`Empresa.costoHora`) y `rentabilidad.ts:horaDe` ya lo usa primero.
- Cobro al taller (suscripción), facturación electrónica SII, registro público de talleres.
- Recuperar contraseña por correo (la agencia la restablece con el script).
- Trabajo sin conexión. Sin red, la app avisa y no guarda.
- Purga automática programada (Pages Functions no tiene tareas programadas): la purga se corre a mano con el script, una vez al mes.
- Migrar datos de la demo: producción empieza vacía.
- Varios talleres por usuario.

## 4. Diseño técnico

### 4.1 Ficheros

**Servidor**

| Ruta | Nuevo / cambia | Qué cambia |
|---|---|---|
| `functions/api/[[ruta]].ts` | nuevo | `export const onRequest: PagesFunction<Env> = ({ request, env }) => enrutar(request, env)` |
| `servidor/env.ts` | nuevo | `export interface Env { DB: D1Database; FOTOS: R2Bucket }`. Del bucket, los manejadores solo usan `put(clave, cuerpo, { httpMetadata: { contentType } })`, `get(clave)` (con `body` y `httpMetadata.contentType`) y `delete(claves: string[])` |
| `servidor/pruebas/r2Memoria.ts` | nuevo | Doble de R2 en memoria con esos tres métodos y un `Map` consultable desde las pruebas («R2 sin cambios») |
| `servidor/pruebas/servidorFalso.ts` | nuevo | `crearServidorFalso(): { fetch: typeof fetch; db; r2 }`: `enrutar` real sobre `sqliteD1` + `r2Memoria`, con un tarro de cookies propio; lo usan las pruebas de la app |
| `servidor/enrutador.ts` | nuevo | Tabla `método + ruta → manejador`; aplica el orden de comprobaciones de §4.3 |
| `servidor/sesion.ts` | nuevo | Cookies `dp_s` (usuario) y `dp_c` (cliente); `exigirUsuario(rol?)` valida sesión **y** `usuarios.activo = 1` en cada petición; `exigirCliente()` valida sesión, que la orden exista, que su código siga siendo el de la sesión y que esté vigente (§7) |
| `servidor/claves.ts` | nuevo | `hashClave`, `verificarClave` (PBKDF2-SHA256, sal 16 bytes, comparación en tiempo constante), `HASH_FICTICIO` para correos inexistentes |
| `servidor/limite.ts` | nuevo | `type ClaveLimite = { texto: string; ventanaMin: number; tope: number }`; `async function comprobarLimite(base: Base, claves: ClaveLimite[]): Promise<boolean>` (true = bloqueado) y `async function limpiarLimite(base: Base, texto: string): Promise<void>`. Hashea cada `texto` con SHA-256 y llama a `base.intentar` (un solo `batch`, §4.2) |
| `servidor/validar.ts` | nuevo | `ID_FOTO = /^[A-Za-z0-9_-]{1,80}$/`, `ID_ORDEN` (UUID v4), `CODIGO = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/` (el alfabeto de `store.ts:codigoCliente`), `normalizarCorreo`, `normalizarPatente` (la misma regla de `store.ts:buscarPorAcceso`). Órdenes: tope 256 kB y rechazo de `"data:` en el JSON. Taller: tope 100 kB; `logo` solo puede ser `data:image/(png\|jpeg\|webp);base64,…` (es el único data URL permitido, y va dentro de `talleres.datos`) |
| `servidor/permisos.ts` | nuevo | `podarParaMaestro`, `podarEmpresaParaMaestro`, `validarAlta(recibida, rol)`, `fusionarCambioMaestro(guardada, recibida): Orden \| 'prohibido'`, `podarParaCliente`, `fotosReferenciadas(orden): string[]` (§4.3) |
| `servidor/base.ts` | nuevo | Interfaz `Base` + `baseD1(db: D1Database)`; todo SQL de datos del taller lleva `taller_id` |
| `servidor/manejadores.ts` | nuevo | Un manejador por endpoint de §4.3 |
| `servidor/pruebas/sqliteD1.ts` | nuevo | Adaptador mínimo con la forma de `D1Database` (`prepare/bind/first/all/run`, `batch`) sobre `node:sqlite`, que aplica `migraciones/*.sql`. Las pruebas usan **el mismo `baseD1`** que producción |
| `servidor/*.test.ts` | nuevo | §9 |
| `migraciones/0001_inicial.sql` | nuevo | §4.2 |
| `scripts/cuentas.ts` | nuevo | Subcomandos `alta`, `baja`, `restablecer`, `suprimir-cliente`, `purgar` (§4.3). La lógica vive en funciones puras exportadas que devuelven SQL (`sqlAlta`, `sqlBaja`, `sqlRestablecer`, `planSupresion`, `planPurga`); el `main` solo las conecta con `wrangler`. Así las pruebas ejecutan **el mismo SQL** sobre `sqliteD1` |
| `scripts/cuentas.test.ts` | nuevo | §9 (C12, C13, C14) |
| `wrangler.toml` | nuevo | `name = "desabolladura"`, `pages_build_output_dir = "dist"`. Bases y bucket de **producción en el nivel superior** (`[[d1_databases]]` `DB` → `desabolladura`, `migrations_dir = "migraciones"`; `[[r2_buckets]]` `FOTOS` → `desabolladura-fotos`) y las de vistas previas en `[env.preview]` (`desabolladura-preview`, `desabolladura-fotos-preview`). Cada base con su `database_id` (no es secreto; lo da `wrangler d1 create`, §6) |
| `tsconfig.servidor.json` | nuevo | `include: ["servidor", "functions"]`, `exclude: ["servidor/pruebas", "**/*.test.ts"]`, `types: ["@cloudflare/workers-types"]`. `servidor/claves.ts` usa solo `crypto.subtle` y `TextEncoder`, presentes en Workers y en Node |
| `tsconfig.scripts.json` | nuevo | `include: ["scripts/cuentas.ts"]`, `types: ["node"]`, `allowImportingTsExtensions: true`, `noEmit: true`. `scripts/cuentas.ts` se ejecuta con `node scripts/cuentas.ts …` (Node 24 ejecuta TypeScript directamente, como ya se hace con `scripts/generar-autos-demo.ts`): importaciones con extensión `.ts` y solo sintaxis borrable (sin `enum` ni `namespace`); el único fichero de `servidor/` que importa es `claves.ts`, que no importa nada |
| `tsconfig.json` | cambia | `exclude` añade `src/lib/sincronizador.test.ts` y `src/humo.produccion.test.tsx`: importan `servidor/` (tipos de Workers) y `node:sqlite`; los ejecuta vitest, pero no los revisa el `tsc` de la app. Es la única pérdida de revisión de tipos, y queda acotada a dos ficheros de prueba |
| `.node-version` | nuevo | `24` (Cloudflare Pages lo lee para compilar; las pruebas usan `node:sqlite`) |
| `infra/worker-patentes/wrangler.toml` | cambia | Añadir el dominio de producción a `ORIGENES` |

**Aplicación**

| Ruta | Nuevo / cambia | Qué cambia |
|---|---|---|
| `src/lib/modo.ts` | nuevo | `export const PRODUCCION = import.meta.env.MODE === 'produccion'`. Se usa el **modo de Vite** (`vite build --mode produccion`), no un fichero `.env`: `.gitignore` ignora `.env*` y ese fichero nunca llegaría a la compilación de Cloudflare, que publicaría la demo |
| `src/lib/sincronizador.ts` | nuevo | `crearSincronizador(op: { api: Api; alCambiarOrden(o: Orden): void; alBorrarOrden(id: string): void; alCambiarTaller(e: Empresa): void; alAviso(texto: string): void; alPerderSesion(): void; reloj?: Reloj })` → `{ cambiar(id: string, cambio: (o: Orden) => Orden): void; cambiarTaller(e: Empresa): void; crear(o: Orden): Promise<Orden>; cargar(ordenes: Orden[], hasta: number): void; sondear(): Promise<void>; detener(): void }`. `Reloj` = `{ setTimeout, clearTimeout, setInterval, clearInterval }` (por defecto los globales; las pruebas inyectan temporizadores falsos). `store.ts` crea una sola instancia en producción y le pasa cada `actualizar` como `cambiar(id, cambio)`. Comportamiento en §4.3 «Flujo de una edición» |
| `src/lib/rutas.ts` | nuevo | `export function destino(ruta: string, usuario: Usuario \| null): string \| null` — devuelve la ruta a la que hay que ir (`'/entrar'` si la ruta exige un rol que el usuario no tiene; en producción `'/'` → `'/entrar'`, sin portada de demo) o `null` si se queda. `Guardia` y `Rutas` de `main.tsx` lo usan, así la regla se prueba sin dibujar |
| `src/lib/sincronizador.test.ts` | nuevo | §9 (C1, C7, C14) |
| `src/humo.produccion.test.tsx` | nuevo | §9 (C2, C11, C12) |
| `src/lib/demoSinApi.test.ts` | nuevo | §9 (C10) |
| `src/lib/rutas.test.ts` | nuevo | §9 (C2) |
| `src/lib/avisoPrivacidad.ts` | nuevo | `export const AVISO_PRIVACIDAD: { titulo: string; parrafos: string[] }`. Hasta que Nacho y Jaime entreguen el texto, lleva un único párrafo «Aviso en preparación»; la compuerta de §7 impide conectar producción con ese texto |
| `src/lib/sinOrdenFija.test.ts` | nuevo | Recorre `src/**/*.tsx` y falla si encuentra `actualizar(<id>, () =>` (una orden fija que no se puede reaplicar tras un 409, §4.3 paso 5) |
| `src/pages/Maestro.tsx` | cambia | `aplicar` (línea 73): pasa a `actualizar(id, x => construir(x))`, donde `construir` es la misma transformación de hoy aplicada a la orden que recibe; devuelve `construir(o)` a quien la llama |
| `src/lib/persistencia.ts` | nuevo | `crearApi(f: typeof fetch = fetch): Api`, con `credentials: 'same-origin'`. `Api` = `yo()`, `ordenes(desde?: number)`, `crearOrden(o)`, `guardarOrden(o, version)`, `borrarOrden(id)`, `cambiarCodigo(id)`, `guardarTaller(e)`, `entrar(correo, clave)`, `entrarCliente(patente, codigo)`, `responder(aprobada, version)`, `salir()`, `subirFoto(id, blob, tipo)`: una por endpoint de §4.3, con su mismo cuerpo y respuesta. Errores: `ConflictoError` (409, lleva la orden actual), `NoAutorizadoError` (401), `ProhibidoError` (403, lleva el mensaje), `SinRedError` (sin red o 5xx) |
| `src/lib/store.ts` | cambia | **El camino demo no se toca** (arranque síncrono igual que hoy: `store.test.ts` lee `instantanea()` justo después del import). Se añaden ramas `if (PRODUCCION)`: arranque vacío; `actualizar` y `guardarOrden` entregan el cambio al `sincronizador`; `editarEmpresa` envía la empresa **completa**. Nuevas: `cargarSesion(): Promise<'usuario' \| 'cliente' \| 'ninguna'>` (demo: resuelve al instante según `sesion()`; producción: `GET /api/yo`; si es usuario, carga taller, usuarios y `GET /api/ordenes` y arranca el sondeo; 401 → `'ninguna'`); `useUsuarios(): Usuario[]` (demo: `USUARIOS` de `seed.ts`; producción: los `usuarios` de `/api/yo`); `crearOrden(o): Promise<Orden>`, `borrarOrden(id)`, `cambiarCodigo(id)`, `responderPresupuesto(id, aprobada)`, `entrar(correo, clave)`, `salir()` (borra la cookie y las claves `dp.*` de `localStorage`); `sesion()` devuelve el usuario cargado; `cerrarSesion()` (lo llama el botón de la cabecera, `ui.tsx:76`) en producción limpia el estado y lanza `void salir()`, así `ui.tsx` no cambia esa llamada. `borrarTodo()` (`Errores.tsx`) no cambia: solo borra claves locales, nunca datos del servidor. `uid()` pasa a `crypto.randomUUID()` (en los dos modos). `codigoCliente()` usa muestreo por rechazo (descarta bytes ≥ 248) |
| `src/lib/fotos.ts` | cambia | `guardarFoto(id, data, tipo: 'trabajo' \| 'vista' = 'trabajo')`. En producción convierte el data URL con `await (await fetch(data)).blob()`, sube y **lanza si falla** (los llamadores ya tienen `catch`). `leerFoto(id)` devuelve `'/api/fotos/' + id` |
| `src/lib/vistas.ts` | cambia | `guardarVistas` pasa `tipo: 'vista'`. Las referencias `idb:<id>` siguen igual en los dos modos («foto propia con este id») |
| `src/components/ui.tsx` | cambia | `FotoGuardada` maneja `onError` del `<img>` y muestra «Foto no disponible» |
| `src/lib/gemini.ts` | cambia | `claveGemini()` devuelve `''` si `PRODUCCION` |
| `src/lib/costos.ts` | cambia | `costoHoraDelMes` devuelve `undefined` si `PRODUCCION` (así `horaDe` usa `empresa.costoHora`) |
| `src/lib/types.ts` | cambia | `Orden.version?: number`; `Usuario.correo?: string` |
| `src/lib/seguimiento.ts` | cambia | En producción `enlaceSeguimiento` arma `#/cliente/<codigo>/p/<PATENTE>` (sin datos de la orden); `empaquetar`/`desempaquetar` quedan para la demo |
| `src/main.tsx` | cambia | Ruta `/cliente/<codigo>/p/<PATENTE>` (`p[2] === 'p'` → patente en `p[3]`); ruta `/privacidad`; en producción muestra `Cargando` hasta que resuelve `cargarSesion()`; `Guardia` y la raíz usan `destino()` de `rutas.ts` (en producción la raíz `/` no muestra `Landing.tsx`, que dice «Demostración con datos ficticios»: va a `#/entrar` o al tablero del rol); sin franja «Demostración» |
| `src/pages/Login.tsx` | cambia | En producción: formulario correo + contraseña; en demo: las tres tarjetas de hoy |
| `src/pages/Cliente.tsx` | cambia | En producción: con sesión de usuario (admin abre «Ver como cliente», `Admin.tsx:259` y `:607`) pinta la orden que ya tiene la app, sin llamar a `/api/cliente/entrar`; sin sesión de usuario, `POST /api/cliente/entrar`. `Presupuesto.responder` llama a `responderPresupuesto`. Enlace a `#/privacidad` |
| `src/pages/Privacidad.tsx` | nuevo | Muestra el aviso de privacidad (texto en `src/lib/avisoPrivacidad.ts`) |
| `src/pages/NuevoVehiculo.tsx` | cambia | En producción `finalizar` espera `crearOrden(o)` y muestra número y código **de la respuesta** |
| `src/pages/Admin.tsx` | cambia | En producción oculta Restablecer demo, crear/cambiar empresa, clave de Gemini y el módulo de costos; el maestro de la orden sale de `useUsuarios()` (no de `USUARIOS`, línea 575); botones «Eliminar orden» y «Cambiar código del cliente» en la orden. Las dos órdenes fijas: `enviar` (línea 366) pasa a `actualizar(o.id, x => conEvento({ ...x, aprobacion: 'enviada' }, 'Presupuesto enviado al cliente'))`; `aplicar` (línea 418) recibe en vez de una `Decision` una función `producir: (x: Orden) => Decision | null` (los paneles pasan `x => autorizarAdicionales(x, …)` / `x => rechazarAdicionales(x, …)`). Primero calcula `producir(o)`: si es `null`, no hace nada y los paneles siguen abiertos (igual que hoy con `if (d)`); si no, cierra los paneles y llama a `actualizar(o.id, x => producir(x)?.orden ?? x)` |
| `vite.config.ts` | cambia | `base` = `/` en modo `produccion` y `/desabolladura/` en demo. En `produccion`, la CSP no va por `<meta>`: en `closeBundle` (cuando `dist/index.html` ya está escrito, sin depender del orden de los demás ganchos) se lee ese `index.html`, se calculan las huellas sha256 de sus scripts en línea con la misma expresión que hoy usa `transformIndexHtml`, y se escribe `dist/_headers` con la CSP (más el origen de `VITE_API_PATENTES`) y las cabeceras de §7. `test.include` = `src/**/*.test.{ts,tsx}`, `servidor/**/*.test.ts`, `scripts/**/*.test.ts` |
| `package.json` | cambia | `build:produccion`: `tsc --noEmit && tsc -p tsconfig.servidor.json --noEmit && tsc -p tsconfig.scripts.json --noEmit && vite build --mode produccion`; `cuentas`: `node scripts/cuentas.ts`; devDependencies `wrangler`, `@cloudflare/workers-types` y `@types/node` |
| `.github/workflows/deploy.yml` | **no cambia** | Sigue publicando la demo |

### 4.2 Datos, tipos y firmas

**Tablas D1** (`migraciones/0001_inicial.sql`):

```sql
CREATE TABLE talleres (id TEXT PRIMARY KEY, datos TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0, creado TEXT NOT NULL);
CREATE TABLE usuarios (
  id TEXT PRIMARY KEY, taller_id TEXT NOT NULL REFERENCES talleres(id),
  correo TEXT NOT NULL UNIQUE,                -- guardado ya normalizado (minúsculas, sin espacios)
  nombre TEXT NOT NULL, rol TEXT NOT NULL CHECK (rol IN ('admin','maestro')), cargo TEXT NOT NULL DEFAULT '',
  hash_clave TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1, creado TEXT NOT NULL);
CREATE TABLE sesiones (
  token_hash TEXT PRIMARY KEY, tipo TEXT NOT NULL CHECK (tipo IN ('usuario','cliente')),
  usuario_id TEXT, orden_id TEXT, codigo_hash TEXT,   -- cliente: SHA-256 del código con que entró
  taller_id TEXT NOT NULL, expira TEXT NOT NULL, creado TEXT NOT NULL);
CREATE TABLE ordenes (
  id TEXT NOT NULL, taller_id TEXT NOT NULL REFERENCES talleres(id),
  numero INTEGER NOT NULL, patente TEXT NOT NULL, codigo TEXT NOT NULL,
  entregada TEXT,                              -- copia de entregadaEl
  datos TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, seq INTEGER NOT NULL,
  PRIMARY KEY (taller_id, id),                -- un id repetido en OTRO taller no choca: no se confirma que exista (C3)
  UNIQUE (taller_id, numero));
CREATE INDEX ordenes_acceso ON ordenes (patente, codigo);
CREATE INDEX ordenes_seq ON ordenes (taller_id, seq);
CREATE TABLE borradas (taller_id TEXT NOT NULL, orden_id TEXT NOT NULL, seq INTEGER NOT NULL);
CREATE TABLE fotos (taller_id TEXT NOT NULL, id TEXT NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('trabajo','vista')),
  creada TEXT NOT NULL, PRIMARY KEY (taller_id, id));
CREATE TABLE intentos (clave_hash TEXT NOT NULL, fecha TEXT NOT NULL);
CREATE INDEX intentos_clave ON intentos (clave_hash, fecha);
```

- La orden se guarda **como documento JSON** (`datos`), con `numero`, `patente`, `codigo` y `entregada` copiados a columnas para buscar (motivo en §5).
- **`seq`** es un contador por taller que solo crece. Toda escritura de una orden va en un `batch` de D1 (transacción): `UPDATE talleres SET seq = seq + 1` y la escritura de la orden con `seq = (SELECT seq FROM talleres WHERE id = ?)`. La sincronización pide «lo que tenga `seq` mayor que el último visto», nunca por hora: no se pierden cambios hechos mientras otro equipo leía.
- **Número de orden:** lo asigna el servidor en la misma sentencia (`COALESCE(MAX(numero), 1000) + 1 … WHERE taller_id = ?`). D1 escribe en serie, así que no hay choques y no hace falta reintento.
- **Id de orden:** lo genera el navegador con `crypto.randomUUID()` (las fotos de la orden se suben antes con ese id). El servidor valida el formato UUID y que no exista **en ese taller** (si existe → 409).
- **Nunca dentro de `datos`:** imágenes (`"data:` → 422). Tope 256 kB → 413. En producción `store.ts` nunca escribe `imagenIA`.

**Cookies:** `dp_s` (usuario) y `dp_c` (cliente), nombres distintos para que entrar como cliente nunca pise la sesión del administrador. Ambas `HttpOnly; Secure; SameSite=Strict; Path=/api`. Token = 32 bytes aleatorios en base64url; en la base solo su SHA-256. Usuario: 12 h deslizante. Cliente: 7 días fijos.

**Interfaz `Base`** (`servidor/base.ts`), todas las funciones de datos del taller reciben `tallerId`:
`taller(id)`, `guardarTaller(id, datos)`, `usuarioPorCorreo(correo)`, `usuario(id)`, `usuariosDe(tallerId)`,
`crearSesion(s)`, `sesion(tokenHash)`, `tocarSesion(tokenHash, expira)`, `borrarSesion(tokenHash)`,
`borrarSesionesDe(usuarioId)`, `ordenesDe(tallerId, desdeSeq, soloVigentes: boolean)`,
`orden(tallerId, id)`, `ordenPorAcceso(patente, codigo)`, `crearOrden(tallerId, orden) → { numero, version, seq } | 'existe'`,
`guardarOrden(tallerId, orden, versionBase) → { version, seq } | 'conflicto'`, `borrarOrden(tallerId, id)`,
`borradasDesde(tallerId, desdeSeq)`, `seqActual(tallerId)`, `registrarFoto(tallerId, id, tipo) → 'ok' | 'existe'`,
`foto(tallerId, id)`, `borrarFotos(tallerId, ids)`,
`intentar(claves: { hash: string; ventanaMin: number; tope: number }[]) → boolean` y `limpiarIntentos(hash)`.

`intentar` es **un solo `batch`** (D1 lo ejecuta como transacción y en serie): primero un `INSERT INTO intentos` por cada clave y el borrado de los de más de 1 día; después un `SELECT COUNT(*)` por clave dentro de su ventana. Devuelve `true` (bloqueado) si algún conteo supera su tope. Como el registro va antes que el conteo y todo en la misma transacción, 20 peticiones simultáneas cuentan 1, 2, 3… y solo las 5 primeras pasan.

### 4.3 Flujo y endpoints

Todas las respuestas son JSON (salvo las fotos). Toda mutación exige `Origin` = el propio sitio y
`Content-Type: application/json` (la subida de fotos, `image/webp` o `image/jpeg`). GET nunca modifica.

**Orden de las comprobaciones** (la primera que falla decide):
1. Ruta desconocida → 404. 2. Ruta conocida con otro método → 405.
3. `Origin` / `Content-Type` incorrectos en una mutación → 403.
4. Rate limit (solo en las dos rutas de entrada) → 429.
5. Sin sesión válida (o usuario inactivo, o código del cliente cambiado o vencido) → 401.
6. Recurso de otro taller, u orden/foto que el cliente no tiene → 404.
7. Ruta solo de administrador pedida por un maestro → 403.
8. Cuerpo inválido → 400; imágenes dentro → 422; demasiado grande → 413; tipo de foto no admitido → 415.
9. **Versión vieja → 409** (antes de mirar campos: un envío viejo choca, no se rechaza por permisos).
10. Campo protegido cambiado → 403.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/entrar` | público | `{correo, clave}` → normaliza, cuenta el intento (§7), verifica (con `HASH_FICTICIO` si el correo no existe, para tardar lo mismo); exige `activo = 1`; crea sesión, cookie `dp_s`. Error siempre «Correo o contraseña incorrectos» |
| `POST /api/salir` | sesión | borra la sesión y la cookie |
| `GET /api/yo` | sesión | Usuario: `{usuario, taller, maestros}`; al maestro, el taller pasa por `podarEmpresaParaMaestro` (sin `costoHora` ni `margenObjetivo`) y `maestros` sin correo. Cliente: `{taller: {nombre, logo, acento, whatsapp}, orden: podarParaCliente(orden)}` |
| `GET /api/ordenes?desde=<seq>` | usuario | `{ordenes, borradas, hasta, taller}`: lo cambiado con `seq > desde` (sin `desde`: todo), `hasta = seqActual` y siempre el taller actual (podado para el maestro), para que los cambios de marca o costo por hora lleguen a los otros equipos. Al maestro: solo órdenes sin entregar o entregadas hace ≤ 30 días, pasadas por `podarParaMaestro` |
| `POST /api/ordenes` | usuario | Orden nueva. `validarAlta(recibida, rol)`: `id` UUID (lo genera el navegador; si existe → 409); `codigo` con `CODIGO` (lo genera el navegador con `codigoCliente()`, y es el que la pantalla muestra); el servidor **ignora** el `numero` recibido y fija el suyo, y `version = 1`. Si es maestro: todos los `items[].monto` en `null`, `facturas` vacía, `cobrada = false`, `costoHoraAplicado`, `entregadaEl` y `deducibleCobradoEl` en `null`; **un campo ausente (`undefined`) cuenta como vacío / `null` / `false`** (es lo que envía hoy `NuevoVehiculo.tsx`); con cualquier otro valor, 403. `cliente` (con su RUT) y `pagador` se aceptan completos en el alta: los escribe el maestro en `NuevoVehiculo.tsx` |
| `PUT /api/ordenes/:id` | usuario | `{orden, version}` → 409 si `version` no es la guardada (responde la orden actual, podada si es maestro). Admin: guarda lo recibido (con las validaciones de `validar.ts`), salvo `id`, `numero` y `codigo`, que se toman de la guardada (el código solo cambia por su ruta propia). Maestro: `fusionarCambioMaestro(guardada, recibida)`. Responde la orden guardada (podada para el maestro) con su `version` |
| `DELETE /api/ordenes/:id` | admin | Borra la fila, registra `borradas`, y borra de R2 y de `fotos` las fotos de `fotosReferenciadas(orden)` que ninguna otra orden del taller referencia (las vistas del modelo se reutilizan entre visitas del mismo auto) |
| `POST /api/ordenes/:id/codigo` | admin | «Cambiar código del cliente»: el **servidor** genera un código nuevo (alfabeto de `CODIGO`, `crypto.getRandomValues` con muestreo por rechazo), sube `version` y `seq`, borra las sesiones de cliente de esa orden y responde la orden |
| `PUT /api/taller` | admin | Empresa **completa** (no parcial: así `logo` se puede quitar). Validación de taller de `validar.ts` (el logo va como data URL dentro de `datos`, tope 100 kB) |
| `POST /api/cliente/entrar` | público | `{patente, codigo}` → normaliza, cuenta el intento (§7), busca la orden vigente; sesión `dp_c` con `orden_id` y `codigo_hash`. Responde como `GET /api/yo` del cliente |
| `POST /api/cliente/respuesta` | cliente | `{aprobada: boolean, version}` → 409 si la versión cambió; 403 si no se cumple `aprobacion === 'enviada'` y `pagador.tipo === 'particular'`; si se cumple, el **servidor** pone `aprobacion` y añade al historial «El cliente aprobó / rechazó el presupuesto en su portal» con su propia hora |
| `POST /api/fotos` | usuario | Cuerpo binario ≤ 2 MB; `X-Foto-Id` (`ID_FOTO`), `X-Foto-Tipo` (`trabajo` \| `vista`). Si `(taller, id)` ya existe → 409, sin tocar R2. Guarda en R2 `talleres/<taller>/<id>` |
| `GET /api/fotos/:id` | usuario del taller, o cliente si el id está en `fotosReferenciadas(podarParaCliente(su orden))` | Sirve desde R2 con `Cache-Control: private, max-age=600` |

**Permisos del maestro.** Se protege lo que importa (dinero y datos personales) y el resto se acepta,
porque eso es lo que la pantalla del maestro hace hoy (`Maestro.tsx:73`, `:83-91`, `:110`, `:119`;
`automatizacion.ts:sincronizar` y `conEvento`; `PiezaPicker`).

- `podarParaMaestro(orden)` quita: `items[].monto`, `items[].sugerido`, `facturas`, `cobrada`,
  `deducibleCobradoEl`, `pagador.deducible`, `pagador.siniestro`, `repuestos[].costo`, `costoHoraAplicado`, `cliente.rut`.
- `fusionarCambioMaestro(guardada, recibida)` trabaja sobre una lista de **rutas protegidas**:
  `id`, `numero`, `codigo`, `creada`, `cliente.rut`, `pagador.tipo`, `pagador.aseguradora`,
  `pagador.siniestro`, `pagador.deducible`, `facturas`, `cobrada`, `deducibleCobradoEl`,
  `costoHoraAplicado`, `entregadaEl`; en cada item existente (emparejado por `id`) `monto`, `sugerido`,
  `facturaAparte`; en cada repuesto existente (por `id`) `costo`, `estado`, `proveedor`, `pedidoEl`,
  `prometido`, `prometidoInicial`, `recibidoEl`, `reprogramado`. Para cada ruta protegida, comparando hoja por hoja:
  - en `recibida` **no está** (`undefined`, porque se podó) → se copia el valor de `guardada`;
  - está y es **igual** a `guardada` → se deja;
  - está y es **distinta** → devuelve `'prohibido'` y el endpoint responde 403.
  Así lo que la app del maestro no recibió vuelve intacto, y lo que intente cambiar se rechaza.
- Lo que el maestro **sí** puede: cambiar en sus items `estado`, `nota`, `fotoAntes`, `fotoDespues`,
  `terminadoEl`, `horas`, `titulo`, `severidad`; añadir items nuevos (con `monto: null`; su `sugerido`
  se acepta, sale de la tabla pública de precios); quitar items cuyo `monto` guardado sea `null`;
  añadir eventos al historial en cualquier posición (todos los eventos guardados deben seguir estando);
  añadir fotos; los repuestos nuevos y los borrados de items quitados que genera `sincronizar`; `entrega`;
  `vistas`; `recepcion`; `vehiculo`.
- `aprobacion`: el maestro solo puede pasarla de `aprobada` a `pendiente`, y solo si añadió items
  (marcados `adicional: true`). Cualquier otro cambio de `aprobacion` → 403.
- Quitar un item con monto, o cambiar una ruta protegida → 403 con el mensaje «Pide este cambio al
  administrador».

**`fotosReferenciadas(orden)`**: los `fotos[].id`, los `items[].fotoAntes` y `items[].fotoDespues`, y
los valores de `vistas` que empiezan por `idb:` (sin el prefijo).

**Datos para el cliente.** `podarParaCliente(orden)` es una **lista blanca** (la misma idea que el
`Paquete` de `seguimiento.ts`): `id`, `numero`, `entrega`, `aprobacion`, `version`, `pagador.tipo`,
`vehiculo` sin `motor`, `chasis` ni `ficha.fuentes`, `items` sin `sugerido` ni `horas`, `fotos`, `vistas`,
`entregadaEl`. Nada más (ni `cliente`, ni `historial`, ni `notas`, ni `recepcion`, ni `repuestos`, ni `facturas`).

**Flujo de una edición** (`src/lib/sincronizador.ts`, solo en producción):
1. La pantalla llama a `actualizar(id, cambio)` como hoy. `store.ts` aplica `cambio` en memoria (la pantalla responde al instante) y lo entrega al sincronizador.
2. El sincronizador guarda por orden: `confirmada` (lo último que aceptó el servidor), la lista de `cambios` pendientes (las funciones `cambio`) y si hay un envío en vuelo.
3. Espera 400 ms sin cambios nuevos (así escribir un monto o mover el selector de color no manda una petición por tecla) y envía **un solo** `PUT` por orden con la orden local y `confirmada.version`. Mientras está en vuelo, los cambios nuevos se acumulan para el siguiente envío.
4. 200 → `confirmada` = respuesta; la orden local = respuesta + los cambios que llegaron durante el vuelo, reaplicados.
5. 409 → `confirmada` = la orden del servidor; se reaplican **todos** los cambios pendientes sobre ella y se reenvía una vez. Si vuelve a dar 409 → orden local = la del servidor y aviso de C7. Para que reaplicar sea correcto, cada `cambio` debe **calcular a partir de la orden que recibe**: hoy tres llamadas pasan una orden fija (`Maestro.tsx:73`, `Admin.tsx:366`, `Admin.tsx:418`), que pisaría el cambio ajeno; se corrigen (§4.1) y `sinOrdenFija.test.ts` impide que vuelva a aparecer.
6. Error de red o 5xx → orden local = `confirmada` y aviso «No se pudo guardar. Revisa tu conexión».
7. Cada 15 s con la pestaña visible, y al volver a ella, `GET /api/ordenes?desde=<hasta>`: reemplaza las órdenes **sin** cambios pendientes ni envío en vuelo; quita las `borradas`; reemplaza la empresa si no hay un cambio de empresa pendiente. Un 401 en el sondeo lleva a `#/entrar`.
8. La empresa usa la misma cola (clave `taller`), con la espera de 400 ms, enviando la empresa completa.

`guardarOrden` de una orden nueva va por `crearOrden` (POST, se espera la respuesta).

**Scripts de cuentas** (`scripts/cuentas.ts`, los corre Jaime en su terminal):

| Subcomando | Qué hace |
|---|---|
| `alta --taller "Nombre" [--whatsapp 569…] --admin "correo:Nombre" --maestro "correo:Nombre"… --contrato-firmado AAAA-MM-DD` | `--maestro` se repite. Sin `--contrato-firmado` se niega. El taller se crea con `id` = UUID nuevo y `datos` = `{ id, nombre, acento: '#ff7a2f', whatsapp }` (la `Empresa` de `types.ts`, mismo `id` que la fila); el cargo de cada usuario es «Administración» o «Maestro». Genera ids y una contraseña temporal de 16 caracteres por usuario, calcula el hash con `servidor/claves.ts:hashClave`, escribe los `INSERT` (con hashes, no contraseñas) en un fichero de `os.tmpdir()`, ejecuta `npx wrangler d1 execute desabolladura --remote --file <fichero>`, lo borra al terminar (falle o no) y muestra las contraseñas temporales **una sola vez** en la terminal |
| `baja --correo x` | `activo = 0` y borra sus sesiones |
| `restablecer --correo x` | Contraseña temporal nueva (mostrada una vez) y borra sus sesiones |
| `suprimir-cliente --patente X` o `--rut R` | (1) `wrangler d1 execute --json` con un `SELECT` de las órdenes que coinciden (`json_extract(datos, '$.cliente.rut')` para RUT) y de las demás órdenes del taller; (2) `planSupresion(filas)` calcula el SQL de borrado (filas, `borradas`, `fotos`) y la lista de fotos que ninguna otra orden referencia; (3) borra esas fotos con `wrangler r2 object delete desabolladura-fotos/talleres/<taller>/<id> --remote`; (4) ejecuta el SQL |
| `purgar` | Igual que `suprimir-cliente`, con `planPurga(filas, hoy)`: órdenes entregadas hace más que el plazo de conservación (§7), sesiones vencidas e intentos de más de 1 día |

Todos aceptan `--simular`: muestran lo que harían, sin hashes ni contraseñas, y no ejecutan nada.

## 5. Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Servidor propio en un VPS (Node + PostgreSQL) | Hay que mantener servidor, parches y respaldos; Pages + D1 + R2 entra en el plan gratuito de Cloudflare para un taller (salvo lo que diga la medición de §8) y ya usamos Cloudflare para el Worker de patentes |
| Supabase / Firebase | Otro tercero con datos de clientes; reglas de acceso en otro lenguaje |
| App en GitHub Pages y API en `workers.dev` | Origen cruzado: cookie de terceros (Safari la bloquea) o token en el navegador (robable por XSS) |
| Normalizar la orden en tablas | Reescribe `src/lib/*`, que ya tiene pruebas; un taller tiene cientos de órdenes, no millones |
| API de comandos («marcar item listo», «agregar foto»…) en vez de guardar la orden | Más seguro por diseño, pero obliga a reescribir las ~25 llamadas de las pantallas. La fusión con campos protegidos da la misma garantía sobre dinero y datos personales con un cambio acotado. Se reconsidera si aparecen más roles |
| Validar al maestro con una lista de campos permitidos (versión 1 de este plano) | Los Peces mostraron que la pantalla del maestro cambia muchos más campos de los listados: casi todo daba 403. Proteger lo sensible y aceptar el resto refleja lo que la app hace |
| Que el servidor ejecute `sincronizar` | Repetiría la lógica, y `fechaLocal()` en el servidor da la fecha UTC, no la de Chile. Se acepta lo que calcula el navegador y se protegen los campos sensibles |
| Pruebas con una base falsa en memoria | No prueba el SQL real, que es justo donde se olvidaría `taller_id`. Se usa `baseD1` sobre `node:sqlite` con la migración real |

## 6. Ruta a producción

- **Demo:** sin cambios. Push a `main` → `.github/workflows/deploy.yml` → GitHub Pages (~1 min).
- **Producción:** proyecto de Cloudflare Pages conectado al repo en el panel de Cloudflare (sin token en GitHub). Compilación `npm ci && npm test && npm run build:produccion`; salida `dist`; Node 24 (lo lee de `.node-version`). Variable de compilación en el panel de Pages: `VITE_API_PATENTES` (dirección del Worker de patentes; sin ella la consulta automática queda apagada, como hoy). Desde que se conecta, **un push a `main` también publica producción**, y cada rama genera una vista previa con su base `desabolladura-preview`.
- **Orden de puesta en marcha** (Jaime, en su terminal):
  1. `npx wrangler d1 create desabolladura --location enam` y `npx wrangler d1 create desabolladura-preview --location enam`; los dos `database_id` van a `wrangler.toml` en un commit.
  2. `npx wrangler r2 bucket create desabolladura-fotos --location enam` y lo mismo con `desabolladura-fotos-preview`.
  3. `npx wrangler d1 migrations apply desabolladura --remote` y `npx wrangler d1 migrations apply desabolladura-preview --remote --env preview`.
  4. **Recién cuando se cumpla la compuerta legal de §7**, conectar el proyecto de Pages. Antes de eso, un push a `main` no publica producción porque no existe.
  5. Con el nombre del proyecto ya conocido (`https://<proyecto>.pages.dev`), añadirlo a `ORIGENES` en `infra/worker-patentes/wrangler.toml`, commit, y `cd infra/worker-patentes && npx wrangler deploy`. Las vistas previas quedan fuera de `ORIGENES` a propósito: en ellas el ingreso por patente cae al ingreso manual.
- Los comandos de `scripts/cuentas.ts` apuntan a la base de producción (nivel superior de `wrangler.toml`, sin `--env`).
- Dominio: `<proyecto>.pages.dev` mientras no haya dominio propio.

## 7. Seguridad y datos

- **Mutaciones sin GET:** 405 a cualquier método no declarado (C9).
- **Rate limit** (C6). Claves normalizadas (correo en minúsculas y sin espacios; patente con `normalizarPatente`) y guardadas como SHA-256. En cada intento, **antes** de verificar, se registra y se cuenta en el mismo `batch`:
  - `ip:<CF-Connecting-IP>` → tope 30 en 15 min (un taller entero detrás de la misma IP, o CGNAT móvil, no se bloquea por 5 errores);
  - `correo|ip` o `patente|ip` → tope 5 en 15 min;
  - `correo` o `patente` sola → tope 50 en 1 h (frena un ataque repartido entre muchas IP).
  - Si cualquiera pasa su tope → 429. Un acierto borra los intentos de `correo|ip` / `patente|ip`. Los de más de 1 día se borran al insertar y al leer.
  - **Riesgo aceptado:** alguien con 50 IP distintas puede bloquear una cuenta concreta durante 1 h. Es preferible a permitir adivinar contraseñas.
- **CSRF:** cookies `SameSite=Strict` + `Origin` + `Content-Type: application/json`.
- **Aislamiento por taller:** el `taller_id` sale siempre de la sesión, nunca del cuerpo; todo SQL de datos lo lleva (C3, probado contra SQLite real).
- **Contraseñas:** PBKDF2-SHA256 con sal propia; nunca se registran ni se devuelven. Iteraciones: 100 000 (máximo de Workers), sujeto a la medición de §8.
- **Acceso del cliente:** el link es una credencial. Vale mientras la orden no esté entregada o lleve ≤ 30 días entregada (después: 401 genérico). El administrador puede «Cambiar código del cliente» y eso corta las sesiones de cliente de esa orden (se comparan con `codigo_hash`). `codigoCliente()` sin sesgo (muestreo por rechazo).
- **Datos personales** (Ley 19.628 y Ley 21.719, vigente desde el 1-dic-2026): nombre, RUT y teléfono del cliente; fotos del auto con la patente visible; correo y nombre de los usuarios del taller.
  - Quién ve qué: el administrador ve todo lo de su taller; el maestro, sin RUT ni datos económicos, y solo órdenes vigentes (≤ 30 días tras la entrega); el cliente, la lista blanca de `podarParaCliente`.
  - Dónde: D1 y R2 de la cuenta de Cloudflare de la agencia, con `location hint` `enam` (Norteamérica). **Hay transferencia internacional**, y se declara en el aviso de privacidad y en el contrato.
  - Roles: el **taller es el responsable** de los datos de sus clientes; la **agencia es encargada** del tratamiento. Se formaliza en un contrato de encargo.
  - Plazo de conservación: 6 años después de la entrega (respaldo tributario de lo cobrado), **a confirmar por Nacho** antes del primer taller. Se aplica con `cuentas.ts purgar` (manual, mensual).
  - Supresión: `DELETE /api/ordenes/:id` (administrador) y `cuentas.ts suprimir-cliente`. Time Travel de D1 conserva lo borrado 30 días más; se declara en el aviso.
  - Registros: `console.log` solo con ids y códigos de estado, nunca cuerpos, correos, patentes ni RUT. `intentos` guarda solo hashes.
  - En el equipo: `salir()` borra las claves `dp.*` de `localStorage`; las fotos quedan en la caché del navegador como máximo 10 min.
- **Compuerta legal (antes de conectar producción, §6 paso 4):** (1) aviso de privacidad redactado por Nacho y aprobado por Jaime, cargado en `src/lib/avisoPrivacidad.ts`; (2) contrato de encargo firmado con el taller. `cuentas.ts alta` exige `--contrato-firmado` (C12).
- **Cabeceras** (las genera `vite.config.ts` en `_headers`): la CSP actual sin `https://generativelanguage.googleapis.com`, más `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy: camera=(self)`, `X-Frame-Options: DENY`.
- **Secretos:** no hay secretos nuevos en el repo (`database_id` no es secreto).

## 8. Riesgos y rollback

| Riesgo | Mitigación |
|---|---|
| Romper la demo al tocar `store.ts` | El camino demo no se modifica, solo se añaden ramas `if (PRODUCCION)`; `store.test.ts` y `humo.test.tsx` deben pasar sin editar sus expectativas |
| PBKDF2 con 100 000 iteraciones supera los 10 ms de CPU del plan gratuito | **Primer paso de la implementación:** desplegar una vista previa solo con `POST /api/entrar` y medir el tiempo de CPU en el panel de Cloudflare. Si pasa de 10 ms, decide Jaime: plan Workers Paid (USD 5/mes, recomendado) o bajar las iteraciones. No se sigue sin esa decisión |
| Equipo sin red | No se guarda sin conexión: revierte y avisa en pantalla |
| Push a `main` publica demo y producción a la vez | Escrito en §6; las pruebas corren en las dos compilaciones |
| Fuga entre talleres por un SQL sin `taller_id` | Pruebas de C3 con dos talleres sobre SQLite real |
| Una foto que falla al subir deja la orden apuntando a algo que no existe | `guardarFoto` lanza; los llamadores ya muestran «No se pudo guardar la foto» y no guardan la referencia; `FotoGuardada` muestra «Foto no disponible» ante cualquier error |

Rollback: la demo es independiente (revertir el commit). En producción, Cloudflare Pages vuelve a un
despliegue anterior con un clic, y D1 Time Travel restaura la base a cualquier minuto de los últimos 30 días.
La migración `0001_inicial.sql` solo crea tablas (no hay datos previos que perder): deshacerla es
`wrangler d1 time-travel restore` a antes de aplicarla, o borrar la base y crearla de nuevo. El cambio
de `ORIGENES` del Worker de patentes se deshace revirtiendo ese commit y repitiendo `npx wrangler deploy`.

## 9. Plan de pruebas

Las pruebas de `servidor/` usan `baseD1` sobre `servidor/pruebas/sqliteD1.ts` con la migración real.
Las de producción en el navegador usan `vi.stubEnv('MODE', 'produccion')` + `vi.resetModules()`
y luego `await import(...)`, porque `PRODUCCION` y `store.ts` se evalúan al importarse. Los
`fetch` a `/api/*` se responden con un servidor falso hecho con los manejadores reales de `servidor/`
sobre `sqliteD1` (así las pruebas de la app y del servidor no se desalinean).

| Criterio | Prueba |
|---|---|
| C1 | `src/lib/sincronizador.test.ts`: dos instancias con un `fetch` falso sobre el mismo servidor en memoria; un cambio en una aparece en la otra tras la consulta periódica. `servidor/ordenes.test.ts`: `desde=<seq>` devuelve lo escrito después, incluido lo escrito mientras otra lectura estaba en curso |
| C2 | `servidor/sesion.test.ts`: sin cookie, cookie vencida o con token alterado → 401 en cada ruta protegida. `src/lib/rutas.test.ts` (nuevo): `destino('/admin', null)` y `destino('/maestro', admin)` → `'/entrar'`; en producción `destino('/', null)` → `'/entrar'`. `src/humo.produccion.test.tsx`: `cargarSesion()` con `/api/yo` → 401 resuelve `'ninguna'`; `Login` muestra el formulario de correo y contraseña. `sincronizador.test.ts`: un 401 en el sondeo llama a `alPerderSesion` |
| C3 | `servidor/aislamiento.test.ts`: dos talleres; cada endpoint con id ajeno (orden, foto, borrar) → 404 |
| C4 | `servidor/permisos.test.ts`, (a): el maestro cambia monto, factura, `cobrada`, pagador o costo de repuesto → 403; borra orden, cambia el código o edita el taller → 403. (c), un caso por acción, cada uno → 200 y el campo guardado: estado de un item, `nota`, `terminadoEl`, `horas`, `fotoAntes`, `fotoDespues`, foto nueva en `fotos[]`, evento al principio del historial, agregar un trabajo de cambio a una orden aprobada (items nuevos + `adicional` + `aprobacion: pendiente` + repuesto nuevo), quitar un item sin monto; quitar uno con monto → 403. (b): ninguna respuesta al maestro (`/api/yo`, `/api/ordenes`, PUT, POST) contiene `monto`, `sugerido`, `facturas`, `costo`, `costoHora`, `margenObjetivo` ni `rut` |
| C5 | `servidor/cliente.test.ts`: la respuesta de entrada y la de `/api/yo` del cliente, recorridas enteras, no contienen `rut`, `telefono`, `chasis`, `motor`, `costo`, `sugerido`, `horas`, `facturas`, `historial`, `notas`; aprobar en `enviada` + particular → 200 y evento escrito por el servidor; en `aprobada`, o con seguro → 403; con la cookie `dp_c`, cada ruta de usuario (`/api/ordenes`, `PUT /api/ordenes/:id`, `/api/taller`, `/api/fotos` POST, `DELETE`) → 401 |
| C6 | `servidor/limite.test.ts`: 5 fallos desde una IP con el mismo correo → el 6.º correcto da 429; variantes con mayúsculas y espacios cuentan como el mismo correo; `DE-MA22`, `dema 22` y `DEMA22` cuentan como la misma patente; 30 intentos desde una IP con correos distintos → el 31.º da 429; 20 peticiones simultáneas dejan pasar como máximo 5; un acierto limpia el contador; 50 fallos desde IP distintas bloquean ese correo |
| C7 | `src/lib/sincronizador.test.ts`: dos `actualizar` seguidos → 1 o 2 PUT y 0 conflictos; 409 con cambio ajeno → reaplica y reintenta; segundo 409 → aviso y orden del servidor; error de red → vuelve a `confirmada`. `servidor/ordenes.test.ts`: PUT con versión vieja de un maestro → 409 (no 403) |
| C8 | `servidor/fotos.test.ts`: sin sesión → 401; cliente baja una foto de avance de su orden → 200; foto no referenciada por su orden → 404; id con `../` → 400; tipo no imagen → 415; > 2 MB → 413; subir un id que ya existe → 409 y R2 sin cambios |
| C9 | `servidor/enrutador.test.ts`: GET a cada ruta mutativa → 405; ninguna respuesta contiene `hash_clave`, `token` ni `codigo_hash` |
| C10 | `npm test` y `npm run build` en modo demo, con las pruebas actuales sin editar sus expectativas; `humo.test.tsx` intacto. `src/lib/demoSinApi.test.ts` (nuevo): en modo demo, con `fetch` espiado, entrar como administrador y como maestro, crear una orden, cambiarla y abrir el portal del cliente → ninguna llamada a una URL que contenga `/api/` |
| C11 | `src/humo.produccion.test.tsx`: `Login` sin «Demo Administrador»; sin franja; Ajustes sin Gemini, sin Restablecer, sin crear empresa, sin módulo de costos |
| C12 | `src/humo.produccion.test.tsx`: la entrada del cliente y el pie enlazan `#/privacidad`. `scripts/cuentas.test.ts`: `alta` sin `--contrato-firmado` termina con error y sin ejecutar wrangler |
| C13 | `scripts/cuentas.test.ts`: se ejecuta sobre `sqliteD1` el SQL que devuelven `sqlBaja` y `sqlRestablecer` y, con los manejadores reales, la cookie que el usuario tenía antes → 401; `servidor/sesion.test.ts`: usuario con `activo = 0` → 401 |
| C14 | `servidor/ordenes.test.ts`: `DELETE` de una orden → aparece en `borradas`, sus fotos se borran salvo las vistas que referencia otra orden; maestro → 403. `scripts/cuentas.test.ts`: `planSupresion` por patente y por RUT sobre `sqliteD1` → borra las órdenes que coinciden, devuelve solo las fotos no referenciadas por otras, y registra `borradas`. `src/lib/sincronizador.test.ts`: una orden en `borradas` desaparece del otro equipo en el siguiente sondeo (≤ 15 s simulados con temporizadores falsos) |
| Otros | Orden de 256 kB + 1 → 413; con `"data:` → 422; id de orden repetido → 409; taller con logo `data:image/png;base64,…` → 200 y con `data:text/html,…` → 400; `sinOrdenFija.test.ts` en verde; maestro crea una orden con un monto → 403 y sin montos → 201 con el `codigo` que envió y un `numero` del servidor |
| Todos | Prueba manual con `npx wrangler pages dev dist` y tres navegadores (administrador, maestro y cliente) |

## Decisiones de Jaime (con su valor por defecto)

| Decisión | Por defecto | Cuándo hace falta |
|---|---|---|
| Plan de Cloudflare si el inicio de sesión supera 10 ms de CPU | Workers Paid, USD 5/mes | Tras la medición del primer paso (§8) |
| Plazo de conservación | 6 años tras la entrega, a confirmar por Nacho | Antes del primer taller |
| Vigencia del link del cliente tras la entrega | 30 días | Se puede cambiar en cualquier momento (una constante) |

## Registro de revisión (Peces)

| Ronda | Pez | Severidad | Hallazgo (§) | Respuesta: aceptado / rechazado y por qué |
|---|---|---|---|---|
| 1 | Comprensión | ambigüedad | §4.3 maestro recibe la orden podada pero se validaba contra la completa | Aceptado: se fusiona sobre la guardada (`fusionarCambioMaestro`) |
| 1 | Comprensión | ambigüedad | §4.3 `nota`, `fotoAntes`… son de `Item`, no de la orden | Aceptado: escrito por item |
| 1 | Comprensión | ambigüedad | §2 C5 no decía «solo particulares» | Aceptado: añadido a C5 |
| 1 | Comprensión | ambigüedad | §4.3 orden entre 401/403/404/405 | Aceptado: lista «Orden de las comprobaciones» |
| 1 | Comprensión | ambigüedad | §7 dos claves de límite | Aceptado: §7 reescrito con tres claves y sus topes |
| 1 | Comprensión | ambigüedad | §4.1 `guardarFoto` recibe texto y la subida un `Blob` | Aceptado: conversión con `fetch(data).blob()` |
| 1 | Comprensión | ambigüedad | §4.1/§8 `imagenIA` frente al tope | Aceptado: 422 si el JSON lleva `"data:"` |
| 1 | Comprensión | ambigüedad | §4.1 formato del link de WhatsApp | Aceptado: `#/cliente/<codigo>/p/<PATENTE>` |
| 1 | Comprensión | ambigüedad | §4.2 número de orden en altas simultáneas | Aceptado: lo asigna el servidor en el `INSERT` |
| 1 | Comprensión | ambigüedad | §6 base de las vistas previas | Aceptado: `[env.preview]` |
| 1 | Comprensión | ambigüedad | §4.3 alta de taller ambigua | Aceptado: subcomandos de `cuentas.ts` escritos |
| 1 | Ana, Valentina | BLOQUEANTE | §4.3 la lista permitida del maestro no cubre lo que la app envía (historial al principio, `sincronizar`, `adicional`, `aprobacion`, `sugerido`) | Aceptado: se cambia a campos protegidos + fusión (§4.3); `sincronizar` en el servidor rechazado (§5) |
| 1 | Ana, Nacho, Valentina | BLOQUEANTE | §4.3 el cliente recibía la orden completa | Aceptado: `podarParaCliente` en lista blanca y endpoint propio `POST /api/cliente/respuesta` |
| 1 | Ana, Nacho, Valentina | BLOQUEANTE | §4.1 fotos sin orden: el cliente no las vería | Aceptado: permiso del cliente por referencia en su orden; `X-Orden-Id` eliminado |
| 1 | Ana, Valentina | BLOQUEANTE | §4.3 sin cola por orden: un equipo choca consigo mismo; la reversión pisa cambios; el sondeo pisa lo pendiente | Aceptado: `sincronizador.ts` (un envío en vuelo, espera de 400 ms, reaplicar tras 409, sondeo que respeta lo pendiente) |
| 1 | Valentina | BLOQUEANTE | §4.3 el 403 se comprobaba antes que el 409 | Aceptado: la versión se comprueba primero (paso 9) |
| 1 | Valentina | BLOQUEANTE | §4.3 el servidor fijaba el id y el número, que la pantalla ya mostró | Aceptado: id UUID del navegador validado; la pantalla espera el número del servidor |
| 1 | Nacho | BLOQUEANTE | §4.2 el maestro recibía `costoHora` y `margenObjetivo`; el módulo de costos no estaba en el plano | Aceptado: `podarEmpresaParaMaestro`; costos fuera de fase 1 y ocultos (§3) |
| 1 | Ana, Nacho, Valentina | IMPORTANTE | §4.2 `fotos.id` global elegido por el navegador | Aceptado: PK `(taller_id, id)`, regex, 409 sin sobrescribir, `uid()` con `randomUUID` |
| 1 | Ana, Valentina | IMPORTANTE | §4.3 boletas descargables por el maestro | Aceptado: sin boletas en producción (costos fuera de fase 1); tipos solo `trabajo` y `vista` |
| 1 | Ana | IMPORTANTE | §7 límite sin normalizar, por IP bloquea al taller, no atómico, el acierto no limpia | Aceptado: §7 reescrito; DoS dirigido aceptado y escrito |
| 1 | Ana, Valentina | IMPORTANTE | §9 pruebas de `servidor/` no corrían (`vite.config.ts`, `tsconfig`), sin tipos de Workers, patrón de C11 | Aceptado: `test.include`, `tsconfig.servidor.json`, `stubEnv` + `resetModules` |
| 1 | Valentina | IMPORTANTE | §8 la demo pasaba a ser asíncrona y rompía `store.test.ts` | Aceptado: el camino demo no se toca |
| 1 | Valentina | IMPORTANTE | §8 la base en memoria no prueba el SQL real | Aceptado: `baseD1` sobre `node:sqlite` |
| 1 | Valentina | IMPORTANTE | §6 `database_id`, `migrations_dir`, migrar la base de vistas previas, `_headers` sin la huella del script | Aceptado: §4.1 y §6 corregidos; `_headers` generado por `vite.config.ts` |
| 1 | Valentina | IMPORTANTE | §4.1 «Ver como cliente» sin patente y la cookie de cliente pisaba la del admin | Aceptado: con sesión de usuario no se llama a `/cliente/entrar`; cookies `dp_s` y `dp_c` |
| 1 | Valentina | IMPORTANTE | §4.3 sincronización por hora pierde cambios | Aceptado: contador `seq` por taller |
| 1 | Nacho | IMPORTANTE | §3 sin baja ni revocación | Aceptado: `activo` en cada petición, `baja` y `restablecer` (C13) |
| 1 | Nacho | IMPORTANTE | §7 sin plazo de conservación ni supresión | Aceptado: DELETE, `suprimir-cliente`, `purgar`, plazo a confirmar (C14) |
| 1 | Nacho | IMPORTANTE | §6 la condición legal no frenaba nada | Aceptado: compuerta antes de conectar Pages; `--contrato-firmado`; C12; transferencia internacional declarada |
| 1 | Nacho | IMPORTANTE | §7 link del cliente permanente; límite por patente bloquea al dueño; código con sesgo | Aceptado: vigencia, «Cambiar código», `patente|ip`, muestreo por rechazo |
| 1 | Nacho | IMPORTANTE | §4.3 el maestro veía RUT y todo el historial del taller | Aceptado: sin `rut`; solo órdenes vigentes |
| 1 | Ana, Valentina | MENOR | PBKDF2 y el límite de CPU; fuga de correos por tiempo; `activo` sin uso | Aceptado: medición como primer paso (§8), `HASH_FICTICIO`, `activo` en cada petición |
| 1 | Ana | MENOR | `leerFoto` nunca falla: imagen rota | Aceptado: `onError` en `FotoGuardada`; `guardarFoto` lanza si falla la subida |
| 1 | Nacho | MENOR | `intentos` en claro, caché de fotos de 1 día, `dp.*` y Gemini en el equipo | Aceptado: hashes, `max-age=600`, `salir()` limpia, `claveGemini()` vacía. `no-store` rechazado: cada pantalla volvería a bajar todas las fotos |
| 1 | Valentina | MENOR | `VITE_MODO=…` en un script npm falla en Windows; logo parcial; reintento del número sobra | Aceptado: `--mode produccion` (el `.env.produccion` se descartó en la ronda 2); empresa completa; sin reintento |
| 1 | Nacho | — | «Foto de una orden anterior del mismo auto → 404» | Rechazado en parte: las **vistas del modelo** se reutilizan a propósito (`NuevoVehiculo.tsx:92`) y no son datos personales; el cliente las ve si su orden las referencia. Las fotos de **trabajo** de otra orden no las ve (no están referenciadas) |

| 2 | Go/No-Go (NO-GO) | BLOQUEANTE | §4.1 `.env.produccion` lo ignora `.gitignore`: producción publicaría la demo | Aceptado: `PRODUCCION` sale de `import.meta.env.MODE` (`--mode produccion`), sin fichero `.env` |
| 2 | Go/No-Go | — | §4.1 ficheros nombrados y no listados; `scripts/**` fuera de `test.include`; faltaba `@types/node` | Aceptado: añadidos a §4.1; `tsconfig.scripts.json` aparte para no mezclar tipos de Node y de Workers |
| 2 | Go/No-Go | — | §4.2 `useMaestros` y `cargarSesion` sin definir | Aceptado: `useUsuarios()` y `cargarSesion()` con firma y comportamiento en `store.ts` |
| 2 | Go/No-Go | — | §4.2/§7 contar y registrar en llamadas separadas no es atómico | Aceptado: `Base.intentar` en un solo `batch`, con su firma |
| 2 | Go/No-Go | — | §4.3 el alta del maestro con `fusionarCambioMaestro` vaciaba id, código y RUT | Aceptado: `validarAlta` propia; código del navegador; número del servidor |
| 2 | Go/No-Go | — | §4.3 restaurar en silencio frente al 403 de C4 | Aceptado: regla hoja por hoja (ausente → restaurar; igual → dejar; distinto → 403) |
| 2 | Go/No-Go | — | §4.3 tres `actualizar(id, () => orden fija)` pisan el cambio ajeno al reaplicar | Aceptado: se corrigen `Maestro.tsx:73`, `Admin.tsx:366` y `:418`; `sinOrdenFija.test.ts` |
| 2 | Go/No-Go | — | §4.3 el logo es un data URL y se rechazaba con 422 | Aceptado: excepción solo para `logo` del taller, tipo de imagen validado, tope 100 kB |
| 2 | Go/No-Go | — | §9 C2, C6, C10, C13 y C14 sin prueba completa | Aceptado: pruebas añadidas; el script expone su SQL como funciones puras y se prueba ese mismo SQL |
| 2 | Go/No-Go | MENOR | §6 versión de Node, `VITE_API_PATENTES`, `ORIGENES` y `--env`; cambios del taller sin propagar | Aceptado: `.node-version`, pasos 1-5 de §6, el sondeo trae el taller |
| 3 | Go/No-Go 2 (NO-GO) | — | §4.3 «Cambiar código» sin endpoint | Aceptado: `POST /api/ordenes/:id/codigo`; el código nuevo lo genera el servidor; el PUT del admin no cambia `id`, `numero` ni `codigo` |
| 3 | Go/No-Go 2 | — | §4.3 `alta` sin nombres ni datos iniciales del taller | Aceptado: `"correo:Nombre"`, `--whatsapp`, `datos` iniciales escritos |
| 3 | Go/No-Go 2 | — | §4.1 sin doble de R2 ni tipo `Env` | Aceptado: `servidor/env.ts`, `r2Memoria.ts`, `servidorFalso.ts` |
| 3 | Go/No-Go 2 | — | §4.1 `tsconfig.json` revisaría pruebas que importan tipos de Workers | Aceptado: se excluyen esas dos pruebas del `tsc` de la app (vitest las corre igual) |
| 3 | Go/No-Go 2 | — | §4.1 «Cerrar sesión» de la cabecera no llamaba a `salir()`; `Errores.tsx` | Aceptado: `cerrarSesion()` delega en producción; `borrarTodo` sin cambios, escrito |
| 3 | Go/No-Go 2 | — | §4.1 la portada de demo seguía en producción | Aceptado: en producción `/` va a `#/entrar` o al tablero (`rutas.ts`) |
| 3 | Go/No-Go 2 | — | `Decision \| null` en `aplicar`; ausente en `validarAlta`; id global frente a C3; C2 frente al orden de comprobaciones | Aceptados: escritos en §4.1, §4.3, PK `(taller_id, id)` y C2 precisado |
| 3 | Go/No-Go 2 | — | API del sincronizador y de `persistencia.ts` sin firmas; cómo se ejecuta `cuentas.ts` | Aceptado: firmas en §4.1; `node scripts/cuentas.ts` / `npm run cuentas` |
| 3 | Go/No-Go 2 | — | §9 C2 no comprobable con `renderToString`; C4 y C5 incompletas | Aceptado: regla de rutas en `rutas.ts` probada sin dibujar; C4 y C5 completadas |
| 3 | Go/No-Go 2 | MENOR | Rollback de la migración y de `ORIGENES`; orden de ganchos de Vite para `_headers` | Aceptado: §8 ampliado; `_headers` en `closeBundle` leyendo el `index.html` final |

## Desvíos durante la implementación

- (ninguno aún)
