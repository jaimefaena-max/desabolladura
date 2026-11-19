---
titulo: Acta de recepción y hallazgos (daños preexistentes y objetos de valor con foto) en Desabolladura
fecha: 2026-11-19
repo: Workspace_Agencia/desabolladura
tamano: grande
estado: implementado
sha:
linear: (se crea al cerrar el plano)
---

# Acta de recepción y hallazgos

## 1. Problema y para quién

Hoy, al ingresar un vehículo, el trabajador anota «Daños previos u objetos de valor» en **un solo campo de texto** (`Recepcion.observaciones`). No admite fotos, no dice dónde está el daño, no se puede completar después del ingreso y **el cliente no lo ve** en su portal. Si al devolver el auto el cliente reclama «ese rayón lo hicieron ustedes» o «faltaba mi cartera», el taller no tiene prueba.

Para quién: el **trabajador** (registra rápido, con el teléfono), el **administrador** (ve el acta, registra la conformidad del cliente y controla la devolución de objetos) y el **cliente** (ve el acta en su portal y responde su conformidad por WhatsApp).

Contexto del repo: es una **demo sin servidor**. Las órdenes viven en `localStorage` del navegador del taller y las fotos en IndexedDB (`src/lib/fotos.ts`). El cliente ve su orden en otro teléfono gracias a un link con la orden comprimida dentro (`src/lib/seguimiento.ts`, «instantánea»). Las fotos del taller no viajan en ese link: en otro teléfono, `FotoGuardada` (`src/components/ui.tsx:210`) muestra «Foto en el sistema del taller».

## 2. Criterios de aceptación

- [ ] C1 — En «Ingresar vehículo», paso Vehículo, el campo de texto «Daños previos u objetos de valor» se reemplaza por la sección **«Acta de recepción»** con el botón «Agregar hallazgo». Un hallazgo tiene: tipo (**Daño preexistente** u **Objeto de valor**), categoría, ubicación, detalle (texto, máx. 300) y de 0 a 3 fotos («Sacar foto» con cámara y «Subir imagen» desde la galería). Al guardar la orden, los hallazgos quedan en `Orden.hallazgos`. El campo de texto que existía pasa a llamarse «Otras observaciones» (sigue guardando `recepcion.observaciones`).
- [ ] C2 — Un daño preexistente tiene la casilla «El cliente no lo quiere reparar» (marcada por defecto). Un objeto de valor pide dónde quedó (`en el vehículo` o `guardado en el taller`). El formulario muestra **siempre** (los dos tipos) el aviso: «Fotografía solo lo necesario. No abras bolsos ni fotografíes documentos, tarjetas, dinero, medicamentos ni personas. No escribas nombres, RUT, tarjetas, claves ni datos de salud».
- [ ] C3 — En la ficha del trabajador (`MaestroOrden`, `src/pages/Maestro.tsx`) aparece la sección «Acta de recepción»: lista de hallazgos y «Agregar hallazgo», para registrar algo encontrado **después** del ingreso. Cada alta deja un evento **privado** en el historial con fecha, hora y nombre del usuario en sesión.
- [ ] C4 — Al guardar un **objeto de valor** en `MaestroOrden` con teléfono del cliente, aparece «Avisar al cliente por WhatsApp» con el mensaje genérico: «Hola, le escribimos de <taller>. Al trabajar en su vehículo encontramos un objeto de valor y quedó resguardado. Consúltenos el detalle.» (sin categoría, ubicación ni lugar). Pulsarlo abre WhatsApp y deja el evento privado «Aviso de objeto de valor abierto en WhatsApp». No envía nada solo.
- [ ] C5 — Cada hallazgo muestra fecha, hora y quién lo registró en la ficha del administrador y en la del trabajador. En el portal del cliente no aparece quién lo registró.
- [ ] C6 — El portal del cliente (`ClientePortal`, `src/pages/Cliente.tsx`) muestra la sección **«Acta de recepción»** cuando hay hallazgos no anulados:
  - Daños: categoría, ubicación, «No se repara» si corresponde, fecha y fotos.
  - Objetos: solo «Objeto de valor registrado», fecha y estado («Devuelto el <fecha>» o «Resguardado»).
  - En el equipo del taller (sesión local), las fotos se ven y el detalle de daños también. Abierto desde el link en otro teléfono, cada foto se muestra como «Foto en el sistema del taller» y no hay detalle (opción A aprobada).
- [ ] C7 — Conformidad del cliente (solo por WhatsApp, que es lo único que hace el cliente real):
  - El portal muestra «Para dar tu conformidad, responde «Estoy de acuerdo» al WhatsApp del taller». Si el portal se abrió desde el link y trae `wspTaller`, hay un botón que abre WhatsApp con «Estoy de acuerdo con el acta de recepción de la orden N.». No hay botón que guarde la conformidad en el portal.
  - En la ficha del administrador, botón «El cliente dio su conformidad por WhatsApp», visible si hay hallazgos no anulados y no hay conformidad. Guarda `Orden.conformidadRecepcion` (ISO) y deja el evento «Conformidad del cliente al acta de recepción (respuesta por WhatsApp), registrada por <usuario>».
  - Si después se agrega o se anula un hallazgo, la conformidad vuelve a `null` y el evento lo dice.
- [ ] C8 — Devolución y entrega: en la ficha del administrador, cada objeto de valor no anulado y sin devolver tiene «Marcar devuelto». Al marcarlo se guarda `devueltoEl`, se **borran sus fotos** de IndexedDB y queda el evento privado «Objeto de valor devuelto; fotos borradas». Mientras haya objetos por devolver (`puedeEntregar(o) === false`), «Marcar como entregado» queda deshabilitado con la pista «Devuelve primero los objetos de valor (N)».
- [ ] C9 — Un hallazgo guardado **no se borra**. Solo el administrador puede **anularlo** con un motivo obligatorio. El hallazgo anulado queda visible tachado con el motivo en las fichas del administrador y del trabajador, no aparece en el portal ni en el link, no cuenta para `puedeEntregar` y conserva sus fotos. El evento privado dice quién anuló, qué hallazgo (`resumenHallazgo`) y el motivo. Antes de guardar la orden (en `NuevoVehiculo`), un hallazgo sí se puede quitar (borra sus fotos).
- [ ] C10 — Link de seguimiento: `empaquetar` lleva los hallazgos no anulados **sin `autor`, sin `detalle` y sin ids de fotos**, solo con la cantidad de fotos. Los objetos viajan sin categoría, ubicación ni resguardo. La conformidad viaja como fecha. Si el link con hallazgos pasa de `LARGO_MAX_LINK` (8000 caracteres de la parte comprimida, la misma medida de hoy), se arma sin hallazgos y con la bandera `hr: 1`; el portal muestra entonces «El acta de recepción está en el taller» y no muestra el botón de conformidad. En `desempaquetar`, un bloque de hallazgos mal formado se descarta (sin hallazgos y con `hr`), sin invalidar el resto del link.
- [ ] C11 — Los eventos de hallazgos, avisos, devoluciones, anulaciones y conformidad son **privados** (`Evento.privado: true`) y **no aparecen** en el expediente para la compañía (`src/components/Expediente.tsx`, «Hitos del proceso»).
- [ ] C12 — Órdenes guardadas antes del cambio siguen abriendo: `repararOrden` completa `hallazgos` saneados con `repararHallazgo` (se descartan los que no tienen la forma mínima) y `conformidadRecepcion: null` si no es texto. El texto de `observaciones` se sigue mostrando como «Observaciones de recepción».
- [ ] C13 — «Restablecer demo» borra también las fotos de los hallazgos (`fotosDe` las incluye). Si el trabajador sale de «Ingresar vehículo» sin guardar la orden, las fotos de los hallazgos de ese ingreso se borran.
- [ ] C14 — La orden de muestra `COR7X2` trae un daño preexistente de ejemplo sin foto («Rayón» en «Parachoque delantero», «El cliente no lo quiere reparar»), también para quien ya visitó la demo (`conFotosDemo`).
- [ ] C15 — `npx tsc --noEmit`, `npm test` y `npm run build` en verde. Las pruebas nuevas de §9 existen y pasan.

## 3. Alcance

- Entra: tipos, lógica pura en `src/lib/hallazgos.ts`, componente `src/components/Hallazgos.tsx`, ingreso, ficha del trabajador, ficha del administrador, portal del cliente, link de seguimiento, eventos privados y su filtro en el expediente, reparación de órdenes viejas, limpieza de fotos, semilla de la demo y estilos.
- No entra:
  - Fotos visibles en el teléfono del cliente (requiere servidor; fase de producción, SOL-111). Ahí se define el plazo de conservación de las fotos de daños.
  - Firma del cliente en el mesón.
  - Hallazgos en la cotización PDF o en el expediente para la compañía.
  - Marcar el daño sobre el modelo 3D.
  - Editar un hallazgo guardado (se anula y se crea otro).

## 4. Diseño técnico

### 4.1 Ficheros

| Ruta | Nuevo / cambia | Qué cambia | Por qué |
|---|---|---|---|
| `src/lib/types.ts` | cambia | `Evento.privado?: true`; tipos `TipoHallazgo`, `Hallazgo`; campos opcionales `hallazgos?`, `conformidadRecepcion?` en `Orden` | Modelo |
| `src/lib/automatizacion.ts` | cambia | `conEvento(o, texto, privado = false)`: con `privado` agrega `privado: true` al evento. Nueva función pura `hitosPublicos(o: Orden): Evento[]` = `[...o.historial].filter(e => !e.privado).reverse().slice(-14)` | C3, C11 |
| `src/lib/hallazgos.ts` | nuevo | Listas fijas y funciones puras de §4.2 | Lógica probable |
| `src/lib/hallazgos.test.ts` | nuevo | Pruebas de §9 para `hallazgos.ts` y `conFotosDemo` (C14, importa `./seed`) | C3, C4, C7–C10, C12, C14 |
| `src/lib/logica.test.ts` | cambia | Prueba de `hitosPublicos` (C11). Va en el **primer** commit (§4.3 paso 13), así el rollback del segundo no la borra | C11 |
| `src/lib/store.ts` | cambia | `repararOrden` (C12); `fotosDe` suma `(o.hallazgos ?? []).flatMap(h => h.fotos)` (C13) | C12, C13 |
| `src/lib/store.test.ts` | cambia | Pruebas de `repararOrden` y `fotosDe` (si `fotosDe` no se exporta, se exporta) | C12, C13 |
| `src/lib/seguimiento.ts` | cambia | `Paquete` gana `h?` y `hr?` y `k?`; `empaquetar` y `desempaquetar` según §4.3 paso 10 | C6, C10 |
| `src/lib/seguimiento.test.ts` | cambia | Pruebas de §9 | C10 |
| `src/lib/seed.ts` | cambia | Campo opcional `hallazgos?: Hallazgo[]` en la interfaz `Base`; `orden(b)` lo copia a la orden como `hallazgos: b.hallazgos ?? []` (dato directo, **sin** `agregarHallazgo` ni evento). En `COR7X2`: `hallazgos: [{ id: 'demoh1', tipo: 'dano', categoria: 'Rayón', ubicacion: 'Parachoque delantero', detalle: 'Rayón de unos 10 cm, del lado derecho.', fotos: [], creado: <la misma fecha `creada` que calcula orden(b)>, autor: 'Recepción', noRepara: true }]` (para usar `creada`, `orden(b)` arma la orden y después mapea `creado` de los hallazgos sin fecha). `conFotosDemo` copia `f.hallazgos` si la orden guardada no tiene hallazgos y ningún evento de su historial contiene «allazgo» | C14 |
| `src/components/Expediente.tsx` | cambia | `const hitos = hitosPublicos(o);` en lugar del cálculo en línea (línea 42) | C11 |
| `src/components/Hallazgos.tsx` | nuevo | `HallazgoForm`, `ListaHallazgos` (§4.2) | C1–C9 |
| `src/pages/NuevoVehiculo.tsx` | cambia | Estado `hallazgos`; sección en el paso Vehículo; «Otras observaciones»; guardado; limpieza al desmontar | C1, C2, C13 |
| `src/pages/Maestro.tsx` | cambia | Sección «Acta de recepción» en `MaestroOrden` con alta y aviso | C3–C5, C9 |
| `src/pages/Admin.tsx` | cambia | Ficha de la orden: «Observaciones de recepción», `ListaHallazgos` con «Marcar devuelto» y «Anular», conformidad; `Acciones`: entrega bloqueada con `puedeEntregar` | C5, C7–C9, C12 |
| `src/pages/Cliente.tsx` | cambia | Sección «Acta de recepción» y pie de conformidad en `ClientePortal` | C6, C7, C10 |
| `src/styles.css` | cambia | `.acta`, `.hallazgo`, `.hallazgo.anulado`, `.hallazgo-form`, `.hallazgo-fotos`, `.aviso-privacidad`, con variables existentes | Presentación |

### 4.2 Datos, tipos y firmas

```ts
// src/lib/types.ts
export interface Evento { fecha: string; texto: string; privado?: true; }
export type TipoHallazgo = 'dano' | 'objeto';
export interface Hallazgo {
  id: string;                 // uid(): cumple ID = /^[a-z0-9]{1,20}$/i
  tipo: TipoHallazgo;
  categoria: string;          // de CATEGORIAS[tipo]; '' en objetos que llegan del link
  ubicacion: string;          // de UBICACIONES[tipo]; '' en objetos que llegan del link
  detalle: string;            // ≤ 300; nunca viaja en el link
  fotos: string[];            // ids de IndexedDB, 0..3; nunca viajan en el link
  fotosEnTaller?: number;     // solo en hallazgos que llegan del link: cuántas fotos tiene en el taller
  creado: string;             // ISO
  autor: string;              // nombre del usuario en sesión; nunca viaja en el link
  noRepara?: boolean;         // solo 'dano'
  resguardo?: 'vehiculo' | 'taller'; // solo 'objeto'
  devueltoEl?: string | null; // solo 'objeto'
  anulado?: { el: string; por: string; motivo: string }; // nunca viaja en el link
}
// en Orden:
hallazgos?: Hallazgo[];
conformidadRecepcion?: string | null;
```

```ts
// src/lib/hallazgos.ts — listas literales (no derivadas de PIEZAS: renombrar una pieza no debe invalidar links ya enviados)
export const CATEGORIAS: Record<TipoHallazgo, readonly string[]> = {
  dano: ['Rayón', 'Abolladura', 'Trizadura', 'Pintura dañada', 'Pieza suelta o rota', 'Otro'],
  objeto: ['Cartera o bolso', 'Documentos', 'Dinero', 'Celular o electrónico', 'Lentes', 'Herramientas', 'Otro'],
};
export const UBICACIONES: Record<TipoHallazgo, readonly string[]> = {
  dano: ['Capot', 'Parachoque delantero', 'Parachoque trasero', 'Tapabarro delantero derecho', 'Tapabarro delantero izquierdo',
    'Puerta delantera derecha', 'Puerta delantera izquierda', 'Puerta trasera derecha', 'Puerta trasera izquierda',
    'Costado trasero derecho', 'Costado trasero izquierdo', 'Espejo derecho', 'Espejo izquierdo', 'Techo', 'Maletera o portón',
    'Parabrisas', 'Luneta trasera', 'Vidrio lateral', 'Focos o luces', 'Llantas', 'Interior'],
  objeto: ['Asiento delantero', 'Asiento trasero', 'Bajo un asiento', 'Guantera', 'Consola central', 'Maletera', 'Piso', 'Otro'],
};
export const MAX_FOTOS = 3, MAX_DETALLE = 300, MAX_HALLAZGOS = 30;
const ID = /^[a-z0-9]{1,20}$/i;

// hallazgos.ts NO importa `./store` (cargaría localStorage al importarse). Importa solo de './types' y './automatizacion' (conEvento).
// El id lo genera quien llama, con `uid()` de `src/lib/store.ts` (los componentes ya importan de store).
export const vigentes = (o: Pick<Orden, 'hallazgos'>) => (o.hallazgos ?? []).filter(h => !h.anulado);
export function nuevoHallazgo(d: Omit<Hallazgo, 'id' | 'creado'>, id: string, ahora = new Date()): Hallazgo; // creado = ahora.toISOString(), detalle recortado a 300
/** Agrega; si había conformidad la borra. Evento privado «Hallazgo registrado por <autor>: <resumen>» (+ « · conformidad anterior anulada»). Tope MAX_HALLAZGOS: si ya hay 30, devuelve la orden sin cambios. */
export function agregarHallazgo(o: Orden, h: Hallazgo): Orden;
/** Marca anulado (motivo recortado, obligatorio: con motivo vacío devuelve la orden sin cambios); borra la conformidad; evento privado «Hallazgo anulado por <por>: <resumen> · motivo: <motivo>» (+ « · conformidad anterior anulada» si había). */
// Fechas: `ahora` se usa para los campos del hallazgo y de la orden; los eventos usan `conEvento`, que sella con new Date() (igual que hoy).
export function anularHallazgo(o: Orden, id: string, por: string, motivo: string, ahora = new Date()): Orden;
/** Fija devueltoEl. Devuelve la orden y los ids de fotos a borrar (las del objeto). Evento privado «Objeto de valor devuelto; fotos borradas». */
export function marcarDevuelto(o: Orden, id: string, ahora = new Date()): { orden: Orden; fotos: string[] };
/** Fija conformidadRecepcion. Evento privado «Conformidad del cliente al acta de recepción (respuesta por WhatsApp), registrada por <por>». */
export function darConformidad(o: Orden, por: string, ahora = new Date()): Orden;
export function objetosPorDevolver(o: Orden): Hallazgo[]; // vigentes, tipo 'objeto', sin devueltoEl
export const puedeEntregar = (o: Orden) => objetosPorDevolver(o).length === 0;
/** `${categoria || (tipo === 'dano' ? 'Daño' : 'Objeto de valor')}${ubicacion ? ` en ${ubicacion}` : ''}`: «Rayón en Capot», «Cartera o bolso en Guantera»; objeto del link o con campos vacíos: «Objeto de valor». */
export function resumenHallazgo(h: Hallazgo): string;
export function mensajeObjeto(empresa: Pick<Empresa, 'nombre'>): string; // texto de C4, sin datos del objeto
/**
 * Saneo de lo guardado en el equipo. null si falta id que cumpla ID, tipo válido o creado parseable.
 * Defaults: categoria, ubicacion, detalle, autor → '' si no son string; fotos → [] si no es array (y se quedan solo los strings que cumplen ID, máx. 3);
 * noRepara solo si es boolean y tipo 'dano'; resguardo solo 'vehiculo'|'taller' y tipo 'objeto'; devueltoEl solo string;
 * anulado solo si es objeto con el, por y motivo string.
 */
export function repararHallazgo(x: unknown): Hallazgo | null;
/** Forma que viaja en el link (sin autor, detalle, fotos ni anulado; objetos sin categoría, ubicación ni resguardo). */
export function hallazgoAlLink(h: Hallazgo): Record<string, unknown>;
/** Valida lo que llega del link. null si no tiene la forma de hallazgoAlLink. */
export function hallazgoDelLink(x: unknown): Hallazgo | null;
```

Forma en el link (`hallazgoAlLink`), claves cortas:
- Daño: `{ i: id, t: 'd', c: categoria, u: ubicacion, f: fotos.length, r: creado, n?: 1 (noRepara) }`
- Objeto: `{ i: id, t: 'o', f: fotos.length, r: creado, d?: devueltoEl }`

Reglas de `hallazgoDelLink`: `i` cumple `ID`; `t` es `'d'` u `'o'`; en daños, `c` ∈ `CATEGORIAS.dano` y `u` ∈ `UBICACIONES.dano`; `f` entero 0..3; `r` fecha parseable; `n` solo `1` y solo en daños; `d` fecha parseable o ausente y solo en objetos. Cualquier otra clave se ignora. Devuelve `Hallazgo` con `detalle: ''`, `fotos: []`, `fotosEnTaller: f`, `autor: ''`, y en objetos `categoria: ''`, `ubicacion: ''`.

`Hallazgos.tsx`:
```ts
export function HallazgoForm(props: { autor: string; onGuardar: (h: Hallazgo) => void; onCancelar: () => void }): JSX.Element;
export function ListaHallazgos(props: {
  hallazgos: Hallazgo[];
  modo: 'taller' | 'cliente';                  // 'cliente': sin autor, sin anulados, objetos con texto genérico, sin detalle si viene del link
  quitar?: (id: string) => void;               // solo NuevoVehiculo (antes de guardar)
  devolver?: (id: string) => void;             // solo Admin
  anular?: (id: string, motivo: string) => void; // solo Admin; pide motivo en un campo en línea
}): JSX.Element | null;
```
`HallazgoForm` guarda cada foto con `guardarFoto(uid(), await reducirImagen(f, 1100))` y lleva la lista de ids en su estado. Si `guardarFoto` falla, muestra «No se pudo guardar la foto. Puede que el equipo no tenga espacio.». «Quitar» una foto la borra con `borrarFotos([id])`. «Cancelar» borra todas sus fotos. Al desmontarse sin guardar ni cancelar, también las borra.

### 4.3 Flujo

1. **Ingreso.** `NuevoVehiculo`, paso Vehículo, donde hoy está el `<input>` de «Daños previos u objetos de valor» (`src/pages/NuevoVehiculo.tsx`, junto a «Kilometraje»): ese input pasa a «Otras observaciones», y debajo va la sección «Acta de recepción» con `ListaHallazgos` (modo taller, con `quitar`) y el botón «Agregar hallazgo».
2. «Agregar hallazgo» muestra `HallazgoForm` en línea: tipo (dos botones), categoría (botones), ubicación (`<select>`), detalle (`<textarea maxLength=300>`), fotos y el aviso de privacidad de C2. En daños, la casilla «El cliente no lo quiere reparar» (marcada). En objetos, el selector de resguardo («Quedó en el vehículo» / «Guardado en el taller»). «Guardar hallazgo» exige categoría y ubicación.
3. Fotos: dos `<input type="file" accept="image/*" hidden>`, uno con `capture="environment"` («Sacar foto») y otro sin `capture` («Subir imagen»). Con 3 fotos se ocultan los dos botones.
4. `NuevoVehiculo` guarda los hallazgos del ingreso en un estado `hallazgos` y un `useRef` con sus ids de fotos. Al guardar la orden (donde hoy se arma el objeto `o` con `recepcion`) aplica `agregarHallazgo` por cada uno sobre la orden nueva (eventos privados) y marca el ref como guardado. Un `useEffect` de limpieza borra con `borrarFotos` las fotos de los hallazgos si el componente se desmonta sin haber guardado la orden. «Quitar» borra las fotos de ese hallazgo.
5. **Después del ingreso.** `MaestroOrden` muestra, bajo la galería de fotos, la sección «Acta de recepción» con `ListaHallazgos` (modo taller, sin acciones) y «Agregar hallazgo». Guardar: `actualizar(id, x => agregarHallazgo(x, h))`, con `autor = sesion()!.nombre`.
6. Si el hallazgo guardado es un objeto y `o.cliente.telefono` existe, se muestra «Avisar al cliente por WhatsApp» (`<a href={enlaceWhatsApp(tel, mensajeObjeto(empresa))} target="_blank" rel="noreferrer noopener">`). Su `onClick` llama `actualizar(id, x => conEvento(x, 'Aviso de objeto de valor abierto en WhatsApp', true))`. El botón se muestra hasta que se pulsa o se sale de la pantalla.
7. **Administrador.** En la ficha (`src/pages/Admin.tsx`, bloque `<dl className="ficha">`): la fila «Recepción» pasa a «Observaciones de recepción». Debajo de la ficha, sección «Acta de recepción» con `ListaHallazgos` (modo taller, con `devolver` y `anular`) y la conformidad: «El cliente dio su conformidad el <fecha>» o, si hay hallazgos vigentes, el botón de C7. `devolver` llama `marcarDevuelto` y luego `borrarFotos(fotos)`. `anular` llama `anularHallazgo(o, id, sesion()!.nombre, motivo)`.
8. En `Acciones` (`src/pages/Admin.tsx`), el botón «Marcar como entregado» recibe `disabled={!puedeEntregar(o)}` y, si está deshabilitado, la pista «Devuelve primero los objetos de valor (N)».
9. **Cliente.** `ClientePortal`, después de `<Avances o={o} />`: si `vigentes(o).length > 0`, sección «Acta de recepción» con `ListaHallazgos` en modo cliente. Si la orden vino del link con `hr`, en su lugar el texto «El acta de recepción está en el taller». Pie: si hay `conformidadRecepcion`, «Diste tu conformidad el <fecha>»; si no y no hay `hr`, el texto de C7 y, si es link con `wspTaller`, el botón de WhatsApp. En modo cliente, una foto con id se muestra con `FotoGuardada`; un hallazgo con `fotosEnTaller > 0` muestra esa cantidad de recuadros «Foto en el sistema del taller» (mismo estilo `.foto-taller`).
10. **Link.** `empaquetar(o, taller, wspTaller = '', limite = LARGO_MAX_LINK)` (el cuarto parámetro existe para poder probar el recorte): arma el paquete actual más `h: vigentes(o).map(hallazgoAlLink)` (si hay) y `k: o.conformidadRecepcion` (si hay). Calcula el resultado; si su largo supera `limite` y el paquete tenía `h`, rearma sin `h` ni `k` y con `hr: 1`. Si el link **sin hallazgos** ya supera el tope (por ítems y notas), es un límite que existe hoy y queda fuera de este alcance: no se cambia. `desempaquetar`: si `d.h` existe y no es un array de ≤ `MAX_HALLAZGOS` cuyos elementos pasan todos `hallazgoDelLink`, la orden queda con `hallazgos: []` y `hr` verdadero; el resto del link sigue válido. `k` se acepta solo si es fecha parseable. La orden devuelta incluye `hallazgos`, `conformidadRecepcion` y un campo `actaEnTaller: boolean` (de `hr`), que se agrega al tipo de retorno de `desempaquetar` junto a `taller` y `wspTaller`.
11. **Órdenes viejas.** `repararOrden` en `src/lib/store.ts`: `hallazgos: lista(o.hallazgos).map(repararHallazgo).filter(Boolean)`, `conformidadRecepcion: typeof o.conformidadRecepcion === 'string' ? o.conformidadRecepcion : null`.
12. **Expediente.** `src/components/Expediente.tsx:42`: `const hitos = hitosPublicos(o);` (función de `automatizacion.ts`).
13. **Commits.** Primero un commit solo con `Evento.privado`, `conEvento(…, privado)`, `hitosPublicos` y su uso en `Expediente.tsx` (con su prueba). Después, el resto. El rollback (§8) revierte solo el segundo.

## 5. Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Miniaturas de las fotos dentro del link (opción B) | Varios KB por foto, supera `LARGO_MAX_LINK`; las fotos de objetos irían en un URL reenviable |
| Conformidad con un botón en el portal | En esta demo el portal con datos guardados solo se abre en el equipo del taller (`Cliente.tsx:136`); quien pulsaría sería el personal, no el cliente. La respuesta por WhatsApp sí es del cliente |
| Borrar hallazgos | Permitiría destrabar la entrega o eliminar evidencia tras la conformidad; se reemplaza por anular con motivo |
| Recortar el detalle o las fotos para que el link quepa | Altera la evidencia que ve el cliente; se prefiere no enviarlos y decir que el acta está en el taller |
| Marcar el daño tocando el modelo 3D | Más lento en el mesón y no cubre vidrios, llantas ni interior |
| Reusar `Orden.fotos` (antes/después) | Mezcla evidencia de recepción con fotos del trabajo |

## 6. Ruta a producción

Push a `main` del repo `desabolladura` dispara **dos** workflows:
- `.github/workflows/deploy.yml` → GitHub Pages (`jaimefaena-max.github.io/desabolladura`), ~1 min.
- `.github/workflows/deploy-taller.yml` → `npm ci`, `npm test`, build con `DEMO_BASE=/` y `VITE_API_PATENTES`, Cloudflare Pages `taller.solucionesconia.cl`, ~1 min.

Un push a `main` **publica**. Publicar está autorizado por el dueño del producto.

## 7. Seguridad y datos

- Mutaciones sin GET / rate limit: no aplica, no hay servidor.
- Qué se guarda y dónde: hallazgos en `localStorage` (con la orden) y fotos en IndexedDB, ambos en el equipo del taller.
- Quién lo ve: personal del taller (fichas de trabajador y administrador). El cliente ve en el link solo daños (categoría, ubicación, «no se repara», fecha, cantidad de fotos) y, de los objetos, solo que existen y si se devolvieron. **No viajan** en el link: `detalle`, fotos, `autor`, anulaciones, ni categoría, ubicación o resguardo de objetos.
- Terceros: los eventos de hallazgos son privados y el expediente para la compañía los excluye (C11).
- WhatsApp: el aviso de objeto es genérico (no dice qué ni dónde), por si el teléfono está mal escrito.
- Minimización: aviso de privacidad en el formulario para los dos tipos (C2); el detalle no viaja.
- Conservación: las fotos de un objeto se borran al marcarlo devuelto (C8). Las fotos de daños se conservan mientras la orden exista en el equipo; «Restablecer demo» las borra (C13). El plazo de producción se define en SOL-111.
- Link: entrada no confiable; `hallazgoDelLink` acepta listas fijas, ids alfanuméricos y fechas; React escapa el texto.
- Secretos: ninguno.

## 8. Riesgos y rollback

| Riesgo | Mitigación |
|---|---|
| Cuota de IndexedDB llena | `reducirImagen(f, 1100)`, máx. 3 fotos por hallazgo y 30 hallazgos por orden; mensaje de error visible |
| Fotos huérfanas | Borrado al quitar (antes de guardar), cancelar, desmontar sin guardar, devolver un objeto y restablecer la demo |
| Link demasiado largo | Sin `h` y con `hr`; prueba con detalle y categorías al máximo |
| Link con hallazgos mal formados | Se descartan solo los hallazgos; el presupuesto y el avance siguen visibles |
| Órdenes viejas o corruptas | `repararHallazgo` + pruebas |
| Evidencia borrada | No hay borrado: solo anulación con motivo, que conserva fotos |
| Datos a la aseguradora | Eventos privados filtrados en `Expediente.tsx` |

Rollback: `git revert <sha del segundo commit>` y push a `main` (los dos workflows republican). **No se revierte el primer commit** (`Evento.privado` + `hitosPublicos`): así los eventos privados ya guardados siguen fuera del expediente de la compañía. Los demás datos nuevos son campos opcionales que esa versión ignora. Efecto aceptado del rollback: se pierde el bloqueo de entrega con objetos sin devolver y el acta deja de verse (los datos quedan guardados y reaparecen si se vuelve a publicar).

## 9. Plan de pruebas

| Criterio | Prueba |
|---|---|
| C3 | `hallazgos.test.ts`: `agregarHallazgo` agrega, evento privado con autor; con 30 hallazgos no agrega |
| C4 | `mensajeObjeto` no contiene ninguna categoría ni ubicación de las listas |
| C7 | `darConformidad` fija fecha y evento privado con quién; `agregarHallazgo` y `anularHallazgo` borran una conformidad previa y su evento termina en « · conformidad anterior anulada»; sin conformidad previa, el evento no lleva ese sufijo |
| C8 | `objetosPorDevolver`/`puedeEntregar`: excluye daños, anulados y devueltos; `marcarDevuelto` fija `devueltoEl` y devuelve las fotos del objeto |
| C9 | `anularHallazgo` con motivo vacío no cambia nada; con motivo marca `anulado` y conserva `fotos`; `vigentes` lo excluye |
| C10 | `hallazgoDelLink`: válido (daño y objeto); categoría fuera de lista → null; `n` en objeto → null; `f` = 4 → null; id con símbolos → null; resultado sin `autor` ni `detalle` |
| C10 | `seguimiento.test.ts`: ida y vuelta con un daño y un objeto: el daño conserva categoría/ubicación/`fotosEnTaller`, el objeto llega sin categoría ni ubicación; ningún `detalle`, `autor` ni id de foto en el JSON del paquete; anulado no viaja |
| C10 | `seguimiento.test.ts`: la orden `COR7X2` de `ordenesDemo()` (de `./seed`) con 30 hallazgos al máximo (categorías y ubicaciones más largas, ids de 20 caracteres aleatorios) → `empaquetar(…)` ≤ 8000, incluye los 30 y `desempaquetar` no es null |
| C10 | Recorte: la misma orden con `empaquetar(o, t, '', limite)` donde `limite` = largo del link sin hallazgos + 10 → el resultado no tiene `h` ni `k`, `desempaquetar` devuelve `actaEnTaller: true` y `hallazgos: []` |
| C10 | `h` con un elemento malo → orden válida, `hallazgos` vacío, `actaEnTaller` verdadero; link sin `h` (regresión) → `hallazgos` vacío y `actaEnTaller` falso |
| C11 | `logica.test.ts`: `hitosPublicos` sobre una orden con eventos públicos y privados devuelve solo los públicos |
| C12 | `hallazgos.test.ts`: `repararHallazgo` con `{}`, `null` → null; con `{id:'a1', tipo:'dano', creado:'2026-11-19T10:00:00Z', fotos:'x'}` → hallazgo con `fotos: []`, `categoria: ''`, `ubicacion: ''`, `detalle: ''`, `autor: ''`, y `resumenHallazgo` = «Daño». `store.test.ts`: orden guardada sin `hallazgos` → `[]` (cargando el almacén como hacen las pruebas actuales, con `ordenesDemo()[0]`, **no** `COR7X2`, porque `conFotosDemo` le agrega `demoh1`) |
| C13 | `store.test.ts`: `fotosDe` incluye las fotos de los hallazgos |
| C14 | `hallazgos.test.ts` (importa `conFotosDemo` y `ordenesDemo` de `./seed`): `COR7X2` guardada sin hallazgos → vuelve con `demoh1`; con un evento «Hallazgo anulado…» en el historial → no lo agrega |
| C1–C9, C12, C13 | Prueba manual en `taller.solucionesconia.cl` siguiendo §4.3 pasos 1–9, y además: (C3/C4) en `MaestroOrden` agregar un objeto con teléfono, ver el botón de WhatsApp, pulsarlo y ver el evento en el historial del administrador; (C12) una orden con `observaciones` muestra «Observaciones de recepción»; (C13) en «Ingresar vehículo» agregar un hallazgo con foto, salir con «Volver» sin guardar y comprobar con `indexedDB` (consola) que la foto ya no está |
| C15 | `npx tsc --noEmit`, `npm test`, `npm run build` |

## Registro de revisión (Peces)

| Ronda | Pez | Severidad | Hallazgo (§) | Respuesta |
|---|---|---|---|---|
| 1 | comprensión | — | Tope 8000: ¿URL o parte comprimida? (§4.3) | Aceptado: C10 fija «parte comprimida, la medida actual» |
| 1 | comprensión | — | Ids de fotos en el link contradicen §7 | Aceptado: no viajan; viaja la cantidad (`f`) |
| 1 | comprensión | — | Admin puede dar conformidad en nombre del cliente | Aceptado: sin botón en el portal; admin registra la respuesta de WhatsApp con su nombre (C7) |
| 1 | comprensión | — | `fotosDe` no incluye hallazgos | Aceptado: C13 |
| 1 | comprensión | — | `desempaquetar` debe devolver hallazgos y conformidad | Aceptado: §4.3 paso 10 |
| 1 | comprensión | — | §9 citaba «§5 del flujo» | Aceptado: corregido a §4.3 |
| 1 | comprensión | — | `MAX_HALLAZGOS` no aplicado al alta | Aceptado: `agregarHallazgo` lo respeta |
| 1 | ana | BLOQUEANTE | Semilla no llega a visitantes recurrentes (`conFotosDemo`) | Aceptado: C14 y fila de `seed.ts` |
| 1 | ana | BLOQUEANTE | Recorte del link deja conformar un acta invisible | Aceptado: sin recortes parciales; sin `h`/`k` + `hr` y sin botón (C10) |
| 1 | ana | BLOQUEANTE | Quitar hallazgos evade el bloqueo de entrega y borra evidencia | Aceptado: no se borra; solo anular con motivo por admin (C9) |
| 1 | ana | IMPORTANTE | Conformidad sin actor real | Aceptado: C7 |
| 1 | ana | IMPORTANTE | Fotos huérfanas (restablecer, abandonar ingreso) | Aceptado: C13 |
| 1 | ana | IMPORTANTE | Saneo superficial en `repararOrden` | Aceptado: `repararHallazgo` + prueba |
| 1 | ana | IMPORTANTE | `detalle` y objetos en el link | Aceptado: no viajan (C10) |
| 1 | ana | IMPORTANTE | Validar `id` y `k`; `h` malo invalida todo; acoplamiento con `PIEZAS` | Aceptado: regex `ID`, `k` fecha, `h` malo se descarta solo; listas literales |
| 1 | ana | MENOR | Cobertura de pruebas | Aceptado: §9 reescrito; `puedeEntregar` extraído |
| 1 | ana | MENOR | Error de cuota sin mensaje | Aceptado: mensaje en `HallazgoForm` |
| 1 | ana | — | Aviso de WhatsApp se pierde sin rastro | Aceptado: evento al pulsar (C4) |
| 1 | nacho | BLOQUEANTE | Eventos llegan al expediente de la aseguradora | Aceptado: `Evento.privado` + filtro (C11) |
| 1 | nacho | IMPORTANTE | Objetos de valor + patente en el link | Aceptado: objetos sin categoría, ubicación ni resguardo (C10) |
| 1 | nacho | IMPORTANTE | `detalle` libre puede tener datos de salud | Aceptado: no viaja; aviso ampliado (C2) |
| 1 | nacho | IMPORTANTE | Fotos huérfanas | Aceptado: C13 |
| 1 | nacho | IMPORTANTE | Sin plazo de conservación | Aceptado en parte: fotos de objetos se borran al devolver (C8); daños hasta restablecer; plazo de producción en SOL-111 (demo sin servidor) |
| 1 | nacho | IMPORTANTE | Conformidad falsa desde «Ver como cliente» | Aceptado: C7 |
| 1 | nacho | MENOR | Quitar borra evidencia | Aceptado: C9 |
| 1 | nacho | MENOR | Aviso de privacidad solo en objetos | Aceptado: en los dos tipos (C2) |
| 1 | nacho | MENOR | WhatsApp a número no verificado con detalle | Aceptado: mensaje genérico (C4) |
| 2 | go/no-go | NO-GO 1 | Prueba de largo imposible: 60 ítems con notas ya pasan 8000 sin hallazgos | Aceptado: desborde por ítems fuera de alcance (§4.3 paso 10); prueba con orden normal + 30 hallazgos, y recorte probado con `limite` |
| 2 | go/no-go | NO-GO 2 | Prueba del expediente sin fichero; `createPortal` impide renderizar | Aceptado: `hitosPublicos` pura en `automatizacion.ts`, probada en `hallazgos.test.ts` |
| 2 | go/no-go | NO-GO 3 | Prueba de la semilla sin fichero | Aceptado: en `hallazgos.test.ts` |
| 2 | go/no-go | NO-GO 4 | Rollback reexpone eventos privados | Aceptado: dos commits; el del filtro no se revierte (§4.3 paso 13, §8) |
| 2 | go/no-go | NO-GO 5 | `repararHallazgo` sin defaults | Aceptado: defaults definidos; `resumenHallazgo` con vacíos |
| 2 | go/no-go | NO-GO 6 | Semilla incompleta; `orden(b)` recibe `Base` | Aceptado: campo en `Base`, hallazgo literal completo, dato directo sin evento |
| 2 | go/no-go | NO-GO 7 | Origen de `uid()` | Aceptado: `nuevoHallazgo` recibe el id; `hallazgos.ts` no importa `store` |
| 3 | go/no-go 2 | NO-GO 1–3 | C3, C4, C12 y C13 (salir sin guardar) sin prueba | Aceptado: agregados a la prueba manual de §9 con pasos concretos |
| 3 | go/no-go 2 | NO-GO 4 | Texto del evento al anular con conformidad | Aceptado: sufijo definido en §4.2 y probado en §9 |
| 3 | go/no-go 2 | NO-GO 5 | Prueba de `hitosPublicos` y el commit | Aceptado: va en `logica.test.ts`, primer commit |
| 3 | go/no-go 2 | menores | `/i` del id, fecha de eventos, orden de prueba de `store.test.ts` | Aceptados en §4.2 y §9 |

Cierre de la revisión: la segunda ronda de Go/No-Go dio NO-GO por 5 puntos editoriales, todos aceptados sin disputa. Ninguno cambia el diseño, así que no hubo tercera ronda: no quedaban puntos en disputa que escalar. Estado `go` dado por el Elefante con esa constancia.

## Desvíos durante la implementación

- `marcarDevuelto` además vacía `fotos` del objeto en la orden (las fotos se borran de IndexedDB): así ninguna vista intenta cargarlas.
- Componente extra `AgregarHallazgo` (botón + formulario) en `Hallazgos.tsx`, usado por el ingreso y la ficha del trabajador; con el tope de 30 muestra un aviso en vez del botón.
- `Base.hallazgos` en la semilla es `Omit<Hallazgo, 'creado'>[]` (la fecha la pone `orden(b)`).
- `hallazgoDelLink` rechaza claves de otro tipo (`d` en daños; `c`/`u` en objetos): más estricto que «se ignora».
- Verificador (paso 5): B1 los objetos ya no muestran fotos al cliente y viajan con `f: 0`; B2 tope de 30 en el ingreso y en la ficha; B3 una foto que termina de guardarse con el formulario cerrado se borra; B4 si un hallazgo no pasaría la validación del portal, el link sale con `hr` (acta en el taller) en vez de ocultarla al descartarse.
- C7: el botón de WhatsApp del portal aparece solo en links que traen `wspTaller` (hoy, el del presupuesto). En los demás, el portal muestra el texto para responder.
- El administrador no crea hallazgos desde su ficha (lo hacen el ingreso y el trabajador); el historial del administrador sí muestra los eventos privados (personal del taller).
