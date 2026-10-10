// pieza-phaser.js · PLANTILLA de isla para Phaser 4.2 (contrato 3; tipos/juego.md). Cópiala y cambia la escena.
//   <maestro-isla pieza="juego" pausa-sin-foco> …HTML real: título, instrucciones, controles… </maestro-isla>
//   registrar('juego', () => import('./juego/pieza-phaser.js'));
// Probada en pruebas/prueba_juego.py: monta, dibuja, lee el color de los tokens, se pausa y destroy()
// no deja rAF, listeners, contexto WebGL ni audio conectado fuera del bus.
//
// Lo que Phaser no hace solo y esta plantilla sí:
// - Bucle: Phaser trae el suyo (TimeStep) y paso fijo en su física (Arcade `fixedStep`). pause()
//   DUERME el bucle (game.loop.sleep(): sin rAF fuera de pantalla); destroy() lo despierta antes,
//   porque game.destroy() es diferido y un bucle dormido no llegaría a ejecutarlo.
// - WebGL: game.destroy() no pierde el contexto; se suelta con WEBGL_lose_context al terminar.
// - Audio: se inyecta el AudioContext del bus (`audio: { context }`) y su nodo maestro, que Phaser
//   conecta a ctx.destination, se reconecta a salidaMaestra() (limitador). Ojo: al destruirse, Phaser
//   SUSPENDE el contexto inyectado; feedback() lo reanuda en el siguiente gesto.
// - Teclado: `input.keyboard: false`. Las teclas van por la capa de acciones (acciones.js, sobre
//   event.code, solo con el foco en la isla); Phaser se queda ratón, táctil y mando (precedencia J15).
// - Colores: ctx.hex(), nunca ctx.color() (Phaser convierte «oklch(…)» en negro sin avisar).
// - DPR: Scale.RESIZE pinta a 1 píxel por píxel CSS y en pantallas 2× el texto del canvas sale borroso
//   (fricción F6 del juego de ejemplo). Aquí: Scale.NONE con el búfer a tamaño CSS × dpr (ctx.dpr(), con
//   tope por token) y zoom 1/dpr; la cámara hace zoom × dpr, así que el MUNDO SE MIDE EN PX CSS; cada
//   Text lleva `resolution: dpr`. Al redimensionar (ResizeObserver del lienzo): setZoom(1/dpr), resize(w·dpr,
//   h·dpr) y cámara.setZoom(dpr). prueba_juego.py comprueba canvas.width = clientWidth × dpr a DPR 2.
// - Sin ficheros de audio (todo sintetizado por feedback.js/salidaMaestra()): `audio: { noAudio: true }`
//   y nada del SoundManager. Con ficheros: el SoundManager con el contexto inyectado, como aquí.
// - Precalentar en create() los objetos y textos que usa la primera jugada (pools): crear textos o
//   texturas en mitad del juego da un frame > 33 ms justo después de «Jugar», que es lo que mide --fps.

import * as Phaser from 'phaser';
import { audioContext, salidaMaestra } from '../feedback.js';

export function mount(el, ctx) {
  const lienzo = el.querySelector('[data-lienzo]') ?? el;
  let dpr = ctx.dpr();
  const medida = () => ({ w: Math.max(1, Math.round(lienzo.clientWidth || 300)), h: Math.max(1, Math.round(lienzo.clientHeight || 150)) });
  let { w, h } = medida();                      // tamaño CSS: el mundo se mide en px CSS
  const estado = (window.__juego = { motor: 'phaser', frames: 0, resizes: 0, hex: 0, color_motor: null, destruida: false, dpr });
  let reducido = ctx.reduced();
  let escena = null;

  class Escena extends Phaser.Scene {
    create() {
      escena = this;
      this.cameras.main.setOrigin(0, 0).setZoom(dpr);
      this.puntos = Array.from({ length: 24 }, (_, i) => this.add.circle(0, 0, 5, 0xffffff).setData('fase', (i / 24) * Math.PI * 2));
      // texto nítido: resolution = dpr (sin esto, borroso en pantallas 2× aunque el búfer sea grande)
      this.rotulo = this.add.text(8, 8, 'Phaser', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', resolution: dpr });
      this.tiempo = 0;
      this.pintarColores();
      this.game.canvas.setAttribute('aria-hidden', 'true');
    }
    pintarColores() {
      estado.hex = ctx.hex('--color-accent-solid');
      for (const p of this.puntos) p.setFillStyle(estado.hex);
      this.rotulo.setColor(`#${ctx.hex('--color-text-secondary').toString(16).padStart(6, '0')}`);   // Text: cadena #rrggbb, nunca oklch
      estado.color_motor = this.puntos[0].fillColor;
    }
    update(_t, dt) {
      estado.frames++;
      if (!reducido) this.tiempo += dt / 1000;
      for (const p of this.puntos) {
        const f = p.getData('fase');
        p.setPosition(w / 2 + Math.cos(f + this.tiempo * 0.8) * w * 0.35, h / 2 + Math.sin(f * 2 + this.tiempo * 0.8) * h * 0.3);
      }
    }
  }

  const ac = audioContext();                    // el del bus: suspendido hasta el primer gesto
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: lienzo,
    transparent: true,                           // el fondo lo pone el CSS de la isla (tokens)
    scale: { mode: Phaser.Scale.NONE, width: w * dpr, height: h * dpr, zoom: 1 / dpr },
    audio: ac ? { context: ac } : { noAudio: true },
    input: { keyboard: false },
    banner: false,
    scene: Escena,
  });
  const reconectarAudio = () => {
    const nodo = game.sound?.masterVolumeNode;
    if (nodo && ac) { nodo.disconnect(); nodo.connect(salidaMaestra()); }
  };
  if (game.isBooted) reconectarAudio(); else game.events.once('boot', reconectarAudio);

  const redimensionar = () => {
    const m = medida(), d = ctx.dpr();
    if (m.w === w && m.h === h && d === dpr) return;
    ({ w, h } = m);
    dpr = estado.dpr = d;
    game.scale.setZoom(1 / dpr);
    game.scale.resize(w * dpr, h * dpr);
    escena?.cameras.main.setZoom(dpr);
    escena?.rotulo.setResolution(dpr);
  };
  const ro = new ResizeObserver(redimensionar);
  ro.observe(lienzo);
  window.addEventListener('resize', () => { estado.resizes++; }, { signal: ctx.signal });

  return {
    pause() { game.loop.sleep(); game.sound?.pauseAll?.(); },
    resume() { game.loop.wake(); game.sound?.resumeAll?.(); },
    theme() { escena?.pintarColores(); },
    motion(r) { reducido = r; },
    destroy() {
      ro.disconnect();
      const gl = game.renderer?.gl ?? null;
      game.events.once('destroy', () => setTimeout(() => {
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
        estado.destruida = true;
      }, 0));
      if (!game.loop.running) game.loop.wake();   // un bucle dormido nunca ejecutaría el destroy diferido
      game.destroy(true);
    },
  };
}
