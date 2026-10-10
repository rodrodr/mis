// tipografia-es.mjs · reglas tipográficas del español en el BUILD (contrato 11; RECURSOS_DISENO §3).
// Sin dependencias. Nunca `&nbsp;` a mano en la prosa: lo pone esto. Alternativa con más reglas y
// otros idiomas: el paquete typograf (npm) con locale es; esta pieza cubre lo que el contrato exige.
//
//   import { tipografiar, tipografiarHTML, remarkTipografia } from './tipografia-es.mjs';
//   tipografiar('Dijo "sí" al 10 % de los arts. 26 y 27 —dijo— en EE. UU.')
//   tipografiarHTML(html)                    // texto fuera de code/pre/kbd/samp/script/style; respeta lang
//   remark().use(remarkTipografia)            // Markdown (Astro: markdown.remarkPlugins; smartypants: false)
//
// Opciones (en crearEstado(lang, opciones), tipografiarHTML(html, { lang, ...opciones }) y
// remarkTipografia({ lang, ...opciones })):
//   millares: 'fino' (defecto: 107 551, RAE) | 'punto' (107.551) | 'no'. Es un VALOR de la identidad
//             (contrato 11): una identidad con punto lo fija aquí. Desde cinco cifras en los tres casos;
//             para agrupar también cuatro cifras (1.530) se formatea en el origen con
//             Intl.NumberFormat('es-ES', { useGrouping: 'always' }): sin 'always', es-ES no agrupa 1530.
//   huerfanas: 'cerrar' (defecto: una comilla recta de cierre sin apertura se compone como ») |
//              'conservar' (se deja recta). En textos de OCR, 'conservar': el OCR deja comillas sueltas y
//              «pie.»» parecería del original.
//
// Reglas (español):
//   comillas rectas → «…», y “…” dentro de otras; en lang="en", “…” y ‘…’ dentro
//   espacio de no separación (U+00A0): 10 %, 25 km, 3 €, art. 26, n.º 5, pág. 12, EE. UU., Sr. López
//   espacio fino de no separación (U+202F) en los millares desde cinco cifras (107 551); nunca en
//     cuatro cifras, años, códigos (ISBN, DOI, teléfonos) ni números pegados a letras, / o -
//   la raya de inciso no queda sola a final de línea: unión de palabra (U+2060) entre la raya y la
//     palabra a la que abraza (—dijo—), porque el navegador puede partir la línea tras una raya
//   tres puntos → … (U+2026)

const NBSP = ' ', FINO = ' ', UNE = '⁠';
const ABREV = ['art', 'arts', 'núm', 'n\\.º', 'pág', 'págs', 'cap', 'caps', 'vol', 'vols', 'fig', 'figs', 'tít', 'párr', 'p', 'pp'];
const TRATO = ['Sr', 'Sra', 'Srta', 'Sres', 'D', 'Dña', 'Dr', 'Dra', 'Excmo', 'Excma', 'Ilmo', 'Ilma'];
const UNIDADES = ['%', '‰', '€', '\\$', '£', 'km', 'm', 'cm', 'mm', 'kg', 'g', 'mg', 'l', 'ml', 'h', 'min', 's', 'ms', 'kB', 'MB', 'GB', 'px', '°C', 'ºC'];
const CODIGO = /(ISBN|ISSN|DOI|tel\.?|teléfono|móvil|CP|C\.\s?P\.|ref\.?|id|código|año|años)\s*[:.]?\s*$/i;

const OPCIONES = { millares: 'fino', huerfanas: 'cerrar' };

/** Estado que se arrastra entre trozos de texto de un mismo bloque (comillas abiertas, último carácter). */
export function crearEstado(lang = 'es', opciones = {}) { return { pila: [], previo: '', lang, op: { ...OPCIONES, ...opciones } }; }

export function tipografiar(texto, estado = crearEstado()) {
  const en = /^en\b/i.test(estado.lang);
  const op = estado.op ?? OPCIONES;
  let s = texto.replace(/\.\.\.(?!\.)/g, '…');

  // comillas rectas, con nivel: la de apertura va tras inicio, espacio o puntuación de apertura
  let fuera = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '"') { fuera += c; continue; }
    const antes = i > 0 ? s[i - 1] : estado.previo;
    const abre = !antes || /[\s([{«“‘—–⁠-]/.test(antes);
    if (abre) {
      const nivel = estado.pila.length;
      const par = en ? (nivel % 2 ? ['‘', '’'] : ['“', '”']) : (nivel === 0 ? ['«', '»'] : nivel === 1 ? ['“', '”'] : ['‘', '’']);
      estado.pila.push(par[1]);
      fuera += par[0];
    } else {
      fuera += estado.pila.pop() ?? (op.huerfanas === 'conservar' ? '"' : en ? '”' : '»');
    }
  }
  s = fuera;

  // espacios de no separación
  s = s.replace(new RegExp(`(\\d)[ \\u00A0](${UNIDADES.join('|')})(?![\\p{L}\\d])`, 'gu'), `$1${NBSP}$2`);
  s = s.replace(new RegExp(`(^|[^\\p{L}])(${ABREV.join('|')})\\.? (?=\\d)`, 'giu'), (m, a, b) => `${a}${b}${m.slice(a.length + b.length).startsWith('.') ? '.' : ''}${NBSP}`);
  s = s.replace(new RegExp(`(^|[^\\p{L}])(${TRATO.join('|')})\\. (?=\\p{Lu})`, 'gu'), `$1$2.${NBSP}`);
  s = s.replace(/\b(\p{Lu})\1\. (\p{Lu})\2\./gu, `$1$1.${NBSP}$2$2.`);            // EE. UU., FF. AA., RR. HH.

  // millares desde cinco cifras (el separador es un valor de la identidad: op.millares)
  if (op.millares !== 'no') s = s.replace(/(^|[^\p{L}\d/\-.,:#])(\d{5,15})(?![\p{L}\d/\-]|[.,:]\d)/gu, (m, a, n, pos, todo) => {
    if (n[0] === '0' || CODIGO.test(todo.slice(Math.max(0, pos - 14), pos + a.length))) return m;
    return a + n.replace(/\B(?=(\d{3})+(?!\d))/g, op.millares === 'punto' ? '.' : FINO);
  });

  // raya de inciso: pegada a la palabra que abraza, sin permitir el corte entre las dos
  s = s.replace(/(^|[\s(«“])—(?=[^\s⁠—])/gu, `$1—${UNE}`);                // raya que abre
  s = s.replace(/([^\s⁠—])—(?=[\s.,;:)»”?!…]|$)/gu, `$1${UNE}—`);          // raya que cierra

  estado.previo = s.at(-1) ?? estado.previo;
  return s;
}

const SALTAR = new Set(['code', 'pre', 'kbd', 'samp', 'var', 'script', 'style', 'textarea', 'svg', 'math']);
const VACIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BLOQUES = new Set(['p', 'li', 'dd', 'dt', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'figcaption', 'caption', 'div', 'section', 'article', 'aside']);

/** HTML → HTML: solo toca el texto; respeta code/pre…, los atributos y el lang de cada elemento. */
export function tipografiarHTML(html, { lang = 'es', ...opciones } = {}) {
  const pila = [{ tag: '#raiz', lang, saltar: false }];
  let estado = crearEstado(lang, opciones);
  return html.replace(/<!--[\s\S]*?-->|<\/?([a-zA-Z][\w-]*)\b[^>]*>|[^<]+/g, (trozo, tag) => {
    if (trozo.startsWith('<!--')) return trozo;
    const arriba = pila.at(-1);
    if (tag) {
      const t = tag.toLowerCase();
      if (trozo.startsWith('</')) {
        const i = pila.findLastIndex((e) => e.tag === t);
        if (i > 0) pila.length = i;
        if (BLOQUES.has(t)) estado = crearEstado(pila.at(-1).lang, opciones);
      } else if (!VACIOS.has(t) && !trozo.endsWith('/>')) {
        const l = /\blang\s*=\s*["']?([\w-]+)/i.exec(trozo)?.[1] ?? arriba.lang;
        pila.push({ tag: t, lang: l, saltar: arriba.saltar || SALTAR.has(t) });
        if (BLOQUES.has(t) || l !== arriba.lang) estado = crearEstado(l, opciones);
      }
      return trozo;
    }
    if (arriba.saltar || !/^(es|en)\b/i.test(arriba.lang)) return trozo;
    estado.lang = arriba.lang;
    return tipografiar(trozo, estado);
  });
}

/** Plugin de remark: texto de cada bloque (nunca inlineCode ni code). */
export function remarkTipografia({ lang = 'es', ...opciones } = {}) {
  return (arbol) => {
    const recorrer = (nodo, estado) => {
      if (nodo.type === 'text') { nodo.value = tipografiar(nodo.value, estado); return; }
      if (nodo.type === 'code' || nodo.type === 'inlineCode' || nodo.type === 'html') return;
      const bloque = ['paragraph', 'heading', 'tableCell', 'listItem', 'blockquote'].includes(nodo.type);
      const e = bloque ? crearEstado(lang, opciones) : estado;
      for (const hijo of nodo.children ?? []) recorrer(hijo, e);
    };
    recorrer(arbol, crearEstado(lang, opciones));
  };
}
