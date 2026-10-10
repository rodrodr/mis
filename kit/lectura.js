// lectura.js · piezas mínimas de una app de lectura (reference/tipos/lectura.md). Sin dependencias.
//
//   buscar(raiz, 'camara', { palabra: true })  → rangos; los pinta con ::highlight(busqueda)
//   posicion(raiz, { contenedor?, contenedores? }) → Locator (compatible con Readium en href,
//                                                 locations.progression/fragments y text)
//   irA(raiz, locator, { contenedor?, contenedores?, estable? })
//                                               → vuelve a esa posición tras reflujo o cambio de fuente
//   citar(rango, raiz) / anclar(raiz, selector) → TextQuoteSelector de W3C Web Annotation, ida y vuelta
//   paginar(contenedor, { fundido? })           → modo paginado en columnas:
//                                                 { paginas(), actual(), ir(n), siguiente(), anterior() }
// `contenedor` = el elemento paginado: con él, posicion() mira la columna visible y la progresión
// sale de scrollLeft, e irA() calcula la página del rango y salta a ella. Sin él, modo scroll
// (window). Pasar el contenedor equivocado da una posición equivocada: es la misma raíz de paginar().
//
// Requisitos del HTML: bloques de texto con id estable puesto en el build (p-1, p-2…), texto en NFC,
// `lang` correcto por pasaje. Todo se ancla a elemento + carácter, nunca a scrollY ni a scrollLeft.
//
// Con content-visibility: auto por sección o turno (tipos/lectura.md §2), pasa `contenedores` (el
// selector de esas secciones, p. ej. '.turno') y, en los saltos, `estable` (ms):
//   · posicion() solo toma candidatos de contenedores que cortan la ventana: WebKit devuelve geometría
//     RANCIA de los descendientes de una sección saltada (medido: un párrafo en y = 69 con su turno en
//     y = −775), y la caja del contenedor sí es fiable.
//   · irA() maqueta a la fuerza el contenedor de destino (content-visibility: visible dos fotogramas) y,
//     con `estable`, lo vuelve a colocar en cada fotograma durante esos ms: las secciones vecinas se
//     maquetan DESPUÉS del salto y cambian de alto (WebKit no tiene scroll anchoring; el de Chromium no
//     siempre ancla al destino: un salto al turno 26 acababa en el 21). Se para con rueda, toque o tecla.
// Patrón completo, medido en Chromium y WebKit: ejemplos/lectura/src/lector.js (sitio, maquetar, estabilizar).

const LETRA = /[\p{L}\p{N}]/u;

/** Plegado para buscar en español: sin tildes ni diéresis, sin mayúsculas, pero ñ ≠ n. */
function plegar(ch) {
  if (ch === 'ñ' || ch === 'Ñ') return 'ñ';
  return ch.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}

function nodosDeTexto(raiz) {
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('script, style, [hidden], [aria-hidden="true"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodos = [];
  for (let n; (n = w.nextNode()); ) nodos.push(n);
  return nodos;
}

/** Busca sin tildes y (opcional) solo palabras completas. Pinta con la Custom Highlight API. */
export function buscar(raiz, consulta, { palabra = true, nombre = 'busqueda' } = {}) {
  const q = [...consulta.trim()].map(plegar).join('');
  const rangos = [];
  if (q) for (const nodo of nodosDeTexto(raiz)) {
    const t = nodo.data;
    let plano = '';
    const mapa = [];                                   // índice en `plano` → índice en `t`
    for (let i = 0; i < t.length; i++) { const p = plegar(t[i]); for (let k = 0; k < p.length; k++) mapa.push(i); plano += p; }
    for (let k = plano.indexOf(q); k !== -1; k = plano.indexOf(q, k + 1)) {
      const ini = mapa[k], fin = mapa[k + q.length - 1] + 1;
      if (palabra && (LETRA.test(t[ini - 1] ?? '') || LETRA.test(t[fin] ?? ''))) continue;
      const r = new Range();
      r.setStart(nodo, ini); r.setEnd(nodo, fin);
      rangos.push(r);
    }
  }
  if (globalThis.CSS?.highlights) CSS.highlights.set(nombre, new Highlight(...rangos));
  return rangos;
}

function caret(x, y) {
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { nodo: p.offsetNode, offset: p.offset }; }
  const r = document.caretRangeFromPoint?.(x, y);
  return r && { nodo: r.startContainer, offset: r.startOffset };
}

function rangoEn(bloque, desplazamiento) {
  let resto = desplazamiento;
  const nodos = nodosDeTexto(bloque);
  for (const n of nodos) {
    if (resto <= n.data.length) { const r = new Range(); r.setStart(n, resto); r.collapse(true); return r; }
    resto -= n.data.length;
  }
  const r = new Range(); r.selectNodeContents(bloque); r.collapse(true); return r;
}

// geometría del modo paginado: una página = una columna = clientWidth + column-gap
function pasoDe(el) { return el.clientWidth + (parseFloat(getComputedStyle(el).columnGap) || 0); }
function origenDe(el) {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return { x: r.left + el.clientLeft + (parseFloat(cs.paddingLeft) || 0), y: r.top + el.clientTop + (parseFloat(cs.paddingTop) || 0) };
}

/** Locator de la posición de lectura: primer bloque visible (bajo `margen` px, o en la columna
 *  visible del `contenedor` paginado) + carácter. */
export function posicion(raiz, { margen = 0, contenedor = null, contenedores = null, bloques = 'p, li, h1, h2, h3, h4, blockquote, figcaption, dd' } = {}) {
  let candidatos = [...raiz.querySelectorAll(bloques)].filter((b) => b.id);
  if (contenedores && !contenedor) {
    // content-visibility: solo bloques de secciones que cortan la ventana (esas están maquetadas)
    const cortan = new Map();
    const corta = (c) => {
      if (!cortan.has(c)) { const r = c.getBoundingClientRect(); cortan.set(c, r.height > 0 && r.bottom > margen && r.top < innerHeight); }
      return cortan.get(c);
    };
    const filtrados = candidatos.filter((b) => { const c = b.closest(contenedores); return !c || corta(c); });
    if (filtrados.length) candidatos = filtrados;
  }
  if (!candidatos.length) return null;
  let bloque, punto = null, progression;
  if (contenedor) {
    // la columna visible ocupa [izq, der) en coordenadas de viewport
    const { x: izq, y: arriba } = origenDe(contenedor), der = izq + contenedor.clientWidth;
    for (const b of candidatos) {
      const trozo = [...b.getClientRects()].find((r) => r.width > 0 && r.right > izq + 1 && r.left < der - 1);
      if (!trozo) continue;
      bloque = b;
      // si el bloque empezó en una página anterior, el carácter está arriba del todo de esta
      const primero = [...b.getClientRects()].find((r) => r.width > 0);
      if (primero && primero.left < izq - 1) punto = [Math.max(trozo.left, izq) + 2, Math.max(trozo.top, arriba) + 2];
      break;
    }
    const total = contenedor.scrollWidth - contenedor.clientWidth;
    progression = total > 0 ? Math.min(1, contenedor.scrollLeft / total) : 0;
  } else {
    bloque = candidatos.find((b) => b.getBoundingClientRect().bottom > margen + 1);
    const rb = bloque?.getBoundingClientRect();
    if (rb && rb.top < margen) punto = [rb.left + 2, margen + 2];   // bloque cortado: carácter en el borde superior
    const total = document.documentElement.scrollHeight - innerHeight;
    progression = total > 0 ? Math.min(1, scrollY / total) : 0;
  }
  bloque ??= candidatos[0];
  let desplazamiento = 0;
  if (punto) {
    const c = caret(...punto);
    if (c && bloque.contains(c.nodo)) { const r = new Range(); r.setStart(bloque, 0); r.setEnd(c.nodo, c.offset); desplazamiento = r.toString().length; }
  }
  const texto = bloque.textContent;
  return {
    href: location.pathname,
    type: 'text/html',
    locations: { fragments: [bloque.id], progression, charOffset: desplazamiento },
    text: { before: texto.slice(Math.max(0, desplazamiento - 32), desplazamiento), highlight: texto.slice(desplazamiento, desplazamiento + 64), after: '' },
  };
}

// maqueta a la fuerza (hasta el fotograma siguiente) la sección de un nodo, para medirla sin geometría rancia
function maquetar(nodo, contenedores) {
  const c = contenedores && (nodo?.nodeType === 1 ? nodo : nodo?.parentElement)?.closest(contenedores);
  if (!c) return;
  c.style.contentVisibility = 'visible';
  requestAnimationFrame(() => requestAnimationFrame(() => c.style.removeProperty('content-visibility')));
}

let detenerAnclaje = null;   // una sola estabilización a la vez: un salto nuevo cancela la anterior

/** Vuelve a un Locator. Si el id ya no existe (contenido cambiado), reancla por el texto.
 *  Con `contenedor` (modo paginado) salta, sin animación, a la página que contiene esa posición.
 *  Con `contenedores` (content-visibility por sección) maqueta la sección de destino antes de medir;
 *  con `estable: ms` (500 recomendado), la recoloca en cada fotograma hasta que el alto de las vecinas
 *  se asienta, y se detiene si el lector usa la rueda, el dedo o el teclado. */
export function irA(raiz, loc, { margen = 0, contenedor = null, contenedores = null, estable = 0 } = {}) {
  detenerAnclaje?.();
  const ok = colocar(raiz, loc, { margen, contenedor, contenedores });
  if (!ok || contenedor || !(estable > 0)) return ok;
  let parar = false, raf = 0;
  const fin = performance.now() + estable;
  const alto = () => { parar = true; };
  const tipos = ['wheel', 'touchstart', 'keydown'];
  // los oyentes, un fotograma después: la tecla que lanzó el salto no lo detiene
  const primero = requestAnimationFrame(() => { for (const t of tipos) addEventListener(t, alto, { passive: true }); });
  detenerAnclaje = () => {
    parar = true; cancelAnimationFrame(raf); cancelAnimationFrame(primero);
    for (const t of tipos) removeEventListener(t, alto);
    detenerAnclaje = null;
  };
  const paso = () => {
    if (parar || performance.now() >= fin) { detenerAnclaje?.(); return; }
    colocar(raiz, loc, { margen, contenedores });
    raf = requestAnimationFrame(paso);
  };
  raf = requestAnimationFrame(paso);
  return ok;
}

function colocar(raiz, loc, { margen = 0, contenedor = null, contenedores = null } = {}) {
  let bloque = loc?.locations?.fragments?.[0] ? document.getElementById(loc.locations.fragments[0]) : null;
  let rango;
  if (bloque && raiz.contains(bloque)) rango = rangoEn(bloque, loc.locations.charOffset ?? 0);
  else if (loc?.text?.highlight) rango = anclar(raiz, { exact: loc.text.highlight, prefix: loc.text.before })?.cloneRange();
  if (!rango) return false;
  rango.collapse(true);
  maquetar(rango.startContainer, contenedores);
  const caja = [...rango.getClientRects()].find((r) => r.height > 0) ?? rango.startContainer.parentElement.getBoundingClientRect();
  if (contenedor) {
    const paso = pasoDe(contenedor);
    const x = caja.left - origenDe(contenedor).x + contenedor.scrollLeft;   // posición en la tira de columnas
    const paginas = Math.max(1, Math.round((contenedor.scrollWidth + (parseFloat(getComputedStyle(contenedor).columnGap) || 0)) / paso));
    const n = Math.max(0, Math.min(paginas - 1, Math.floor((x + 1) / paso)));
    contenedor.scrollTo({ left: n * paso, behavior: 'instant' });
    return true;
  }
  const y = caja.top + scrollY - margen;
  if (Math.abs(y - scrollY) > 1) window.scrollTo({ top: y, behavior: 'instant' });
  return true;
}

// desplazamiento global de un punto (nodo, offset) sobre el texto visible de `nodos`
function global(nodos, nodo, offset) {
  let suma = 0;
  for (const n of nodos) {
    if (n === nodo) return suma + offset;
    if (nodo.nodeType !== Node.TEXT_NODE && (nodo.childNodes[offset]?.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING || nodo.childNodes[offset] === n)) return suma;
    suma += n.data.length;
  }
  return suma;
}

/** TextQuoteSelector (W3C Web Annotation) de un rango: exact + 32 caracteres de contexto. */
export function citar(rango, raiz) {
  const nodos = nodosDeTexto(raiz);
  const texto = nodos.map((n) => n.data).join('');
  const ini = global(nodos, rango.startContainer, rango.startOffset);
  const fin = global(nodos, rango.endContainer, rango.endOffset);
  return { type: 'TextQuoteSelector', exact: texto.slice(ini, fin), prefix: texto.slice(Math.max(0, ini - 32), ini), suffix: texto.slice(fin, fin + 32) };
}

/** Rango de un TextQuoteSelector; con varias apariciones gana la de mejor contexto. Sobrevive al reflujo. */
export function anclar(raiz, { exact, prefix = '', suffix = '' }) {
  const nodos = nodosDeTexto(raiz);
  const texto = nodos.map((n) => n.data).join('');
  let mejor = -1, puntos = -1;
  for (let i = texto.indexOf(exact); i !== -1; i = texto.indexOf(exact, i + 1)) {
    const p = (prefix && texto.slice(0, i).endsWith(prefix) ? 2 : 0) + (suffix && texto.slice(i + exact.length).startsWith(suffix) ? 1 : 0);
    if (p > puntos) { mejor = i; puntos = p; }
  }
  if (mejor < 0) return null;
  const punto = (global) => { for (const n of nodos) { if (global <= n.data.length) return [n, global]; global -= n.data.length; } };
  const r = new Range();
  r.setStart(...punto(mejor)); r.setEnd(...punto(mejor + exact.length));
  return r;
}

/** Modo paginado: el contenedor lleva la clase .paginado y tabindex="0" (ver lectura.md); una página = una columna.
 *  El paso de página es INSTANTÁNEO con teclado y con ir(n) (precedencia E10: nada que se lanza con
 *  teclado se anima). `fundido: true` añade un fundido de --dur-fade (≤ 150 ms) al llegar, salvo con
 *  movimiento reducido. Solo el asentado tras un deslizamiento táctil (continuación del gesto) es suave. */
export function paginar(el, { fundido = false } = {}) {
  const paso = () => pasoDe(el);
  const paginas = () => Math.max(1, Math.round((el.scrollWidth + (parseFloat(getComputedStyle(el).columnGap) || 0)) / paso()));
  const actual = () => Math.round(el.scrollLeft / paso());
  const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
  const ir = (n, { suave = false } = {}) => {
    const destino = Math.max(0, Math.min(paginas() - 1, n)) * paso();
    const cambia = Math.abs(el.scrollLeft - destino) > 1;
    el.scrollTo({ left: destino, behavior: suave && !reducido() ? 'smooth' : 'instant' });
    if (cambia && fundido && !suave && !reducido() && el.animate) {
      const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-fade')) || 150;
      el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: Math.min(ms, 150), easing: 'ease-out' });
    }
  };
  // un deslizamiento que se queda entre dos páginas se asienta en la más cercana (sigue al gesto: suave)
  if ('onscrollend' in window) el.addEventListener('scrollend', () => {
    const n = Math.round(el.scrollLeft / paso());
    if (Math.abs(el.scrollLeft - n * paso()) > 2) ir(n, { suave: true });
  });
  el.addEventListener('keydown', (e) => {
    const k = { ArrowRight: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, PageUp: -1 }[e.key];
    if (k && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); ir(actual() + (e.shiftKey && e.key === ' ' ? -1 : k)); }
  });
  return { el, paginas, actual, ir, siguiente: () => ir(actual() + 1), anterior: () => ir(actual() - 1) };
}
