// isla.js · plantilla de isla con ciclo de vida (contrato 3). Sin framework y sin dependencias.
//
//   <maestro-isla pieza="grafo" margen="200px" [pausa-sin-foco]>
//     …HTML estático completo: póster, tabla, texto. Es lo que se ve sin JS y lo que lee el lector
//     de pantalla. La isla añade encima; nunca lo sustituye.
//   </maestro-isla>
//
//   import { registrar } from './isla.js';
//   registrar('grafo', () => import('./grafo.js'));      // import() estático: el bundler lo parte
//
// El registro puede llegar tarde (p. ej. tras `load`, para no competir con el LCP): una isla visible
// cuya pieza aún no está registrada se queda en «espera» y se monta en cuanto se registre. Si 10 s
// después de `load` sigue sin registrar, pasa a «error» y lo dice en la consola (nombre mal escrito).
//
// El módulo de la pieza exporta mount(el, ctx) y devuelve
//   { destroy(), pause?(), resume?(), theme?(), motion?(reducido) }.
// ctx ofrece:
//   ctx.signal         AbortSignal: todo addEventListener con { signal } se quita solo al destruir
//   ctx.loop(fn)       bucle rAF fn(t, dt); se pausa fuera de pantalla y con la pestaña oculta
//   ctx.frame(fn)      un solo rAF (render bajo demanda)
//   ctx.reduced()      ¿movimiento reducido? (atributo data-motion o preferencia del sistema)
//   ctx.color('--x')   color del token en el tema actual como texto CSS, para canvas 2D (fillStyle).
//                      Con tokens oklch devuelve «oklch(…)»: los motores NO lo entienden (Phaser lo
//                      convierte en negro, three avisa y no cambia, Pixi lanza un error). Para ellos:
//   ctx.hex('--x')     número 0xRRGGBB (sRGB): Phaser (setTint, fillStyle de Graphics), Pixi
//                      (new Color(n), tint), three (new THREE.Color(n): lo pasa a lineal él solo)
//   ctx.rgba('--x')    [r, g, b, a] en 0–1, en sRGB (sin linealizar): alfa, uniforms de WebGL propios
//                      y three con color.setRGB(r, g, b, THREE.SRGBColorSpace)
//                      Los dos convierten pintando 1×1 en un canvas 2D y leyendo getImageData.
//   ctx.token('--x')   valor de cualquier token (número, duración…) como texto
//   ctx.dpr({full})    devicePixelRatio con tope de --canvas-dpr-max (1,5 a pantalla completa)
// Estados en data-isla: espera → cargando → activa ⇄ pausada → destruida | error.
// Pausa: fuera de pantalla y con la pestaña oculta, siempre; con el atributo pausa-sin-foco, también
// cuando la ventana pierde el foco (juegos: listón 2.1 #7). La isla llama a pause()/resume() de la
// pieza: una pieza con su propio bucle (Phaser, Pixi Ticker, three setAnimationLoop) lo para ahí.
// Garantía: tras destroy() no queda ningún rAF, listener ni observador de esta isla. La pieza libera
// lo suyo en su destroy(): Phaser game.destroy(true), Pixi app.destroy({removeView:true,
// releaseGlobalResources:true},{children:true,texture:true,textureSource:true}), three
// renderer.dispose() + geometrías/materiales/texturas, GSAP ctx.revert(), Tiptap editor.destroy().

import { reducido } from './preferencias.js';

const registro = new Map();
const pendientes = new Map();          // nombre → Set de islas que esperan a que se registre
export function registrar(nombre, cargador) {
  registro.set(nombre, cargador);
  for (const avisar of pendientes.get(nombre) ?? []) avisar();
  pendientes.delete(nombre);
}

export class Isla extends HTMLElement {
  #pieza = null; #ctrl = null; #io = null; #mo = null; #sonda = null; #lienzo = null; #espera = null;
  #bucles = new Set(); #rafs = new Set();
  #visible = false; #montada = false; #sinFoco = false;

  connectedCallback() {
    if (this.#io) return;
    this.dataset.isla = 'espera';
    this.#io = new IntersectionObserver(([e]) => this.#visibilidad(e.isIntersecting), {
      rootMargin: this.getAttribute('margen') ?? '200px',
    });
    this.#io.observe(this);
  }

  disconnectedCallback() { this.destroy(); }

  #visibilidad(visible) {
    this.#visible = visible;
    if (visible && !this.#montada) this.#montar();
    this.#pausar(this.#debePausar());
  }

  #debePausar() {
    return !this.#visible || document.hidden || (this.#sinFoco && this.hasAttribute('pausa-sin-foco'));
  }

  async #montar() {
    const nombre = this.getAttribute('pieza');
    if (!registro.has(nombre)) {            // registro diferido: esperar sin error
      if (this.#espera) return;
      const avisar = () => { clearTimeout(this.#espera?.t); this.#espera = null; if (this.isConnected && this.#visible && !this.#montada) this.#montar(); };
      // el plazo cuenta desde `load` (una red lenta no es un nombre mal escrito)
      const plazo = () => setTimeout(() => {
        if (document.readyState !== 'complete') { this.#espera.t = plazo(); return; }
        pendientes.get(nombre)?.delete(avisar);
        this.#espera = null;
        this.dataset.isla = 'error';
        console.error(new Error(`isla: pieza "${nombre}" sin registrar 10 s después de cargar la página`));
      }, 10000);
      this.#espera = { avisar, t: plazo() };
      if (!pendientes.has(nombre)) pendientes.set(nombre, new Set());
      pendientes.get(nombre).add(avisar);
      return;
    }
    this.#montada = true;
    this.dataset.isla = 'cargando';
    this.#ctrl = new AbortController();
    const { signal } = this.#ctrl;
    try {
      const mod = await registro.get(nombre)();
      if (signal.aborted) return;
      this.#pieza = await mod.mount(this, this.#contexto(signal));
      if (signal.aborted) { this.#pieza?.destroy?.(); this.#pieza = null; return; }
      this.dataset.isla = 'activa';
      this.#pausar(this.#debePausar());
    } catch (err) {
      this.dataset.isla = 'error';          // el HTML estático sigue ahí: la página no se rompe
      console.error(err);
      return;
    }
    // la pestaña oculta pausa; volver la reanuda si la isla está en pantalla
    document.addEventListener('visibilitychange', () => this.#pausar(this.#debePausar()), { signal });
    // la ventana sin foco pausa solo con pausa-sin-foco (por eventos: document.hasFocus() es false
    // en navegadores sin cabeza y dejaría la pieza pausada para siempre)
    window.addEventListener('blur', () => { this.#sinFoco = true; this.#pausar(this.#debePausar()); }, { signal });
    window.addEventListener('focus', () => { this.#sinFoco = false; this.#pausar(this.#debePausar()); }, { signal });
    // tema, contraste y movimiento: atributos de <html>, medios del sistema y el evento 'prefs'
    const avisar = () => { this.#pieza?.theme?.(); this.#pieza?.motion?.(reducido()); };
    this.#mo = new MutationObserver(avisar);
    this.#mo.observe(document.documentElement, { attributeFilter: ['data-theme', 'data-contrast', 'data-motion'] });
    for (const q of ['(prefers-color-scheme: dark)', '(prefers-contrast: more)', '(prefers-reduced-motion: reduce)'])
      matchMedia(q).addEventListener('change', avisar, { signal });
    window.addEventListener('prefs', avisar, { signal });
  }

  #contexto(signal) {
    const isla = this;
    const token = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
    const color = (nombre) => {
      // resolver con una sonda: vale para var(), alias y light-dark() escrito a mano
      if (!isla.#sonda) {
        isla.#sonda = document.createElement('span');
        isla.#sonda.hidden = true;
        isla.#sonda.setAttribute('aria-hidden', 'true');
        isla.append(isla.#sonda);
      }
      isla.#sonda.style.color = `var(${nombre})`;
      return getComputedStyle(isla.#sonda).color;
    };
    const rgba = (nombre) => {
      // cualquier espacio de color (oklch, p3…) → sRGB de 8 bits, como lo pinta el navegador
      if (!isla.#lienzo) {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        isla.#lienzo = c.getContext('2d', { willReadFrequently: true });
      }
      const g = isla.#lienzo;
      g.clearRect(0, 0, 1, 1);
      g.fillStyle = '#000';                   // si el token no es un color, queda negro y se ve
      g.fillStyle = color(nombre);
      g.fillRect(0, 0, 1, 1);
      const [r, v, b, a] = g.getImageData(0, 0, 1, 1).data;
      return [r / 255, v / 255, b / 255, a / 255];
    };
    return {
      signal,
      reduced: reducido,
      loop(fn) {
        const b = { fn, t0: 0, activo: true };
        isla.#bucles.add(b);
        isla.#arrancar(b);
        return () => { b.activo = false; isla.#bucles.delete(b); };
      },
      frame(fn) {
        const id = requestAnimationFrame((t) => { isla.#rafs.delete(id); fn(t); });
        isla.#rafs.add(id);
      },
      token,
      color,
      rgba,
      hex(nombre) {
        const [r, v, b] = rgba(nombre).map((x) => Math.round(x * 255));
        return (r << 16) | (v << 8) | b;
      },
      dpr({ full = false } = {}) {
        const tope = parseFloat(token(full ? '--canvas-dpr-max-full' : '--canvas-dpr-max')) || 2;
        return Math.min(window.devicePixelRatio || 1, tope);
      },
    };
  }

  #arrancar(b) {
    if (this.dataset.isla === 'pausada' || !b.activo) return;
    const paso = (t) => {
      this.#rafs.delete(b.id);
      if (!b.activo || this.dataset.isla === 'pausada') return;
      const dt = b.t0 ? t - b.t0 : 0;
      b.t0 = t;
      b.fn(t, dt);
      b.id = requestAnimationFrame(paso);
      this.#rafs.add(b.id);
    };
    b.id = requestAnimationFrame(paso);
    this.#rafs.add(b.id);
  }

  #pausar(pausa) {
    if (!this.#pieza) return;
    const estado = pausa ? 'pausada' : 'activa';
    if (this.dataset.isla === estado) return;
    this.dataset.isla = estado;
    if (pausa) {
      for (const id of this.#rafs) cancelAnimationFrame(id);
      this.#rafs.clear();
      this.#pieza.pause?.();
    } else {
      this.#pieza.resume?.();
      for (const b of this.#bucles) { b.t0 = 0; this.#arrancar(b); }
    }
  }

  destroy() {
    if (this.#espera) { clearTimeout(this.#espera.t); pendientes.get(this.getAttribute('pieza'))?.delete(this.#espera.avisar); this.#espera = null; }
    for (const id of this.#rafs) cancelAnimationFrame(id);
    this.#rafs.clear();
    this.#bucles.clear();
    this.#ctrl?.abort();
    this.#io?.disconnect();
    this.#mo?.disconnect();
    try { this.#pieza?.destroy?.(); } finally {
      this.#pieza = null; this.#io = null; this.#mo = null;
      this.#sonda?.remove(); this.#sonda = null; this.#lienzo = null;
      this.#montada = false;
      this.dataset.isla = 'destruida';
    }
  }
}

if (!customElements.get('maestro-isla')) customElements.define('maestro-isla', Isla);
