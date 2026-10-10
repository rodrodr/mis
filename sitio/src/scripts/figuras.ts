// Progressive enhancement for every build-time figure: APG tabs (Chart · Table · Data)
// and one-tab-stop keyboard navigation through marks (kit/figura).
import { vistas } from '../../../kit/figura/vistas.js';
import { navegar } from '../../../kit/figura/navegar.js';

export function enhanceFigures(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-figura]').forEach((fig) => {
    if (fig.dataset.listo) return;
    fig.dataset.listo = '1';
    vistas(fig);
    const btn = fig.querySelector<HTMLButtonElement>('[data-descargar-svg]');
    const chart = fig.querySelector('[data-navegable] svg, .figura__vista svg');
    if (btn && chart) {
      btn.hidden = false;
      btn.addEventListener('click', () => {
        const clone = chart.cloneNode(true) as SVGElement;
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        // resolve token colours so the file stands alone
        const cs = getComputedStyle(fig);
        const text = clone.outerHTML.replace(/var\((--[\w-]+)\)/g, (_m, v) => cs.getPropertyValue(v).trim() || 'currentColor');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
        a.download = btn.dataset.descargarSvg!;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    }
    const nav = fig.querySelector<HTMLElement>('[data-navegable]');
    if (nav) navegar(nav);
  });
}
enhanceFigures();
