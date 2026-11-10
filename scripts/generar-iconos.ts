/**
 * Genera src/components/iconos.tsx: solo los íconos de Phosphor que usa la app, y de cada uno solo
 * los grosores que aparecen en el código.
 *
 * Por qué: el paquete trae 6 grosores por ícono (≈2,8 kB cada uno) y la app usa 1 o 2; eran ≈130 kB
 * en el archivo de arranque. Con esto, ≈12 kB. Los íconos se ven exactamente igual (mismos trazos).
 *
 * Uso (después de agregar o cambiar íconos): node scripts/generar-iconos.ts
 * Grosores: en cada archivo se toman los literales de weight="…" y weight={…}; cada ícono de ese
 * archivo recibe esos grosores más «regular». La prueba de humo avisa si falta alguno.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const SRC = join(RAIZ, 'src');
const DEFS = join(RAIZ, 'node_modules/@phosphor-icons/react/dist/defs');

const archivos = (d: string): string[] => readdirSync(d).flatMap(n => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? archivos(p) : /\.tsx?$/.test(n) ? [p] : [];
});

const pesos = new Map<string, Set<string>>();
for (const f of archivos(SRC)) {
  if (f.endsWith('iconos.tsx')) continue;
  const s = readFileSync(f, 'utf8');
  const m = s.match(/import \{([^}]+)\} from '(?:@phosphor-icons\/react|[./]+components\/iconos|\.\/iconos)';/);
  if (!m) continue;
  const nombres = m[1].split(',').map(x => x.trim()).filter(Boolean);
  const grosores = (texto: string, w = new Set<string>()) => {
    const lit = texto.match(/weight="(\w+)"/), din = texto.match(/weight=\{([^}]+)\}/);
    if (lit) w.add(lit[1]);
    else if (din) for (const y of din[1].matchAll(/'(\w+)'/g)) w.add(y[1]);
    else w.add('regular');
    return w;
  };
  // Íconos guardados en listas ({ Icono: Nombre }) y dibujados como <Icono … />: los grosores de esos usos.
  const delArchivo = new Set<string>();
  for (const x of s.matchAll(/<Icono\b[^>]*>/g)) grosores(x[0], delArchivo);
  for (const n of nombres) {
    const t = pesos.get(n) ?? new Set<string>();
    const usos = [...s.matchAll(new RegExp(`<${n}\\b[^>]*>`, 'g'))];
    // Usado directo como <Nombre …>: solo sus grosores. Pasado como valor (Icono: Nombre): los del archivo.
    const indirecto = new RegExp(`Icono:\\s*${n}\\b`).test(s);
    usos.forEach(u => grosores(u[0], t));
    if (indirecto) delArchivo.forEach(x => t.add(x));
    if (!t.size) t.add('regular');
    pesos.set(n, t);
  }
}

type Nodo = [string, Record<string, string | number>];
/** Convierte el árbol de React de cada grosor en una lista plana de [etiqueta, atributos]. */
function aplanar(el: unknown, out: Nodo[] = []): Nodo[] {
  if (!el || typeof el !== 'object') return out;
  const e = el as { type: unknown; props: Record<string, unknown> };
  const { children, ...attrs } = e.props ?? {};
  if (typeof e.type === 'string') out.push([e.type, attrs as Record<string, string | number>]);
  (Array.isArray(children) ? children : [children]).forEach(c => aplanar(c, out));
  return out;
}

const datos: Record<string, Record<string, Nodo[]>> = {};
for (const [nombre, ws] of [...pesos].sort(([a], [b]) => a.localeCompare(b))) {
  const def = (await import(pathToFileURL(join(DEFS, `${nombre}.es.js`)).href)).default as Map<string, unknown>;
  datos[nombre] = Object.fromEntries([...ws].sort().filter(w => def.has(w)).map(w => [w, aplanar(def.get(w))]));
}

const salida = `/* Generado por scripts/generar-iconos.ts: no editar a mano. Íconos de Phosphor (licencia MIT). */
import { createElement, type SVGProps } from 'react';

export type Grosor = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
export interface PropsIcono extends Omit<SVGProps<SVGSVGElement>, 'ref'> { size?: number | string; weight?: Grosor; color?: string }
type Nodo = [string, Record<string, string | number>];

const D: Record<string, Partial<Record<Grosor, Nodo[]>>> = ${JSON.stringify(datos)};

/** Grosores pedidos que no se generaron (la prueba de humo exige que quede vacío). */
export const faltantes = new Set<string>();

function crear(nombre: string) {
  const Icono = ({ size = '1em', weight = 'regular', color = 'currentColor', ...resto }: PropsIcono) => {
    const g = D[nombre];
    let nodos = g[weight];
    if (!nodos) { faltantes.add(\`\${nombre}:\${weight}\`); nodos = g.regular ?? Object.values(g)[0] ?? []; }
    return createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, fill: color, viewBox: '0 0 256 256', ...resto },
      ...nodos.map(([t, a], i) => createElement(t, { key: i, ...a })));
  };
  Icono.displayName = nombre;
  return Icono;
}

${Object.keys(datos).map(n => `export const ${n} = crear('${n}');`).join('\n')}
`;
writeFileSync(join(SRC, 'components/iconos.tsx'), salida);
console.log(`iconos.tsx: ${Object.keys(datos).length} íconos, ${Object.values(datos).reduce((a, g) => a + Object.keys(g).length, 0)} grosores, ${Math.round(salida.length / 1024)} kB`);
