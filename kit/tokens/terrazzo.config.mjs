// terrazzo.config.mjs · ruta alternativa con @terrazzo/cli 2.7.1 + @terrazzo/plugin-css 2.7.1,
// para proyectos que ya tienen npm y quieren plugins (Tailwind, JS, Swift). Lee el MISMO resolver
// que build-tokens.mjs y emite la misma estructura: bloques por contexto dentro de @layer tokens.
// Comprobado el 22-09-2026: plugin-css 2.7.1 no emite light-dark(); emite un bloque por permutación
// con prepare(), y cada permutación lleva TODOS los tokens. Con este resolver (no ortogonal: tema y
// contraste tocan los mismos tokens) `only` no filtra, y el bloque de alto contraste reescribía
// todo en claro: oscuro + alto contraste volvía a fondo claro. Por eso contraste y movimiento
// emiten solo las rutas que declara su propio fichero de contexto (`include`).
//   npm i -D @terrazzo/cli@2.7.1 @terrazzo/plugin-css@2.7.1 && npx terrazzo build
// No sustituye la medición de contraste de build-tokens.mjs: ejecútalo también (node build-tokens.mjs).
// ALCANCE: solo tokens.resolver.json (claro, oscuro, alto contraste, movimiento). NO emite los temas de
// lectura de lectura.resolver.json (sepia, negro) ni tokens/dist/preferencias.inline.js: en un lector,
// el CSS y el script de preferencias salen de build-tokens.mjs. No es «la misma salida» en ese caso.

import { defineConfig } from '@terrazzo/cli';
import pluginCSS from '@terrazzo/plugin-css';
import { readFileSync } from 'node:fs';
import { clampFluido } from './fluido.mjs';

// rutas de token que declara un fichero de contexto (lo que ese contexto cambia)
function rutas(fichero) {
  const fuera = [];
  const recorrer = (n, r) => Object.entries(n).forEach(([k, v]) => {
    if (k.startsWith('$') || !v || typeof v !== 'object') return;
    '$value' in v ? fuera.push([...r, k].join('.')) : recorrer(v, [...r, k]);
  });
  recorrer(JSON.parse(readFileSync(new URL(fichero, import.meta.url), 'utf8')), []);
  return fuera;
}

const capa = (sel, cuerpo, extra = '') => `${sel} {\n${extra}${cuerpo}\n}`;
const doble = (media, attr, on, off, scheme) => (c) => {
  const s = scheme ? `  color-scheme: ${scheme};\n` : '';
  return `@layer tokens {\n@media ${media} {\n${capa(`:root:where(:not([${attr}="${off}"]))`, c, s)}\n}\n${capa(`:root:where([${attr}="${on}"])`, c, s)}\n}`;
};

export default defineConfig({
  tokens: ['./tokens.resolver.json'],
  outDir: './dist-terrazzo/',
  lint: { rules: { 'core/consistent-naming': 'off' } },
  plugins: [
    pluginCSS({
      filename: 'tokens.css',
      transform(token) {
        // mismo clamp() que build-tokens.mjs para los tokens fluidos (tipo y espacio)
        return token.$type === 'dimension' ? (clampFluido(token) ?? undefined) : undefined;
      },
      permutations: [
        { input: {}, prepare: (c) => `@layer tokens {\n${capa(':root', c, '  color-scheme: light dark;\n')}\n:root:where([data-theme="light"]) { color-scheme: light; }\n}` },
        { input: { theme: 'dark' }, prepare: doble('(prefers-color-scheme: dark)', 'data-theme', 'dark', 'light', 'dark') },
        { input: { contrast: 'more' }, include: rutas('./contextos/contrast-more.tokens.json'), prepare: doble('(prefers-contrast: more)', 'data-contrast', 'more', 'normal') },
        { input: { motion: 'reduce' }, include: rutas('./contextos/motion-reduce.tokens.json'), prepare: doble('(prefers-reduced-motion: reduce)', 'data-motion', 'reduce', 'normal') },
      ],
    }),
  ],
});
