// vistas.js · Gráfico · Tabla · Datos (anatomía OWID; tipos/datos-editorial.md). Mejora progresiva:
// sin JS, las tres vistas son secciones apiladas con un índice de anclas; con JS, pestañas APG
// (flechas, Inicio, Fin, activación automática) que conservan el hash: #fig-sesiones-tabla abre la
// tabla, se puede enlazar y el botón Atrás no se rompe (replaceState, sin entradas nuevas).
//
//   <div data-figura id="fig-sesiones">
//     <nav class="figura__indice" aria-label="Vistas de la figura">
//       <a href="#fig-sesiones-grafico">Gráfico</a> <a href="#fig-sesiones-tabla">Tabla</a> <a href="#fig-sesiones-datos">Datos</a>
//     </nav>
//     <section id="fig-sesiones-grafico" class="figura__vista" aria-labelledby="…"> <h3 id="…">Gráfico</h3> … </section>
//     …
//   </div>
//   import { vistas } from './figura/vistas.js';   const v = vistas(document.getElementById('fig-sesiones'));   v.destroy();

export function vistas(figura, { signal } = {}) {
  const indice = figura.querySelector('.figura__indice');
  const enlaces = [...(indice?.querySelectorAll('a[href^="#"]') ?? [])];
  const paneles = enlaces.map((a) => figura.querySelector(a.getAttribute('href')));
  if (!indice || enlaces.length < 2 || paneles.some((p) => !p)) return null;
  const ctrl = new AbortController();
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
  const s = { signal: ctrl.signal };

  // índice de anclas → lista de pestañas (el nav se conserva para restaurarlo en destroy)
  const lista = document.createElement('div');
  lista.setAttribute('role', 'tablist');
  lista.setAttribute('aria-label', indice.getAttribute('aria-label') || 'Vistas');
  lista.className = 'figura__pestanas';
  const pestanas = enlaces.map((a, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.id = `${paneles[k].id}-pestana`;
    b.setAttribute('aria-controls', paneles[k].id);
    b.textContent = a.textContent.trim();
    lista.append(b);
    return b;
  });
  indice.hidden = true;
  indice.after(lista);
  const titulos = paneles.map((p) => p.querySelector(':scope > h2, :scope > h3, :scope > h4'));
  paneles.forEach((p, k) => {
    p.setAttribute('role', 'tabpanel');
    // APG: el panel entra en el orden de Tab solo si no tiene nada enfocable dentro (la tabla sí; el
    // gráfico navegable y la sección de descargas, no)
    if (!p.querySelector('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [data-punto]')) p.setAttribute('tabindex', '0');
    p.dataset.etiquetaPrevia = p.getAttribute('aria-labelledby') ?? '';
    p.setAttribute('aria-labelledby', pestanas[k].id);
    titulos[k]?.classList.add('visualmente-oculto');   // la pestaña ya lo nombra
  });

  function activar(k, { foco = false, hash = true } = {}) {
    pestanas.forEach((b, j) => {
      b.setAttribute('aria-selected', String(j === k));
      b.tabIndex = j === k ? 0 : -1;
      paneles[j].hidden = j !== k;
    });
    if (foco) pestanas[k].focus();
    if (hash) history.replaceState(history.state, '', `#${paneles[k].id}`);
  }
  const desdeHash = () => paneles.findIndex((p) => `#${p.id}` === location.hash);
  activar(Math.max(0, desdeHash()), { hash: false });

  lista.addEventListener('click', (e) => { const k = pestanas.indexOf(e.target.closest('[role="tab"]')); if (k >= 0) activar(k); }, s);
  lista.addEventListener('keydown', (e) => {
    const k = pestanas.indexOf(document.activeElement);
    if (k < 0) return;
    const n = pestanas.length;
    const destino = { ArrowRight: (k + 1) % n, ArrowLeft: (k - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    activar(destino, { foco: true });
  }, s);
  window.addEventListener('hashchange', () => { const k = desdeHash(); if (k >= 0) activar(k, { hash: false }); }, s);

  return {
    activar,
    destroy() {
      ctrl.abort();
      lista.remove();
      indice.hidden = false;
      paneles.forEach((p, k) => {
        p.hidden = false;
        p.removeAttribute('role');
        p.removeAttribute('tabindex');
        if (p.dataset.etiquetaPrevia) p.setAttribute('aria-labelledby', p.dataset.etiquetaPrevia); else p.removeAttribute('aria-labelledby');
        delete p.dataset.etiquetaPrevia;
        titulos[k]?.classList.remove('visualmente-oculto');
      });
    },
  };
}
