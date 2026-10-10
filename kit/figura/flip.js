// flip.js · transición entre dos vistas de LOS MISMOS datos con FLIP y WAAPI (precedencia E26;
// contratos §5: «FLIP de datos: WAAPI, ≈ 30 líneas; GSAP Flip solo si ya está en la página»).
// Se anima solo cuando la transición explica la relación entre las dos vistas (las 755 sesiones del
// calendario que se agrupan por mes); nunca barras que «crecen» por decoración.
//
//   import { flip } from './figura/flip.js';
//   const animaciones = flip(celdas, () => rejilla.dataset.vista = 'mes');   // el cambio, por CSS/DOM
//   await Promise.all(animaciones.map((a) => a.finished));
//
// Duración --dur-chart (≤ 400 ms), curva --ease-out, escalonado --dur-stagger con tope
// --dur-stagger-max (como `calc(sibling-index() * var(--dur-stagger))` en CSS, pero calculado aquí,
// porque WAAPI no lee sibling-index()). Con movimiento reducido: cambio instantáneo, sin animación.
// Elementos HTML (o SVG sin escalar por viewBox: las cajas se miden en píxeles de pantalla).

import { reducido } from '../preferencias.js';

const token = (n, d) => { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || d; };
const ms = (v) => (v.endsWith('ms') ? parseFloat(v) : v.endsWith('s') ? parseFloat(v) * 1000 : parseFloat(v)) || 0;

export function flip(elementos, cambiar, opciones = {}) {
  const els = [...elementos];
  const antes = new Map(els.map((e) => [e, e.getBoundingClientRect()]));
  cambiar();
  if (reducido() || !Element.prototype.animate) return [];
  const duracion = opciones.duracion ?? ms(token('--dur-chart', '400ms'));
  const escalonado = opciones.escalonado ?? ms(token('--dur-stagger', '40ms'));
  const tope = opciones.tope ?? ms(token('--dur-stagger-max', '300ms'));
  const easing = opciones.easing ?? token('--ease-out', 'ease-out');
  const animaciones = [];
  let orden = 0;
  for (const e of els) {
    const a = antes.get(e), d = e.getBoundingClientRect();
    const dx = a.left - d.left, dy = a.top - d.top;
    const sx = d.width ? a.width / d.width : 1, sy = d.height ? a.height / d.height : 1;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
    animaciones.push(e.animate([
      { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transformOrigin: '0 0', transform: 'none' },
    ], { duration: duracion, delay: Math.min(orden++ * escalonado, tope), easing, fill: 'backwards' }));
  }
  return animaciones;
}
