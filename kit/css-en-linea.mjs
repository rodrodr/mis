#!/usr/bin/env node
// css-en-linea.mjs · CSS crítico en línea, sin dependencias (tipos/landing.md: ≤ 14 kB gzip en <head>).
//
// base.css empieza con `@import url("tokens/dist/tokens.css") layer(tokens)`: servido tal cual, es una
// cadena de peticiones que bloquea el primer pintado. Esto junta en UNA hoja, en este orden:
//   1. la declaración de capas de base.css (contrato 2: una vez, lo primero),
//   2. `antes` (p. ej. los @font-face con sus reservas size-adjust de medir-reservas.py),
//   3. tokens/dist/tokens.css (ya viene dentro de @layer tokens),
//   4. base.css sin su @import ni su declaración de capas,
//   5. las hojas que se pasen, en orden (movimiento.css, figura/figura.css, las del proyecto).
// Una hoja con otro @import se rechaza: resuélvelo antes (o pásala como hoja aparte).
//
//   import { cssEnLinea } from './kit/css-en-linea.mjs';
//   const { css, kb } = cssEnLinea({ kit: 'kit', hojas: ['kit/movimiento.css', 'src/estilos.css'], antes: fuentes });
//   html = html.replace('</head>', `<style>${css}</style>\n</head>`);
//
//   node kit/css-en-linea.mjs [--kit kit] [hoja.css …] [--salida critico.css] [--sin-minificar]
//
// Minificado CONSERVADOR: quita comentarios, junta espacios y los quita solo alrededor de { } ; , y
// DESPUÉS de «:». Nunca el espacio ANTES de «:», «.», «[», «#» o «*»: es el combinador de descendiente
// (`.figura :where(svg)` no es `.figura:where(svg)`; un minificador ingenuo rompió así la figura de la
// landing de ejemplo). Tampoco toca + - > ~ (calc() necesita sus espacios) ni el interior de las cadenas.
// Probado en pruebas/prueba_herramientas.mjs.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const AQUI = dirname(fileURLToPath(import.meta.url));

export function minificar(css) {
  // se trocea en cadenas y resto: solo se minifica fuera de las cadenas
  const trozos = css.replace(/\/\*[\s\S]*?\*\//g, '').split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
  return trozos.map((t, i) => (i % 2 ? t : t
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,])\s*/g, '$1')
    .replace(/:\s+/g, ':')
    .replace(/;}/g, '}'))).join('').trim();
}

export function cssEnLinea({ kit = AQUI, hojas = [], antes = '', minificado = true } = {}) {
  const base = readFileSync(join(kit, 'base.css'), 'utf8');
  const capas = base.match(/^@layer [^;{]+;/m)?.[0];
  if (!capas) throw new Error(`${join(kit, 'base.css')}: falta la declaración de capas (@layer reset, tokens, …;)`);
  const tokens = readFileSync(join(kit, 'tokens/dist/tokens.css'), 'utf8');
  const partes = [capas, antes, tokens, base.replace(capas, '').replace(/^@import[^;]+;\s*/m, '')];
  for (const h of hojas) {
    const texto = readFileSync(h, 'utf8');
    if (/^\s*@import\b/m.test(texto)) throw new Error(`${h}: trae @import; resuélvelo antes de servirlo en línea`);
    partes.push(texto);
  }
  const css = minificado ? minificar(partes.join('\n')) : partes.join('\n');
  const kb = Math.round((gzipSync(css, { level: 9 }).length / 1024) * 10) / 10;
  return { css, kb, excede: kb > 14 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
  const kit = resolve(opt('--kit') ?? AQUI);
  const salida = opt('--salida');
  const sinMin = argv.includes('--sin-minificar');
  const hojas = argv.filter((a) => !a.startsWith('--'));
  try {
    const { css, kb, excede } = cssEnLinea({ kit, hojas, minificado: !sinMin });
    if (salida) writeFileSync(salida, css);
    console.log(`CSS en línea: ${css.length} B · ${kb} kB gzip -9${excede ? ' · EXCEDE 14 kB: saca lo que no pinta el primer viewport a una hoja aparte' : ''}${salida ? ` → ${salida}` : ''}`);
    process.exit(excede ? 2 : 0);
  } catch (e) {
    console.error(`ERROR ${e.message}`);
    process.exit(1);
  }
}
