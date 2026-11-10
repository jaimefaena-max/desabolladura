import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const requerir = createRequire(import.meta.url);

/**
 * Lector de padrones sin código de terceros: el motor de OCR (worker y núcleo WebAssembly) se
 * publica junto a la app desde node_modules, en la misma versión instalada, en vez de bajarlo de
 * un CDN. Solo el diccionario de español (datos, no código) sigue viniendo de jsDelivr.
 */
const OCR: Record<string, string> = {
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
};

/**
 * Política de seguridad de contenido (CSP). GitHub Pages no permite cabeceras propias: va como
 * <meta> y solo en la publicación (el servidor de desarrollo inyecta código en línea).
 * - script: solo archivos propios; WebAssembly del OCR.
 * - connect: Gemini (opcional) y el diccionario del OCR.
 * - style en línea: lo usa el aviso de rescate de index.html.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  // blob: y data: los usa el cargador 3D para las texturas que vienen dentro del modelo.
  "connect-src 'self' blob: data: https://generativelanguage.googleapis.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function blindaje(): Plugin {
  return {
    name: 'desabolladura-blindaje',
    configureServer(servidor) {
      servidor.middlewares.use((req, res, next) => {
        const archivo = OCR[req.url?.match(/\/ocr\/([\w.-]+)$/)?.[1] ?? ''];
        if (!archivo) return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.end(readFileSync(requerir.resolve(archivo)));
      });
    },
    generateBundle() {
      for (const [nombre, archivo] of Object.entries(OCR)) this.emitFile({ type: 'asset', fileName: `ocr/${nombre}`, source: readFileSync(requerir.resolve(archivo)) });
    },
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) => (ctx.server ? html : html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)),
    },
  };
}

export default defineConfig({
  base: '/desabolladura/',
  plugins: [react(), blindaje()],
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
