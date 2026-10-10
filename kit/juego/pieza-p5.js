// pieza-p5.js · PLANTILLA de isla para p5.js 2.3 en PRODUCCIÓN (precedencia J16). Cópiala y cambia el boceto.
//   <maestro-isla pieza="boceto"> …HTML real… </maestro-isla>
//   registrar('boceto', () => import('./juego/pieza-p5.js'));
// Probada en pruebas/prueba_juego.py: monta, dibuja, se pausa y destroy() no deja rAF, listeners ni canvas.
//
// Condiciones para producción: modo INSTANCIA (nunca el global, que ensucia window), remove() en
// destroy, noLoop() con movimiento reducido y fuera de pantalla, colores por ctx.rgba() y la isla
// por debajo del pliegue con póster. Peso medido el 23-09-2026 (gzip -9): p5 2.3.3
// (lib/p5.esm.min.js, un solo fichero) ≈ 312 kB; p5 1.11.13 ≈ 251 kB; q5 4.8.2 ≈ 49 kB. q5 imita
// buena parte de la API de p5: si todas las funciones del boceto existen en q5 (compruébalo antes),
// es la opción ligera; esta plantilla solo está probada con p5. Presupuesto: el de juego (≲ 500 kB
// dentro de la isla), nunca en el héroe.

import p5 from 'p5';

export function mount(el, ctx) {
  const lienzo = el.querySelector('[data-lienzo]') ?? el;
  const estado = (window.__juego = { motor: 'p5', frames: 0, resizes: 0, hex: 0, color_motor: null, destruida: false });
  let reducido = ctx.reduced();
  let color = [0, 0, 0];
  const leerColores = () => { color = ctx.rgba('--color-accent-solid').slice(0, 3).map((x) => Math.round(x * 255)); estado.hex = ctx.hex('--color-accent-solid'); };
  leerColores();

  const inst = new p5((s) => {
    s.setup = () => {
      const c = s.createCanvas(lienzo.clientWidth || 300, lienzo.clientHeight || 150);
      c.elt.setAttribute('aria-hidden', 'true');
      s.pixelDensity(ctx.dpr());
      s.noStroke();
      if (reducido) s.noLoop();
    };
    s.draw = () => {
      estado.frames++;
      s.clear();
      s.fill(...color);
      const t = reducido ? 0 : s.millis() / 1000;
      for (let i = 0; i < 24; i++) {
        const f = (i / 24) * Math.PI * 2;
        s.circle(s.width / 2 + Math.cos(f + t * 0.8) * s.width * 0.35, s.height / 2 + Math.sin(f * 2 + t * 0.8) * s.height * 0.3, 9);
      }
      estado.color_motor = (color[0] << 16) | (color[1] << 8) | color[2];
    };
    s.windowResized = () => { estado.resizes++; s.resizeCanvas(lienzo.clientWidth || 300, lienzo.clientHeight || 150); };
  }, lienzo);

  return {
    pause() { inst.noLoop(); },
    resume() { if (!reducido) inst.loop(); else inst.redraw(); },
    theme() { leerColores(); inst.redraw(); },
    motion(r) { reducido = r; if (r) inst.noLoop(); else inst.loop(); inst.redraw(); },
    destroy() { inst.remove(); estado.destruida = true; },
  };
}
