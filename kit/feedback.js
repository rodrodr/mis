// feedback.js · bus único de feedback: imagen + sonido + háptica en el mismo frame (contrato 4).
//
//   import { feedback } from './feedback.js';
//   boton.addEventListener('pointerdown', () => feedback('select', { el: boton }));
//   feedback('error', { el: campo, mensaje: 'El correo no tiene arroba. Revísalo y vuelve a enviar.' });
//
// Eventos y parámetros: $extensions["es.maestro.feedback"] de tokens.json → tokens/dist/feedback-tokens.js.
// Reglas que hace cumplir:
// - La imagen SIEMPRE: data-feedback en el elemento (movimiento.css lo pinta; con movimiento
//   reducido queda el cambio de color sin temblor) y, si hay mensaje, una región viva
//   (status para lo normal, alert solo para error). Nada depende solo del sonido o la háptica.
// - Sonido desactivado por defecto; se activa con prefs.set({ sound: true }) desde un control visible.
// - Un único AudioContext, perezoso: tonos de UI → ganancia maestra (0,2) → bus → limitador → salida.
//   audioContext() lo comparte con Phaser (`audio: { context }`), three (THREE.AudioContext.setContext)
//   o Tone. OJO: esos motores conectan su nodo maestro a ctx.destination y se saltan el limitador;
//   hay que reconectarlo a salidaMaestra() (el bus antes del limitador), motor por motor:
//     Phaser  game.sound.masterVolumeNode.disconnect(); game.sound.masterVolumeNode.connect(salidaMaestra())
//     three   listener.gain.disconnect(); listener.gain.connect(salidaMaestra())   (tras new THREE.AudioListener())
//     Tone    Tone.setContext(ctx, true)   (true cierra el AudioContext que Tone crea al importarse)
//             Tone.getDestination().output.disconnect(); Tone.connect(Tone.getDestination().output, salidaMaestra())
//     propio  cualquierNodo.connect(salidaMaestra())
//   La música y los efectos del motor llevan su propio volumen (deslizadores de música y efectos);
//   la ganancia 0,2 es solo la de los tonos de UI. El limitador vale para todo lo que entra al bus.
//   Probado (23-09-2026, pruebas/prueba_juego.py y a mano con Tone 15.1.22): tras reconectar, a
//   ctx.destination solo llega el limitador. Phaser, al destruirse, SUSPENDE el contexto inyectado:
//   el siguiente feedback() lo reanuda.
// - Eventos de un MOTOR (juego): la imagen y la háptica van por el bus, el sonido no, porque el del
//   juego sale por salidaMaestra() con su propio volumen. Se declaran eventos propios con
//   `"sound": null` y su `haptic` en $extensions["es.maestro.feedback"].events (p. ej. «caza»,
//   «ruido», «frase» en el juego de ejemplo) y se llaman igual: feedback('caza', { el: isla }).
//   Sin ficheros de audio, Phaser con `audio: { noAudio: true }` y todo sintetizado aquí (contrato 4).
// - Ataque ≥ 2 ms, variación de tono ±3 %, tope de disparos por segundo (sonido y háptica).
// - Háptica por adaptador: navigator.vibrate por defecto (Android); conectarHaptica(fn) para
//   web-haptics u otra librería. En iOS y escritorio puede no hacer nada: nunca sostiene la interacción.

import FB from './tokens/dist/feedback-tokens.js';
import { prefs } from './preferencias.js';

const M = FB.master ?? { gain: 0.2, gainMax: 0.25, attackMs: 3, detune: 0.03, maxPerSecond: 8 };
let ctx = null, salida = null, bus = null;
let cubo = { t: 0, n: 0 };
const PATRONES = { selection: [8], light: [10], medium: [16], heavy: [24], success: [12, 40, 12], warning: [20, 60, 20], error: [30, 50, 30, 50, 30] };
let haptica = (preset) => (navigator.vibrate ? navigator.vibrate(PATRONES[preset] ?? [10]) : false);

/** El AudioContext compartido (lo crea si no existe). Llamarlo dentro de un gesto lo desbloquea. */
export function audioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const maestro = ctx.createGain();                     // tonos de UI
    maestro.gain.value = Math.min(M.gain, M.gainMax);
    bus = ctx.createGain();                               // todo lo que suena entra aquí
    const limitador = ctx.createDynamicsCompressor();
    limitador.threshold.value = -12; limitador.ratio.value = 12; limitador.attack.value = 0.002;
    maestro.connect(bus);
    bus.connect(limitador).connect(ctx.destination);
    salida = maestro;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Entrada del bus maestro (antes del limitador) para el audio de los motores. Crea el contexto si falta. */
export function salidaMaestra() {
  return audioContext() ? bus : null;
}

/** Sustituye el adaptador háptico, p. ej. conectarHaptica((p) => haptics.trigger(p)) con web-haptics. */
export function conectarHaptica(fn) { haptica = fn; }

function permitir() {
  const ahora = performance.now();
  if (ahora - cubo.t > 1000) cubo = { t: ahora, n: 0 };
  return ++cubo.n <= M.maxPerSecond;
}

function tono(s) {
  const ac = audioContext();
  if (!ac) return false;
  // el primer gesto crea el contexto suspendido: sonar en cuanto resume() se resuelva, no perder el sonido
  if (ac.state !== 'running') { ac.resume().then(() => sonar(ac, s), () => {}); return 'pendiente'; }
  return sonar(ac, s);
}

function sonar(ac, s) {
  const t0 = ac.currentTime;                              // una sola lectura (ui-sound-design)
  const notas = s.notes ?? [s.from];
  const dur = s.ms / 1000 / notas.length;
  const ataque = Math.max(0.002, (M.attackMs ?? 3) / 1000);
  const varia = 1 + (Math.random() * 2 - 1) * (M.detune ?? 0.03);
  notas.forEach((f, i) => {
    const ini = t0 + i * dur;
    const osc = ac.createOscillator(), env = ac.createGain();
    osc.type = s.wave ?? 'sine';
    osc.frequency.setValueAtTime(f * varia, ini);
    if (s.to && !s.notes) osc.frequency.exponentialRampToValueAtTime(s.to * varia, ini + dur);
    env.gain.setValueAtTime(0.0001, ini);
    env.gain.exponentialRampToValueAtTime(1, ini + ataque);
    env.gain.exponentialRampToValueAtTime(0.001, ini + dur);   // nunca rampa exponencial a 0
    osc.connect(env).connect(salida);
    osc.onended = () => { osc.disconnect(); env.disconnect(); };
    osc.start(ini);
    osc.stop(ini + dur + 0.012);
  });
  return true;
}

let regiones = null;
function anunciar(texto, urgente) {
  if (!regiones) {
    // regiones estables creadas una vez, antes de hablar (better-accessibility)
    regiones = {};
    for (const [clave, rol] of [['status', 'status'], ['alert', 'alert']]) {
      const r = document.createElement('div');
      r.setAttribute('role', rol);
      r.className = 'visualmente-oculto';
      document.body.append(r);
      regiones[clave] = r;
    }
  }
  const r = urgente ? regiones.alert : regiones.status;
  r.textContent = '';
  requestAnimationFrame(() => { r.textContent = texto; });
}

/**
 * Dispara un evento de feedback. Devuelve qué canales salieron: { imagen, sonido, haptica }.
 * sonido: true (programado), 'pendiente' (sonará al reanudarse el AudioContext) o false.
 * @param {'press'|'select'|'success'|'warning'|'error'|string} evento
 * @param {{ el?: Element, mensaje?: string }} [opciones]
 */
export function feedback(evento, { el, mensaje } = {}) {
  const def = FB.events?.[evento];
  if (!def) throw new Error(`feedback: evento desconocido "${evento}" (defínelo en tokens.json)`);
  const res = { imagen: false, sonido: false, haptica: false };

  if (el) {
    el.removeAttribute('data-feedback');
    void el.offsetWidth;                                  // reinicia la animación si se repite
    el.setAttribute('data-feedback', evento);
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-overlay')) || 280;
    clearTimeout(el._feedbackT);
    el._feedbackT = setTimeout(() => el.removeAttribute('data-feedback'), ms + 120);
    el.dispatchEvent(new CustomEvent('feedback', { bubbles: true, detail: { evento } }));
    res.imagen = true;
  }
  if (mensaje) { anunciar(mensaje, evento === 'error'); res.imagen = true; }

  if (!def.sound && !def.haptic) return res;
  if (!permitir()) return res;                            // limitador: la imagen ya salió
  const p = prefs.get();
  if (def.sound && p.sound === true) res.sonido = tono(def.sound);
  if (def.haptic && p.haptic !== false) { try { res.haptica = Boolean(haptica(def.haptic)); } catch { res.haptica = false; } }
  return res;
}
