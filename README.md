# Desabolladura Premium

Demostración comercial de una app para talleres de desabolladura y pintura que trabajan con aseguradoras y particulares.

**Demo:** https://jaimefaena-max.github.io/desabolladura/

## Accesos de demostración

Todos los datos son ficticios: los RUT tienen dígito verificador inválido y las patentes usan vocales, que las series chilenas no emiten.

| Perfil | Entrada |
|---|---|
| Administrador | Botón «Demo Administrador» en `#/entrar` |
| Trabajador | Botón «Demo Trabajador» en `#/entrar` |
| Cliente | Patente `DEMA-22`, código `COR7X2` |

## Qué hace

- **Trabajador:** ingresa el vehículo con foto del padrón o a mano, toca la pieza dañada en el modelo 3D, marca avance y sube fotos. No ve precios.
- **Administrador:** tablero por etapas que se mueve solo, alertas, repuestos, montos con rango sugerido, cobro con deducible, avisos por WhatsApp y reportes.
- **Cliente:** entra con patente y código, ve su vehículo en 3D, etapas, tareas y fotos, y aprueba su presupuesto.
- **Varias empresas:** cada taller tiene nombre, logo, color y datos separados.

## Inteligencia artificial

| Función | Sin clave | Con clave de Gemini (Ajustes) |
|---|---|---|
| Lectura de padrón | OCR en el navegador: la foto no sale del equipo y el motor se descarga de jsDelivr | Gemini multimodal: la foto se envía a Google, previa confirmación |
| Precio sugerido | Tabla orientativa de demostración | Búsqueda en internet con fuentes |
| Fotos del modelo | Modelo 3D paramétrico por tipo de carrocería | Gemini busca en internet la generación exacta, sus rasgos y sus medidas, y crea 3 fotos de estudio (frente, costado y atrás) del mismo auto |
| Modelo 3D | Medidas típicas de su carrocería | Largo, ancho, alto y distancia entre ejes reales del modelo |

Las fotos se **generan**, no se copian: de internet solo se toman datos del modelo, nunca imágenes ajenas. Se muestran como «imagen referencial creada con IA».

## Límites de esta versión

Es una demostración, no un sistema de producción:

- Los datos se guardan en el navegador de cada equipo. El portal del cliente solo muestra cambios hechos en ese mismo navegador.
- Las cuentas y claves son de demostración y están en el código público: no hay servidor que proteja los datos.
- La clave de Gemini queda en el navegador. En producción debe vivir en un backend.
- Las fotos creadas en el ingreso viven en IndexedDB de ese navegador.
- No cargar datos reales de clientes.

Para producción faltan: backend con base de datos, autenticación real, almacenamiento de clave en servidor y tratamiento de datos personales conforme a la ley chilena.

## Desarrollo

```bash
npm install
npm run dev
npm test
npm run build
```

Un push a `main` compila y publica en GitHub Pages.

### Dominio propio: taller.solucionesconia.cl

Cloudflare Pages sirve la misma app en la raíz del dominio. La compilación usa `DEMO_BASE=/` (por defecto la base es `/desabolladura/`, la de GitHub Pages).

**Despliegue automático:** `.github/workflows/deploy-taller.yml` corre en cada push a `main`: pruebas, build con `DEMO_BASE=/` y `wrangler pages deploy` al proyecto `desabolladura`. Se puede lanzar a mano desde la pestaña Actions (`workflow_dispatch`).

**Secretos necesarios** (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN`: token con permiso *Cloudflare Pages: Edit* para la cuenta.
- `CLOUDFLARE_ACCOUNT_ID`: id de la cuenta de Cloudflare.

**Proyecto:** `desabolladura` (Pages, subida directa, sin conexión a Git). Dominio personalizado: `taller.solucionesconia.cl`.

El origen `https://taller.solucionesconia.cl` ya está en `ORIGENES` del Worker de patentes (`infra/worker-patentes/wrangler.toml`). Para que tenga efecto hay que desplegarlo con `npx wrangler deploy` desde `infra/worker-patentes`.

### Fotos de los vehículos de la demo

Se generan con el mismo camino que usa la app y se guardan en `public/autos/` y `src/lib/autosDemo.json`:

```bash
node scripts/generar-autos-demo.ts --solo toyota-corolla-2020   # probar con uno
node scripts/generar-autos-demo.ts                              # todos los que falten
```

Lee la clave de `GEMINI_API_KEY` (nunca la imprime). Es idempotente: no vuelve a pagar lo que ya existe. Costo aproximado: US$0,07 por imagen.
