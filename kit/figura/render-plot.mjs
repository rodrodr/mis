#!/usr/bin/env node
// render-plot.mjs · figura de datos → SVG ESTÁTICO en el build (tipos/datos-editorial.md: «render en
// el build»). Observable Plot necesita un DOM y en Node no hay: se le da el de linkedom con la opción
// `document` (sin ella, Plot falla en Node). El cliente solo añade interacción (navegar.js).
//
//   npm i -D @observablehq/plot@0.6.17 linkedom@0.18.13        (en el proyecto; d3 llega con Plot)
//   node kit/figura/render-plot.mjs figuras/sesiones.spec.mjs --datos datos/sesiones.csv \
//        --etiqueta "Las sesiones se concentran en primavera" --salida src/figuras/sesiones.svg
//
// El spec es un módulo que exporta por defecto (Plot, datos) => opciones de Plot.plot (sin document).
// Colores por token: fill: 'var(--color-accent-solid)' (Plot acepta var() como constante).
// Cada marca con `title` sale lista para navegar.js: data-punto, role="img", aria-label con el texto
// del title (y sin <title>, para no duplicar la nota con el globo nativo del navegador). La raíz sale
// como role="group" con --etiqueta: la figura es estructura navegable, no una imagen atómica
// (charts-graphs: una cosa u otra, nunca las dos). La tabla equivalente va aparte, en el HTML.
// Ejes, reglas y rejilla salen con aria-hidden; los datos los lleva la tabla.
// Datos: .csv (d3.csvParse + autoType) o .json. Las dependencias se buscan desde este script y, si
// no están, desde el cwd (así vale ejecutarlo desde ~/.claude/skills/… con el cwd en el proyecto).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const USO = 'uso: node render-plot.mjs <spec.mjs> [--datos f.csv|f.json] [--etiqueta "frase"] [--salida f.svg]';
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const SPEC = argv.find((a, i) => !a.startsWith('--') && !['--datos', '--etiqueta', '--salida'].includes(argv[i - 1]));
const fallo = (m) => { console.error(`ERROR ${m}`); process.exit(1); };
if (!SPEC) fallo(USO);

async function importar(nombre) {
  try { return await import(nombre); } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  }
  // desde el cwd hacia arriba: node_modules/<nombre>/package.json → entrada ESM
  for (let d = process.cwd(); ; d = dirname(d)) {
    const pkg = join(d, 'node_modules', nombre, 'package.json');
    if (existsSync(pkg)) {
      const p = JSON.parse(readFileSync(pkg, 'utf8'));
      const x = p.exports?.['.'] ?? p.exports;
      const entrada = (typeof x === 'string' ? x : x?.import ?? x?.default) ?? p.module ?? p.main ?? 'index.js';
      return import(pathToFileURL(join(dirname(pkg), entrada)).href);
    }
    if (dirname(d) === d) break;
  }
  fallo(`falta ${nombre}. En el proyecto: npm i -D @observablehq/plot@0.6.17 linkedom@0.18.13`);
}

const Plot = await importar('@observablehq/plot');
const { parseHTML } = await importar('linkedom');
const d3 = await importar('d3');

let datos = [];
const fDatos = opt('--datos');
if (fDatos) {
  const texto = readFileSync(resolve(fDatos), 'utf8');
  datos = extname(fDatos) === '.json' ? JSON.parse(texto) : d3.csvParse(texto, d3.autoType);
}
const spec = (await import(pathToFileURL(resolve(SPEC)).href)).default;
if (typeof spec !== 'function') fallo(`${SPEC} debe exportar por defecto (Plot, datos) => opciones`);

const { document } = parseHTML('<!doctype html><html lang="es"><body></body></html>');
let nodo = Plot.plot({ ...spec(Plot, datos), document });
// con leyenda o título, Plot devuelve <figure>: se toma su <svg> principal (la leyenda va en el HTML)
if (nodo.tagName?.toLowerCase() !== 'svg') nodo = nodo.querySelector('svg:last-of-type') ?? nodo;

let n = 0;
for (const t of [...nodo.querySelectorAll('title')]) {
  const marca = t.parentNode;
  if (!marca || marca === nodo) continue;
  marca.setAttribute('data-punto', '');
  marca.setAttribute('role', 'img');
  marca.setAttribute('aria-label', t.textContent.trim());
  marca.removeChild(t);
  n++;
}
// grupos de Plot con aria-label en inglés («bar», «y-axis tick», «rule»): los que llevan marcas se
// quedan sin etiqueta (las marcas ya se nombran solas); ejes, reglas y rejilla salen del árbol de
// accesibilidad (la tabla equivalente lleva los datos). axe marca aria-label en un <g> sin rol.
for (const g of [...nodo.querySelectorAll('[aria-label]')]) {
  if (g.hasAttribute('data-punto')) continue;
  g.removeAttribute('aria-label');
  g.removeAttribute('aria-description');
  if (!g.querySelector('[data-punto]')) g.setAttribute('aria-hidden', 'true');
}
nodo.setAttribute('role', 'group');
const etiqueta = opt('--etiqueta');
if (etiqueta) nodo.setAttribute('aria-label', etiqueta);
nodo.removeAttribute('font-family');          // la familia la pone el CSS (tokens), no Plot
const svg = nodo.outerHTML;
const salida = opt('--salida');
if (salida) { writeFileSync(resolve(salida), svg + '\n'); console.log(`${salida}: ${n} marcas navegables, ${Math.round(svg.length / 102.4) / 10} kB`); }
else process.stdout.write(svg + '\n');
