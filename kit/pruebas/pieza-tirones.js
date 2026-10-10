// Pieza de regresión para verificar.py --fps: tras pulsar «Jugar», cada frame bloquea el hilo 30 ms.
export function mount(el, ctx) {
  let parar = null;
  el.querySelector('#jugar')?.addEventListener('click', () => {
    parar ??= ctx.loop(() => { const fin = performance.now() + 30; while (performance.now() < fin) { /* trabajo */ } });
  }, { signal: ctx.signal });
  return { destroy() { parar?.(); } };
}
