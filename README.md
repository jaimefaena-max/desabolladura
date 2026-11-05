# Desabolladura Premium

Demostración comercial de una app para talleres de desabolladura y pintura que trabajan con aseguradoras y particulares.

**Demo:** https://jaimefaena-max.github.io/desabolladura/

## Accesos de demostración

Todos los datos son ficticios: los RUT tienen dígito verificador inválido y las patentes usan vocales, que las series chilenas no emiten.

| Perfil | Entrada |
|---|---|
| Administrador | Usuario `admin`, clave `admin2027` |
| Trabajador | Usuario `trabajador`, clave `trabajador2027` |
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
| Imagen del vehículo | Modelo 3D paramétrico | Además, imagen generada por Gemini |

## Límites de esta versión

Es una demostración, no un sistema de producción:

- Los datos se guardan en el navegador de cada equipo. El portal del cliente solo muestra cambios hechos en ese mismo navegador.
- Las cuentas y claves son de demostración y están en el código público: no hay servidor que proteja los datos.
- La clave de Gemini queda en el navegador. En producción debe vivir en un backend.
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
