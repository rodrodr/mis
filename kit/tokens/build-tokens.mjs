#!/usr/bin/env node
// build-tokens.mjs · DTCG 2025.10 (resolver) → tokens.css en @layer tokens + feedback-tokens.js
// Sin dependencias (node ≥ 18). Mide el contraste de los pares declarados en cada contexto y
// comprueba que todo color oklch cabe en sRGB; si algo falla, sale con código 1 y no escribe.
//
//   node <kit>/tokens/build-tokens.mjs [resolver.json] [--out dir] [--sin-contraste]
//
// Sin argumento usa el tokens.resolver.json que está JUNTO A ESTE SCRIPT (vale desde cualquier cwd:
// en un proyecto se ejecuta su copia, `node kit/tokens/build-tokens.mjs`). Un resolver pasado como
// argumento se busca desde el cwd. La salida va a <carpeta del resolver>/dist salvo --out.
// Salidas: tokens.css, feedback-tokens.js, preferencias.inline.js (el script en línea con los temas
// y familias de este resolver) y preferencias-config.js (lo mismo para preferencias.js).
//
// Contextos que entiende (nombres del resolver = palabras clave de CSS, para no traducir dos veces):
//   theme:    light (defecto) | dark    → @media (prefers-color-scheme: dark) y [data-theme="dark"]
//             otros temas (sepia, black…) → solo [data-theme="…"], con el color-scheme que declare
//             su fichero en $extensions["es.maestro"].colorScheme; se miden igual que los demás.
//             La media query oscura excluye TODOS los temas forzados que no son dark: sin eso, con el
//             sistema en oscuro, los semánticos que sepia no redefine se colaban desde el oscuro.
//   contrast: normal (defecto) | more   → @media (prefers-contrast: more)     y [data-contrast="more"]
//   motion:   normal (defecto) | reduce → @media (prefers-reduced-motion: reduce) y [data-motion="reduce"]
// Los alias se emiten como var(): un contexto que redirige un token semántico (p. ej. alto contraste)
// vale para los dos temas sin combinaciones. Todo sale como bloques por contexto (no light-dark()):
// así getComputedStyle devuelve un color resuelto que el canvas puede usar.
// Además del contraste WCAG 2 (la puerta), imprime APCA Lc como segunda columna, informativa (B7).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clampFluido } from './fluido.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const USO = 'uso: node <kit>/tokens/build-tokens.mjs [resolver.json] [--out dir] [--sin-contraste]';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARG = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
const RESOLVER = ARG ? resolve(ARG) : join(AQUI, 'tokens.resolver.json');
if (!existsSync(RESOLVER)) fallo(`no encuentro el resolver ${RESOLVER}${ARG ? ' (un argumento se busca desde el cwd)' : ''}\n${USO}`);
const OUT = resolve(opt('--out', join(dirname(RESOLVER), 'dist')));
const MEDIR = !argv.includes('--sin-contraste');
const BASE = dirname(RESOLVER);

// ---------- lectura y resolución ----------
function leer(p) {
  const f = resolve(BASE, p);
  let texto;
  try { texto = readFileSync(f, 'utf8'); } catch { fallo(`no se puede leer ${f} (lo pide el resolver)`); }
  try { return JSON.parse(texto); } catch (e) { fallo(`${f} no es JSON válido: ${e.message}`); }
}
const resolverDoc = leer(RESOLVER);
if (resolverDoc.version !== '2025.10') fallo(`resolver: version "${resolverDoc.version}", se esperaba "2025.10"`);

function fusionar(a, b) {
  for (const [k, v] of Object.entries(b)) {
    const obj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    // los pares de contraste de varios ficheros de un set se SUMAN (p. ej. juego.ejemplo.tokens.json);
    // cualquier otro array se sustituye, como un valor
    if (k === 'contraste' && Array.isArray(v) && Array.isArray(a[k])) a[k] = [...a[k], ...structuredClone(v)];
    else if (obj(v) && !('$value' in v) && obj(a[k])) fusionar(a[k], v);
    else if (obj(v) && '$value' in v && obj(a[k]) && '$value' in a[k]) a[k] = { ...a[k], ...structuredClone(v) }; // conserva $type
    else a[k] = structuredClone(v);
  }
  return a;
}
const fuentes = (lista) => lista.map((s) => leer(s.$ref));

function arbol(entrada) {
  const t = {};
  for (const paso of resolverDoc.resolutionOrder) {
    const [, tipo, nombre] = paso.$ref.split('/');
    if (tipo === 'sets') fuentes(resolverDoc.sets[nombre].sources).forEach((f) => fusionar(t, f));
    else {
      const m = resolverDoc.modifiers[nombre];
      const ctx = entrada[nombre] ?? m.default;
      if (!(ctx in m.contexts)) fallo(`modifier ${nombre}: contexto desconocido "${ctx}"`);
      fuentes(m.contexts[ctx]).forEach((f) => fusionar(t, f));
    }
  }
  return t;
}

function aplanar(nodo, ruta = [], tipo, fuera = new Map()) {
  const t = nodo.$type ?? tipo;
  for (const [k, v] of Object.entries(nodo)) {
    if (k.startsWith('$') || !v || typeof v !== 'object') continue;
    const r = [...ruta, k];
    if ('$value' in v) fuera.set(r.join('.'), { tipo: v.$type ?? t, token: v });
    else aplanar(v, r, t, fuera);
  }
  return fuera;
}

// ---------- valores CSS ----------
const nombreVar = (ruta) => `--${ruta.replace(/\./g, '-')}`;
const alias = (s) => typeof s === 'string' && /^\{[^}]+\}$/.test(s) ? s.slice(1, -1) : null;
const n = (x) => Number(Number(x).toFixed(4));

function color(v) {
  if (alias(v)) return `var(${nombreVar(alias(v))})`;
  const a = v.alpha ?? 1;
  const c = v.components;
  switch (v.colorSpace) {
    case 'oklch': return `oklch(${n(c[0])} ${n(c[1])} ${n(c[2])}${a < 1 ? ` / ${n(a)}` : ''})`;
    case 'srgb': return a < 1 ? `rgb(${c.map((x) => n(x * 255)).join(' ')} / ${n(a)})` : (v.hex ?? `rgb(${c.map((x) => n(x * 255)).join(' ')})`);
    default: fallo(`colorSpace no soportado por el kit: ${v.colorSpace}`);
  }
}
const dim = (v) => (alias(v) ? `var(${nombreVar(alias(v))})` : `${v.value}${v.unit}`);

function css(ruta, { tipo, token }) {
  const v = token.$value;
  if (alias(v)) return `var(${nombreVar(alias(v))})`;
  switch (tipo) {
    case 'color': return color(v);
    case 'dimension': return clampFluido(token) ?? dim(v);
    case 'duration': return dim(v);
    case 'number': return String(v);
    case 'fontWeight': return String(v);
    case 'cubicBezier': return `cubic-bezier(${v.map(n).join(', ')})`;
    case 'fontFamily': return (Array.isArray(v) ? v : [v]).map((f) => (/^[a-z-]+$/.test(f) ? f : `"${f}"`)).join(', ');
    case 'shadow': return (Array.isArray(v) ? v : [v])
      .map((s) => `${s.inset ? 'inset ' : ''}${dim(s.offsetX)} ${dim(s.offsetY)} ${dim(s.blur)} ${dim(s.spread)} ${color(s.color)}`).join(', ');
    default: fallo(`${ruta}: $type "${tipo}" no soportado por el kit (usa Terrazzo para tipos compuestos)`);
  }
}

// ---------- color: OKLCH → sRGB, gama y contraste WCAG 2 ----------
function oklchASrgbLineal([L, C, H]) {
  const h = (H * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
const linealDeSrgb = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
function lineal(v) {
  if (v.colorSpace === 'oklch') return oklchASrgbLineal(v.components);
  if (v.colorSpace === 'srgb') return v.components.map(linealDeSrgb);
  return null;
}
function resolverColor(mapa, ruta, visto = new Set()) {
  if (visto.has(ruta)) fallo(`alias circular en ${ruta}`);
  visto.add(ruta);
  const t = mapa.get(ruta);
  if (!t) fallo(`alias roto: ${ruta}`);
  const v = t.token.$value;
  return alias(v) ? resolverColor(mapa, alias(v), visto) : v;
}
const luminancia = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// APCA-W3 0.0.98G-4g (segunda columna, informativa; B7). Entrada: sRGB lineal en [0,1].
const gamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
function apca(texto, fondo) {
  const Y = (lin) => {
    const [r, g, b] = lin.map((x) => gamma(x) ** 2.4);
    const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
    return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
  };
  const yt = Y(texto), yb = Y(fondo);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

// ---------- construcción ----------
const errores = [];
function fallo(msg) { console.error(`ERROR ${msg}`); process.exit(1); }

const combos = [];
const TEMAS = Object.keys(resolverDoc.modifiers.theme?.contexts ?? { light: [] });
// off: los valores del atributo que anulan la media query (una lista: todos los temas forzados
// que no son el de la media query)
const CONTEXTOS = {
  theme: { dark: { media: '(prefers-color-scheme: dark)', attr: 'data-theme', on: 'dark', off: TEMAS.filter((t) => t !== 'dark'), scheme: 'dark' } },
  contrast: { more: { media: '(prefers-contrast: more)', attr: 'data-contrast', on: 'more', off: ['normal'] } },
  motion: { reduce: { media: '(prefers-reduced-motion: reduce)', attr: 'data-motion', on: 'reduce', off: ['normal'] } },
};
for (const theme of TEMAS) for (const contrast of ['normal', 'more']) combos.push({ theme, contrast, motion: 'normal' });
const mapas = new Map(combos.map((c) => [JSON.stringify(c), aplanar(arbol(c))]));
const base = aplanar(arbol({}));
const arbolBase = arbol({});

// 1) en todos los contextos: los alias resuelven y los colores caben en sRGB
const vistos = new Set();
for (const mapa of [...mapas.values(), aplanar(arbol({ motion: 'reduce' }))]) for (const [ruta, t] of mapa) {
  const v = t.token.$value;
  const clave = `${ruta}=${JSON.stringify(v)}`;
  if (vistos.has(clave)) continue;
  vistos.add(clave);
  if (alias(v) && !mapa.has(alias(v))) errores.push(`alias roto: ${ruta} → {${alias(v)}}`);
  if (t.tipo === 'color' && !alias(v)) {
    const lin = lineal(v);
    if (lin && lin.some((x) => x < -0.0015 || x > 1.0015)) errores.push(`fuera de sRGB: ${ruta} ${color(v)} (baja el croma)`);
  }
}

// 2) contraste medido en cada tema × contraste. En alto contraste, sin minAlto declarado: 7:1 para
// texto (min ≥ 4,5) y 4,5:1 para lo que no es texto (bordes, foco, marcas: min < 4,5). Antes se
// exigía 7:1 también a los no textuales y obligaba a declarar minAlto en cada borde y en cada marca.
const minimoAlto = (p) => p.minAlto ?? (p.min >= 4.5 ? Math.max(p.min, 7) : Math.max(p.min, 4.5));
const pares = arbolBase.$extensions?.['es.maestro']?.contraste ?? [];
const informe = [];
if (MEDIR) for (const [clave, mapa] of mapas) {
  const c = JSON.parse(clave);
  for (const p of pares) {
    const min = c.contrast === 'more' ? minimoAlto(p) : p.min;
    const [fg, bg] = [p.texto, p.fondo].map((r) => lineal(resolverColor(mapa, r)).map((x) => Math.min(1, Math.max(0, x))));
    const ratio = contraste(fg, bg);
    const ok = ratio + 1e-9 >= min;
    const lc = apca(fg, bg);
    informe.push(`${ok ? 'ok ' : 'NO '} ${c.theme.padEnd(5)} ${c.contrast.padEnd(6)} ${p.texto} / ${p.fondo}: ${ratio.toFixed(2)}:1 (mín. ${min}) · APCA Lc ${lc.toFixed(1)}`);
    if (!ok) errores.push(`contraste ${ratio.toFixed(2)}:1 < ${min} · ${p.texto} sobre ${p.fondo} · tema ${c.theme}, contraste ${c.contrast}`);
  }
}

if (errores.length) { informe.forEach((l) => console.log(l)); errores.forEach((e) => console.error(`ERROR ${e}`)); process.exit(1); }

// 3) CSS: :root con la base; cada contexto solo con lo que cambia
function bloque(mapa, soloDistinto) {
  const lineas = [];
  for (const [ruta, t] of mapa) {
    const valor = css(ruta, t);
    if (soloDistinto && base.has(ruta) && css(ruta, base.get(ruta)) === valor) continue;
    lineas.push(`    ${nombreVar(ruta)}: ${valor};`);
  }
  return lineas.join('\n');
}

let salida = `/* tokens.css · GENERADO por build-tokens.mjs desde ${RESOLVER.split('/').pop()}. No editar: edita los *.tokens.json. */\n@layer tokens {\n  :root {\n    color-scheme: light dark;\n${bloque(base, false)}\n  }\n`;
for (const [mod, ctxs] of Object.entries(CONTEXTOS)) for (const [ctx, cfg] of Object.entries(ctxs)) {
  if (!resolverDoc.modifiers[mod]?.contexts?.[ctx]) continue;
  const cuerpo = bloque(aplanar(arbol({ [mod]: ctx })), true);
  const scheme = cfg.scheme ? `    color-scheme: ${cfg.scheme};\n` : '';
  const fuera = cfg.off.map((v) => `[${cfg.attr}="${v}"]`).join(',');
  salida += `  @media ${cfg.media} {\n    :root:where(:not(${fuera})) {\n${scheme}${cuerpo.replace(/^/gm, '  ')}\n    }\n  }\n`;
  salida += `  :root:where([${cfg.attr}="${cfg.on}"]) {\n${scheme}${cuerpo}\n  }\n`;
  if (cfg.scheme) salida += `  :root:where([${cfg.attr}="light"]) {\n    color-scheme: light;\n  }\n`;
}
// temas adicionales (p. ej. sepia y negro en lectura): solo por atributo, con su color-scheme
for (const tema of TEMAS.filter((t) => t !== 'light' && t !== 'dark')) {
  const fuente = resolverDoc.modifiers.theme.contexts[tema].map((s) => leer(s.$ref));
  const scheme = fuente.map((f) => f.$extensions?.['es.maestro']?.colorScheme).find(Boolean) ?? 'light';
  const cuerpo = bloque(aplanar(arbol({ theme: tema })), true);
  salida = salida.replace(/(  @media \(prefers-contrast: more\))/, `  :root:where([data-theme="${tema}"]) {\n    color-scheme: ${scheme};\n${cuerpo}\n  }\n$1`);
}
salida += '}\n';

const feedback = arbolBase.$extensions?.['es.maestro.feedback'] ?? {};
// preferencias: temas válidos y familias elegibles de ESTE resolver, para el script en línea y
// preferencias.js (contrato 7). Solo son elegibles las familias marcadas con
// $extensions["es.maestro"].lectura = true (en el kit: lectura.tokens.json); display y mono nunca
// componen el cuerpo. 'body' no se elige: es la de por defecto (preferencia family: null).
const CONFIG = {
  temas: TEMAS,
  familias: [...base].filter(([r, t]) => r.startsWith('font.family.') && r !== 'font.family.body' && t.token.$extensions?.['es.maestro']?.lectura === true).map(([r]) => r.slice(12)),
};
const PLANTILLA = join(AQUI, '..', 'preferencias.inline.js');
let enLinea = null;
if (existsSync(PLANTILLA)) {
  const t = readFileSync(PLANTILLA, 'utf8');
  if (!/\/\*CONFIG\*\/.*?\/\*FIN\*\//.test(t)) fallo(`${PLANTILLA}: falta el marcador /*CONFIG*/…/*FIN*/`);
  enLinea = t.replace(/\/\*CONFIG\*\/.*?\/\*FIN\*\//, `/*CONFIG*/${JSON.stringify(CONFIG)}/*FIN*/`)
    .replace(/^\/\* preferencias\.inline\.js · PLANTILLA[\s\S]*?\*\/\n/, `/* preferencias.inline.js · GENERADO por build-tokens.mjs desde ${RESOLVER.split('/').pop()}. Pégalo dentro de <script> en <head>, antes de las hojas de estilo. */\n`);
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'tokens.css'), salida);
writeFileSync(join(OUT, 'feedback-tokens.js'),
  `// GENERADO por build-tokens.mjs desde $extensions["es.maestro.feedback"]. No editar.\nexport default ${JSON.stringify(feedback, null, 2)};\n`);
writeFileSync(join(OUT, 'preferencias-config.js'),
  `// GENERADO por build-tokens.mjs desde ${RESOLVER.split('/').pop()}: temas y familias que aceptan las preferencias. No editar.\nexport default ${JSON.stringify(CONFIG)};\n`);
if (enLinea) writeFileSync(join(OUT, 'preferencias.inline.js'), enLinea);
else console.warn(`aviso: no está ${PLANTILLA}; no se genera preferencias.inline.js`);
informe.forEach((l) => console.log(l));
console.log(`\n${base.size} tokens · ${pares.length} pares × ${combos.length} contextos medidos (WCAG 2; APCA informativo) · temas ${TEMAS.join(', ')}\n→ ${OUT}/ tokens.css, feedback-tokens.js, preferencias.inline.js, preferencias-config.js`);
