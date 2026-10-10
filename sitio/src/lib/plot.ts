// Build-time Observable Plot → static SVG (same post-processing as kit/figura/render-plot.mjs).
// Marks with `title` become keyboard-navigable points (data-punto, role="img", aria-label);
// axes and grids leave the accessibility tree; the equivalent table lives in the HTML.
import * as Plot from '@observablehq/plot';
import { parseHTML } from 'linkedom';

export { Plot };

export function svg(options: Record<string, unknown>, label: string): string {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  let node = Plot.plot({ ...options, document } as Plot.PlotOptions) as unknown as Element;
  if (node.tagName?.toLowerCase() !== 'svg') node = node.querySelector('svg:last-of-type') ?? node;
  for (const t of [...node.querySelectorAll('title')]) {
    const mark = t.parentNode as Element | null;
    if (!mark || mark === node) continue;
    mark.setAttribute('data-punto', '');
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', (t.textContent ?? '').trim());
    mark.removeChild(t);
  }
  for (const g of [...node.querySelectorAll('[aria-label]')]) {
    if (g.hasAttribute('data-punto')) continue;
    g.removeAttribute('aria-label');
    g.removeAttribute('aria-description');
    if (!g.querySelector('[data-punto]')) g.setAttribute('aria-hidden', 'true');
  }
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', label);
  node.removeAttribute('font-family');
  // Plot's inline <style> sets a white background variable; the receipt paper comes from tokens
  return node.outerHTML
    .replace(/--plot-background:\s*white;/g, '--plot-background: transparent;')
    // trim coordinate precision in geometry attributes only (never in labels): 123.456 → 123.5
    .replace(/(\s(?:d|x|y|x1|x2|y1|y2|cx|cy|r|width|height|transform|points)=")([^"]*)"/g,
      (_m, a: string, v: string) => `${a}${v.replace(/(\d+\.\d)\d+/g, '$1')}"`);
}

/** Token colours for marks (Plot accepts var() as a constant). */
export const C = {
  ink: 'var(--color-fig-ink)', axis: 'var(--color-fig-axis)', grid: 'var(--color-fig-grid)',
  left: 'var(--color-ideo-left)', right: 'var(--color-ideo-right)',
  leftSoft: 'var(--color-ideo-left-soft)', rightSoft: 'var(--color-ideo-right-soft)',
  leftStrong: 'var(--color-ideo-left-strong)', rightStrong: 'var(--color-ideo-right-strong)',
  centre: 'var(--color-ideo-center)', paper: 'var(--color-bg-raised)', hatch: 'var(--color-fig-hatch)',
};
