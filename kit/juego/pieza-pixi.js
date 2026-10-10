// pieza-pixi.js · PLANTILLA de isla para PixiJS 8.21 (contrato 3; tipos/juego.md). Cópiala y cambia la escena.
//   <maestro-isla pieza="juego" pausa-sin-foco> …HTML real: título, instrucciones, controles… </maestro-isla>
//   registrar('juego', () => import('./juego/pieza-pixi.js'));
// Probada en pruebas/prueba_juego.py: monta, dibuja, lee el color de los tokens, se pausa (fuera de
// pantalla, pestaña oculta, sin foco) y destroy() no deja rAF, listeners ni contexto WebGL vivo.
//
// Bucle: el Ticker de Pixi (lo usan sus plugins y GSAP PixiPlugin); pause() lo para y resume() lo
// arranca. La simulación va a paso fijo (bucle.js). Colores: ctx.hex(), nunca ctx.color() (Pixi no
// entiende oklch y lanza un error). Audio: Pixi no trae; los efectos de UI por feedback() y los del
// juego conectados a salidaMaestra() (feedback.js). WebGL por defecto (precedencia J14).

import { Application, Graphics } from 'pixi.js';
import { pasoFijo, azar } from './bucle.js';

export async function mount(el, ctx) {
  const lienzo = el.querySelector('[data-lienzo]') ?? el;
  const app = new Application();
  await app.init({
    preference: 'webgl',
    resizeTo: lienzo,
    resolution: ctx.dpr(),                  // tope por token (--canvas-dpr-max)
    autoDensity: true,
    backgroundAlpha: 0,                     // el fondo lo pone el CSS de la isla (tokens)
    antialias: true,
    autoStart: false,
  });
  app.canvas.setAttribute('aria-hidden', 'true');   // el contenido real es el HTML de la isla
  lienzo.prepend(app.canvas);

  const estado = (window.__juego = { motor: 'pixi', frames: 0, resizes: 0, hex: 0, color_motor: null, destruida: false });
  let reducido = ctx.reduced();
  let color = 0;
  const leerColores = () => { color = ctx.hex('--color-accent-solid'); estado.hex = color; };
  leerColores();

  // escena: puntos que orbitan (sustitúyela por la tuya)
  const rnd = azar(42);
  const puntos = Array.from({ length: 24 }, (_, i) => {
    const g = new Graphics().circle(0, 0, 4 + rnd() * 3).fill(0xffffff);   // blanco + tint: recolorear sin redibujar
    g.tint = color;
    app.stage.addChild(g);
    return { g, fase: (i / 24) * Math.PI * 2, prev: 0, ahora: 0 };
  });
  estado.color_motor = puntos[0].g.tint;
  const colocar = (alfa) => {
    const { width: w, height: h } = app.screen;
    for (const p of puntos) {
      const f = p.prev + (p.ahora - p.prev) * alfa;           // interpolación entre pasos
      p.g.position.set(w / 2 + Math.cos(p.fase + f) * w * 0.35, h / 2 + Math.sin(p.fase * 2 + f) * h * 0.3);
    }
  };
  const paso = pasoFijo({
    hz: 60,
    actualizar: (dt) => { for (const p of puntos) { p.prev = p.ahora; p.ahora += reducido ? 0 : dt * 0.8; } },
    dibujar: colocar,
  });
  app.ticker.add((tk) => { estado.frames++; paso(tk.deltaMS); });
  colocar(0);
  app.render();
  if (!reducido) app.ticker.start();

  window.addEventListener('resize', () => { estado.resizes++; }, { signal: ctx.signal });

  return {
    pause() { app.ticker.stop(); },
    resume() { if (!reducido) app.ticker.start(); else app.render(); },
    theme() { leerColores(); for (const p of puntos) p.g.tint = color; estado.color_motor = puntos[0].g.tint; app.render(); },
    motion(r) { reducido = r; if (r) { app.ticker.stop(); app.render(); } else app.ticker.start(); },
    destroy() {
      app.ticker.stop();
      // releaseGlobalResources: sin él, al volver a montar en la misma pestaña hay texturas rancias
      app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true, texture: true, textureSource: true });
      estado.destruida = true;
    },
  };
}
