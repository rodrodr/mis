// Pieza de ejemplo para isla.js: canvas 2D que lee tokens, respeta el movimiento reducido y
// se libera entera en destroy(). Expone contadores en window.__pieza para las pruebas.
export function mount(el, ctx) {
  const lienzo = document.createElement('canvas');
  lienzo.setAttribute('aria-hidden', 'true');        // el contenido real es la tabla de debajo
  el.prepend(lienzo);
  const g = lienzo.getContext('2d');
  const estado = (window.__pieza = { frames: 0, resizes: 0, temas: 0, destruida: false, color: '', hex: null, rgba: null });
  let colores = {};
  const leer = () => {
    colores = { punto: ctx.color('--color-accent-solid'), linea: ctx.color('--color-border-subtle') };
    // lo que recibiría un motor (Phaser, Pixi, three): número 0xRRGGBB y [r, g, b, a] en 0–1
    Object.assign(estado, { color: colores.punto, hex: ctx.hex('--color-accent-solid'), rgba: ctx.rgba('--color-accent-solid') });
  };
  const medir = () => {
    const dpr = ctx.dpr();
    lienzo.width = Math.round(lienzo.clientWidth * dpr);
    lienzo.height = Math.round(lienzo.clientHeight * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const dibujar = (t) => {
    const w = lienzo.clientWidth, h = lienzo.clientHeight;
    g.clearRect(0, 0, w, h);
    g.fillStyle = colores.linea; g.fillRect(0, h - 2, w, 1);
    g.fillStyle = colores.punto;
    const fase = ctx.reduced() ? 0 : t / 900;         // reducido: quieto
    for (let i = 0; i < 24; i++) {
      const x = (i + 0.5) * (w / 24), y = h / 2 + Math.sin(fase + i / 2) * h * 0.3;
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
  };
  leer(); medir();
  window.addEventListener('resize', () => { estado.resizes++; medir(); }, { signal: ctx.signal });
  const parar = ctx.loop((t) => { estado.frames++; dibujar(t); });
  return {
    theme() { estado.temas++; leer(); ctx.frame(dibujar); },
    motion() { ctx.frame(dibujar); },
    destroy() { parar(); lienzo.remove(); estado.destruida = true; },
  };
}
