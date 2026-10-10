#!/usr/bin/env node
// design-md.mjs · frontmatter de DESIGN.md DERIVADO de los tokens construidos (contrato 1).
//
// `impeccable document` no es un verbo del CLI: es un flujo que escribe un LLM. El contrato 1 queda así:
// el FRONTMATTER (colores, tipografía, radios, espacios, botón primario) se genera con esto desde
// dist/tokens.css (lo ya medido por build-tokens.mjs); la PROSA la escribe el documentador desde lo
// construido (impeccable/reference/document.md, pasos 3–4, o degraded/documenter.md). Si DESIGN.md ya
// existe, solo se sustituye el frontmatter y la prosa se conserva.
//
//   node kit/tokens/design-md.mjs [--css kit/tokens/dist/tokens.css] [--salida DESIGN.md]
//        [--nombre "Mi producto"] [--descripcion "…"] [--autoridad ../otro/DESIGN.md]
//
// --autoridad: la superficie extiende un mundo documentado en OTRO proyecto (flujo.md §6): el DESIGN.md
// local es corto, derivado de sus tokens, enlaza a esa autoridad y solo describe lo que la superficie
// añade; nunca copia ni reescribe el del mundo. Si la superficie vive DENTRO del proyecto del mundo, no
// se ejecuta: lo que añade va al brief de superficie.
// Colores en oklch (la fuente normativa del kit; document.md admite oklch). Un color por tema:
// `bg-base` (claro) y `bg-base-dark`, `bg-base-sepia`… con los temas del build.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const CSS = resolve(opt('--css', join(AQUI, 'dist/tokens.css')));
const SALIDA = resolve(opt('--salida', 'DESIGN.md'));
const AUTORIDAD = opt('--autoridad', null);
if (!existsSync(CSS)) { console.error(`ERROR no está ${CSS}: ejecuta antes build-tokens.mjs`); process.exit(1); }
const css = readFileSync(CSS, 'utf8');

// bloques: :root base y cada :root:where([data-theme="x"]) (los de media query repiten a estos)
function bloque(selector) {
  const i = css.indexOf(selector);
  if (i < 0) return {};
  const cuerpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  return Object.fromEntries([...cuerpo.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const base = bloque(':root {');
const temas = [...css.matchAll(/:root:where\(\[data-theme="([\w-]+)"\]\) \{/g)].map((m) => m[1]).filter((t) => t !== 'light');
const valor = (mapa, nombre, visto = 0) => {
  const v = mapa[nombre] ?? base[nombre];
  if (v == null || visto > 20) return null;
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  return m ? valor(mapa, m[1], visto + 1) : v;
};

const SEMANTICOS = Object.keys(base).filter((n) => /^--color-(bg|text|border|accent|focus|status|selection)-/.test(n));
const colores = [];
for (const n of SEMANTICOS) {
  const clave = n.replace(/^--color-/, '');
  colores.push([clave, valor(base, n)]);
  for (const t of temas) {
    const mapa = { ...base, ...bloque(`:root:where([data-theme="${t}"]) {`) };
    const v = valor(mapa, n);
    if (v && v !== valor(base, n)) colores.push([`${clave}-${t}`, v]);
  }
}
const q = (s) => JSON.stringify(String(s).replace(/\s+/g, ' '));
const tipo = (familia, tam, alto) => {
  const f = valor(base, `--font-family-${familia}`), t = valor(base, `--font-size-${tam}`), l = alto && valor(base, `--leading-${alto}`);
  if (!f || !t) return null;
  return `{ fontFamily: ${q(f)}, fontSize: ${q(t)}${l ? `, lineHeight: ${l}` : ''} }`;
};
const tipografia = [
  ['display', tipo('display', 'step-5', 'tight')], ['headline', tipo('display', 'step-4', 'tight')],
  ['title', tipo('display', 'step-2', 'tight')], ['body', tipo('body', 'step-0', 'body')],
  ['label', tipo('body', 'step-minus-1', null)], ['mono', tipo('mono', 'step-minus-1', null)],
].filter(([, v]) => v);
const escala = (prefijo) => Object.keys(base).filter((n) => n.startsWith(prefijo)).map((n) => [n.slice(prefijo.length), valor(base, n)]);
const radios = escala('--radius-'), espacios = escala('--space-');
const boton = base['--color-accent-solid'] && base['--color-text-on-accent'];

const frontmatter = ['---',
  `name: ${q(opt('--nombre', 'Proyecto'))}`,
  `description: ${q(opt('--descripcion', 'Sistema derivado de los tokens DTCG del proyecto.'))}`,
  'colors:', ...colores.map(([k, v]) => `  ${k}: ${q(v)}`),
  'typography:', ...tipografia.map(([k, v]) => `  ${k}: ${v}`),
  ...(radios.length ? ['rounded:', ...radios.map(([k, v]) => `  ${k}: ${q(v)}`)] : []),
  ...(espacios.length ? ['spacing:', ...espacios.map(([k, v]) => `  ${k}: ${q(v)}`)] : []),
  ...(boton ? ['components:', `  button-primary: { backgroundColor: "{colors.accent-solid}", textColor: "{colors.text-on-accent}"${radios.length ? ', rounded: "{rounded.sm}"' : ''}${base['--size-target'] ? `, height: ${q(base['--size-target'])}` : ''} }`] : []),
  '---'].join('\n');

const aviso = `<!-- Frontmatter GENERADO por design-md.mjs desde ${relative(dirname(SALIDA), CSS)}: no se edita a mano; se cambian los tokens y se regenera.${AUTORIDAD ? `\n     Autoridad del mundo: ${AUTORIDAD}. Este fichero solo registra los valores de esta superficie y lo que añade.` : ''} -->`;
let cuerpo;
if (existsSync(SALIDA)) {
  const previo = readFileSync(SALIDA, 'utf8');
  cuerpo = previo.startsWith('---') ? previo.slice(previo.indexOf('\n---', 3) + 4).replace(/^\s*<!-- Frontmatter GENERADO[\s\S]*?-->\s*/, '') : previo;
  cuerpo = `\n\n${aviso}\n\n${cuerpo.trimStart()}`;
} else {
  cuerpo = `\n\n${aviso}\n\n# Design System: ${opt('--nombre', 'Proyecto')}\n\n`
    + (AUTORIDAD ? `Extiende el mundo documentado en [${AUTORIDAD}](${AUTORIDAD}); aquí solo va lo que añade esta superficie.\n\n` : '')
    + '<!-- Prosa: la escribe el documentador desde lo construido (impeccable/reference/document.md, pasos 3–4; secciones en su orden canónico). -->\n';
}
writeFileSync(SALIDA, frontmatter + cuerpo);
console.log(`${relative(process.cwd(), SALIDA)}: ${colores.length} colores (temas ${['light', ...temas].join(', ')}), ${tipografia.length} roles de tipo, ${radios.length} radios, ${espacios.length} espacios`);
