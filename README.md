# Desabolladura Premium

Demostración comercial de una app para talleres de desabolladura y pintura que trabajan con aseguradoras y particulares.

**Demo:** https://jaimefaena-max.github.io/desabolladura/

## Accesos de demostración

Todos los datos son ficticios.

| Perfil | Entrada |
|---|---|
| Maestro | Héctor Araya o Luis Quezada, PIN `1234` |
| Administradora | Paula Fuentealba, PIN `4321` |
| Cliente | Patente `LFZD-31`, código `COR7X2` |

## Qué hace

- **Maestro:** entra con su usuario, ingresa el vehículo con foto del padrón o a mano, toca la pieza dañada en el modelo 3D y marca el trabajo y su avance.
- **Administrador:** ve cada trabajo con un rango sugerido, fija el monto final y separa neto, IVA, deducible y saldo de la compañía.
- **Cliente:** entra con patente y código, y ve su vehículo en 3D con las piezas según avance, el porcentaje y las tareas pendientes.

## Inteligencia artificial

| Función | Sin clave | Con clave de Gemini (Ajustes) |
|---|---|---|
| Lectura de padrón | OCR en el navegador (Tesseract) | Gemini multimodal |
| Precio sugerido | Tabla de referencia Chile 2026 | Búsqueda en internet con fuentes |
| Imagen del vehículo | Modelo 3D paramétrico | Además, imagen generada por Gemini |

## Límites de esta versión

Es una demostración, no un sistema de producción:

- Los datos se guardan en el navegador de cada equipo. El portal del cliente solo muestra cambios hechos en ese mismo navegador.
- El ingreso con PIN es de demostración: no hay servidor que proteja los datos.
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
