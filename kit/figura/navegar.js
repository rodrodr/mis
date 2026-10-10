// navegar.js · una sola parada de Tab para toda la figura y flechas dentro (roving tabindex;
// charts-graphs + tooltips; precedencia F9). Las marcas son las que render-plot.mjs dejó con
// data-punto, role="img" y aria-label (o cualquier elemento con esos atributos, SVG o HTML).
//
//   import { navegar } from './figura/navegar.js';
//   const nav = navegar(document.querySelector('#fig-sesiones [data-navegable]'), {
//     pasos: { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 },   // p. ej. calendario: ↑/↓ semana
//     alElegir: (punto) => …,                                               // Intro
//     signal: ctx.signal,                                                    // dentro de una isla
//   });
//   nav.destroy();
//
// Teclas: flechas según `pasos` (por defecto ←/→ y ↑/↓ de uno en uno), Inicio/Fin, AvPág/RePág
// (±10), Intro llama a alElegir, Esc cierra la nota. La nota aparece con el foco Y con el puntero, se
// puede recorrer con el puntero sin que se cierre, no caduca y repite el aria-label de la marca (para
// quien ve; el lector ya lee el nombre de la marca enfocada, así que la nota va con aria-hidden).
// Nunca role="grid" ni una parada de Tab por punto. La tabla equivalente sigue en el HTML.

export function navegar(raiz, { selector = '[data-punto]', pasos = {}, alElegir = null, signal } = {}) {
  const puntos = [...raiz.querySelectorAll(selector)];
  if (!puntos.length) return null;
  const ctrl = new AbortController();
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
  const s = { signal: ctrl.signal };
  const teclas = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10, ...pasos };
  let i = 0, cerrada = false, retardo = 0;

  const caja = raiz.closest('[data-figura]') ?? raiz.parentElement;
  if (getComputedStyle(caja).position === 'static') caja.style.position = 'relative';
  const nota = document.createElement('div');
  nota.className = 'figura__nota';
  nota.setAttribute('aria-hidden', 'true');
  nota.hidden = true;
  caja.append(nota);

  const etiqueta = (p) => p.getAttribute('aria-label') ?? p.querySelector('title')?.textContent ?? '';
  puntos.forEach((p, k) => p.setAttribute('tabindex', k === 0 ? '0' : '-1'));

  function mostrar(p) {
    clearTimeout(retardo);
    if (cerrada) return;
    nota.textContent = etiqueta(p);
    nota.hidden = false;
    const c = caja.getBoundingClientRect(), r = p.getBoundingClientRect();
    const ancho = nota.offsetWidth, alto = nota.offsetHeight;
    const x = Math.min(Math.max(0, r.left - c.left + r.width / 2 - ancho / 2), Math.max(0, c.width - ancho));
    const y = r.top - c.top - alto - 8 >= 0 ? r.top - c.top - alto - 8 : r.bottom - c.top + 8;
    nota.style.insetInlineStart = `${Math.round(x)}px`;
    nota.style.insetBlockStart = `${Math.round(y)}px`;
  }
  const ocultar = () => { nota.hidden = true; };
  function ir(k) {
    const j = Math.max(0, Math.min(puntos.length - 1, k));
    puntos[i].setAttribute('tabindex', '-1');
    i = j;
    puntos[i].setAttribute('tabindex', '0');
    puntos[i].focus({ preventScroll: true });
  }

  raiz.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') { if (!nota.hidden) { cerrada = true; ocultar(); e.preventDefault(); } return; }
    if (e.key === 'Enter' && alElegir) { alElegir(puntos[i], i); e.preventDefault(); return; }
    let k = null;
    if (e.key === 'Home') k = 0;
    else if (e.key === 'End') k = puntos.length - 1;
    else if (e.key in teclas) k = i + teclas[e.key];
    if (k === null) return;
    e.preventDefault();
    cerrada = false;
    ir(k);
  }, s);
  raiz.addEventListener('focusin', (e) => {
    const k = puntos.indexOf(e.target);
    if (k < 0) return;
    if (k !== i) { puntos[i].setAttribute('tabindex', '-1'); i = k; puntos[i].setAttribute('tabindex', '0'); }
    mostrar(puntos[i]);
  }, s);
  raiz.addEventListener('focusout', (e) => { if (!raiz.contains(e.relatedTarget)) { cerrada = false; ocultar(); } }, s);
  for (const p of puntos) {
    p.addEventListener('pointerenter', () => { cerrada = false; mostrar(p); }, s);
    p.addEventListener('pointerleave', () => { retardo = setTimeout(ocultar, 300); }, s);
  }
  nota.addEventListener('pointerenter', () => clearTimeout(retardo), s);
  nota.addEventListener('pointerleave', () => { retardo = setTimeout(ocultar, 300); }, s);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !nota.hidden) { cerrada = true; ocultar(); } }, s);

  return {
    get actual() { return i; },
    ir,
    destroy() {
      ctrl.abort();
      clearTimeout(retardo);
      nota.remove();
      puntos.forEach((p) => p.removeAttribute('tabindex'));
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// navegarVirtual · la misma navegación para figuras en CANVAS o WebGL, donde las marcas no son nodos del
// DOM (un hemiciclo de 500 escaños con 16 000 cuerdas no puede tener 500 elementos enfocables). Una sola
// parada de Tab (el propio lienzo o su envoltorio), un índice que se mueve con el teclado, una región viva
// que dice la marca actual y la misma nota emergente que el modo DOM, situada donde la pieza diga.
//
//   const nav = navegarVirtual(lienzo, {
//     total: escanos.length,
//     describir: (i) => `${escanos[i].nombre}, ${escanos[i].partido}: ${escanos[i].grado} cofirmantes`,
//     mostrar: (i) => { resaltar(i); return rectDelEscano(i); },   // resalta y devuelve {left, top, width, height} de viewport
//     soltar: () => resaltar(-1),                                     // Esc o el foco sale: sin resaltado
//     pasos: { ArrowRight: 1, ArrowLeft: -1 },                        // p. ej. ↑/↓ entre cofirmantes con una función
//     alElegir: (i) => …, signal: ctx.signal,
//   });
//   nav.ir(12); nav.destroy();
//
// La tabla equivalente sigue en el HTML (charts-graphs); la región viva es role="status" y está
// dentro de la figura; la nota va con aria-hidden (el lector ya oye la región). Probado en
// pruebas/prueba_figura.py.
export function navegarVirtual(parada, { total, describir, mostrar = () => null, soltar = () => {}, pasos = {}, alElegir = null, signal } = {}) {
  if (!total) return null;
  const ctrl = new AbortController();
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
  const s = { signal: ctrl.signal };
  const teclas = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10, ...pasos };
  let i = 0, cerrada = false;

  if (!parada.hasAttribute('tabindex')) parada.setAttribute('tabindex', '0');
  const caja = parada.closest('[data-figura]') ?? parada.parentElement;
  if (getComputedStyle(caja).position === 'static') caja.style.position = 'relative';
  const nota = document.createElement('div');
  nota.className = 'figura__nota';
  nota.setAttribute('aria-hidden', 'true');
  nota.hidden = true;
  const region = document.createElement('p');
  region.className = 'visualmente-oculto';
  region.setAttribute('role', 'status');
  caja.append(nota, region);

  function pintar() {
    const texto = describir(i);
    region.textContent = texto;
    const r = mostrar(i);
    if (cerrada || !r) { nota.hidden = true; return; }
    nota.textContent = texto;
    nota.hidden = false;
    const c = caja.getBoundingClientRect(), ancho = nota.offsetWidth, alto = nota.offsetHeight;
    const x = Math.min(Math.max(0, r.left - c.left + r.width / 2 - ancho / 2), Math.max(0, c.width - ancho));
    const y = r.top - c.top - alto - 8 >= 0 ? r.top - c.top - alto - 8 : r.top - c.top + r.height + 8;
    nota.style.insetInlineStart = `${Math.round(x)}px`;
    nota.style.insetBlockStart = `${Math.round(y)}px`;
  }
  function ir(k) { i = Math.max(0, Math.min(total - 1, k)); cerrada = false; pintar(); }
  function cerrar() { cerrada = true; nota.hidden = true; soltar(); }

  parada.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') { if (!nota.hidden) { cerrar(); e.preventDefault(); } return; }
    if (e.key === 'Enter' && alElegir) { alElegir(i); e.preventDefault(); return; }
    let k = null;
    if (e.key === 'Home') k = 0;
    else if (e.key === 'End') k = total - 1;
    else if (e.key in teclas) k = typeof teclas[e.key] === 'function' ? teclas[e.key](i) : i + teclas[e.key];
    if (k === null) return;
    e.preventDefault();
    ir(k);
  }, s);
  parada.addEventListener('focus', () => { cerrada = false; pintar(); }, s);
  parada.addEventListener('blur', () => { nota.hidden = true; region.textContent = ''; soltar(); }, s);

  return {
    get actual() { return i; },
    ir,
    destroy() { ctrl.abort(); nota.remove(); region.remove(); soltar(); },
  };
}
