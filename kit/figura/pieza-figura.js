// pieza-figura.js · isla de una figura de datos: pestañas Gráfico · Tabla · Datos (vistas.js),
// navegación por teclado en el gráfico (navegar.js) y, si la figura trae [data-flip], la transición
// entre dos órdenes de los mismos datos (flip.js). Sin JS, la figura se lee entera (secciones
// apiladas, tabla real). Todo se deshace en destroy() (contrato 3).
//   <maestro-isla pieza="figura"> <div data-figura id="…" class="figura"> … </div> </maestro-isla>
//   registrar('figura', () => import('./figura/pieza-figura.js'));

import { vistas } from './vistas.js';
import { navegar } from './navegar.js';
import { flip } from './flip.js';

export function mount(el, ctx) {
  const figura = el.querySelector('[data-figura]');
  const v = vistas(figura, { signal: ctx.signal });
  const n = navegar(figura.querySelector('[data-navegable]') ?? figura, { signal: ctx.signal });
  const boton = figura.querySelector('[data-flip]');
  const celdas = figura.querySelector('.figura__celdas');
  if (boton && celdas) {
    boton.addEventListener('click', () => {
      const orden = boton.getAttribute('aria-pressed') === 'true' ? 'cronologico' : 'valor';
      const items = [...celdas.children];
      window.__flip = flip(items, () => {
        items.sort((a, b) => (orden === 'valor' ? Number(b.dataset.valor) - Number(a.dataset.valor) : Number(a.dataset.orden) - Number(b.dataset.orden)))
          .forEach((li) => celdas.append(li));
        boton.setAttribute('aria-pressed', String(orden === 'valor'));
      });
    }, { signal: ctx.signal });
  }
  return { destroy() { n?.destroy(); v?.destroy(); } };
}
