// Canvas choropleth of the 5,571 municipalities (IBGE 2024 boundaries, simplified).
// One parade of Tab for the whole map: arrow keys walk municipalities (state, then name),
// Enter opens the profile, Esc clears. A live region announces the focused municipality.
// Colours come from tokens (hue = ideology only; other measures in ink).
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { interpolateLab } from 'd3-interpolate';
import { rgb } from 'd3-color';

export type VarKey = 'ideo' | 'dalton' | 'enep' | 'fem' | 'gap' | 'ideopref' | 'lisa' | 'misF' | 'fv' | 'votes';
export interface MapArrays { scale: number; years: number[]; v: (number | null)[][] }
export interface Municipality { c: number; n: string; uf: string; rg: string; ri: number | null; e: number }

const cache = new Map<string, Promise<unknown>>();
export function getJSON<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }));
  }
  return cache.get(url) as Promise<T>;
}

/** Resolve any CSS colour (incl. oklch tokens) to an sRGB string usable for interpolation. */
const probe = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d', { willReadFrequently: true }) : null;
export function tokenRGB(el: Element, name: string): string {
  const css = getComputedStyle(el).getPropertyValue(name).trim() || '#888';
  if (!probe) return css;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

export interface Palette {
  diverging: string[]; sequential: string[]; missing: string; notApplicable: string;
  stroke: string; border: string; hatch: string; paper: string; ink: string; lisa: Record<number, string>;
}
export function palette(el: Element): Palette {
  const T = (n: string) => tokenRGB(el, n);
  const ls = T('--color-ideo-left-strong'), l = T('--color-ideo-left'), lsoft = T('--color-ideo-left-soft');
  const c = T('--color-ideo-center'), rsoft = T('--color-ideo-right-soft'), r = T('--color-ideo-right'), rs = T('--color-ideo-right-strong');
  const stops = [ls, l, lsoft, c, rsoft, r, rs];
  const div = (t: number) => {
    const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    return interpolateLab(stops[i], stops[i + 1])(x - i);
  };
  const paper = T('--color-bg-raised'), ink = T('--color-fig-ink');
  const seq = (t: number) => interpolateLab(T('--color-ideo-center'), ink)(Math.max(0, Math.min(1, t)));
  const N = 10;
  return {
    diverging: Array.from({ length: N }, (_, i) => rgb(div((i + 0.5) / N)).formatRgb()),
    sequential: Array.from({ length: 7 }, (_, i) => rgb(seq(0.08 + (i / 6) * 0.86)).formatRgb()),
    missing: T('--color-fig-missing'), notApplicable: paper, stroke: T('--color-fig-stroke'),
    border: ink, hatch: T('--color-fig-hatch'), paper, ink,
    lisa: { 0: T('--color-bg-surface'), 1: rs, 2: ls, 3: rsoft, 4: lsoft },
  };
}

export interface Scale { breaks: number[]; colors: string[]; kind: 'div' | 'seq' | 'cat'; fmt: (v: number) => string }

/** Classed scales. Breaks are fixed per measure so years compare on one legend. */
export function scaleFor(v: VarKey | 'change' | 'rel', pal: Palette, fmt: (v: number, d?: number) => string): Scale {
  const div = (lim: number): Scale => {
    const n = pal.diverging.length, step = (2 * lim) / n;
    return { kind: 'div', colors: pal.diverging, breaks: Array.from({ length: n - 1 }, (_, i) => -lim + step * (i + 1)), fmt: (x) => fmt(x, 2) };
  };
  const seq = (lo: number, hi: number, d = 1, f = (x: number) => fmt(x, d)): Scale => {
    const n = pal.sequential.length, step = (hi - lo) / n;
    return { kind: 'seq', colors: pal.sequential, breaks: Array.from({ length: n - 1 }, (_, i) => lo + step * (i + 1)), fmt: f };
  };
  switch (v) {
    case 'ideo': case 'ideopref': return div(0.5);
    case 'rel': return div(0.4);
    case 'change': return div(0.3);
    case 'gap': return div(0.6);
    case 'dalton': return seq(0.2, 0.62, 2);
    case 'enep': return seq(2, 9, 1);
    case 'fem': return seq(0, 0.35, 2);
    default: return seq(0, 1);
  }
}
export function classify(s: Scale, x: number): string {
  let i = 0;
  while (i < s.breaks.length && x >= s.breaks[i]) i++;
  return s.colors[i];
}

type Geo = { type: string; id: number; geometry: unknown };
export interface MapOptions {
  base: string; mini?: boolean;
  label: (m: Municipality) => string;
  onHover?: (m: Municipality | null, value: string | null) => void;
  onSelect?: (m: Municipality) => void;
  /** Space the overlays need (px): the map is fitted around it so labels never cover data. */
  reserve?: () => { w: number; h: number; b: number };
}

export async function createMap(host: HTMLElement, opts: MapOptions) {
  const ctrl = new AbortController();
  const sig = { signal: ctrl.signal };
  const [topo, order, munis] = await Promise.all([
    getJSON<any>(`${opts.base}/data/geo/municipios.topo.json`),
    getJSON<number[]>(`${opts.base}/data/map/order.json`),
    getJSON<[number, string, string, string, number | null, number][]>(`${opts.base}/data/municipalities.json`),
  ]);
  const geos = (feature(topo, topo.objects.municipios) as unknown as { features: Geo[] }).features;
  const states = mesh(topo, topo.objects.municipios, (a: any, b: any) => Math.floor(a.id / 1e5) !== Math.floor(b.id / 1e5) || a === b);
  const pos = new Map(order.map((c, i) => [c, i]));
  const meta = new Map<number, Municipality>(munis.map(([c, n, uf, rg, ri, e]) => [c, { c, n, uf, rg, ri, e }]));
  const featByIndex: (Geo | undefined)[] = [];
  for (const g of geos) { const i = pos.get(+g.id); if (i != null) featByIndex[i] = g; }
  // keyboard order: by state, then name
  const kbd = [...order].sort((a, b) => {
    const A = meta.get(a)!, B = meta.get(b)!;
    return A.uf.localeCompare(B.uf) || A.n.localeCompare(B.n, 'pt');
  });

  const canvas = document.createElement('canvas');
  const pick = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'lienzo__canvas';
  host.append(canvas);
  const live = document.createElement('p');
  live.className = 'visualmente-oculto';
  live.setAttribute('role', 'status');
  host.append(live);
  if (!opts.mini) {
    host.tabIndex = 0;
    host.setAttribute('role', 'application');
  }

  let values: (number | null)[] = [];
  let colorOf: (i: number) => string = () => '#ccc';
  let hatched: (i: number) => boolean = () => false;
  let paths: Path2D[] = [];
  let borders: Path2D | null = null;
  let W = 0, H = 0, dpr = 1;
  let hover = -1, focus = -1, selected = -1;
  let transform = { k: 1, x: 0, y: 0 };
  let hatch: CanvasPattern | null = null;
  let pal = palette(host);

  function layout() {
    const w = host.clientWidth || 600;
    // the explorer gives the host a definite height (viewport minus header): fit to it
    const h = opts.mini ? w : (host.clientHeight > 120 ? host.clientHeight : Math.min(Math.round(w * 0.95), Math.round(innerHeight * 0.82)));
    if (w === W && h === H) return false;
    W = w; H = h;
    dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [canvas, pick]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const pad = opts.mini ? 8 : 16;
    const fc = { type: 'FeatureCollection', features: geos } as any;
    const fit = (x0: number, y0: number, x1: number, y1: number) =>
      geoConicEqualArea().parallels([-2, -22]).rotate([54, 0]).fitExtent([[x0, y0], [Math.max(x0 + 50, x1), Math.max(y0 + 50, y1)]], fc);
    let proj = fit(pad, pad, W - pad, H - pad);
    const r = opts.reserve?.();
    if (r && r.w && !r.h) proj = fit(pad, pad, W - pad - r.w, H - pad);
    else if (r && (r.w || r.h)) {
      // overlays sit top-right: either keep a right-hand column or a top (and bottom) band free,
      // whichever leaves the country larger
      const side = fit(pad, pad, W - pad - r.w, H - pad);
      const band = fit(pad, pad + r.h, W - pad, H - pad - r.b);
      proj = side.scale() >= band.scale() ? side : band;
    }
    const path = geoPath(proj);
    paths = featByIndex.map((f) => new Path2D(f ? (path(f as any) ?? '') : ''));
    borders = new Path2D(path(states as any) ?? '');
    drawPick();
    return true;
  }
  function drawPick() {
    const g = pick.getContext('2d', { willReadFrequently: true })!;
    g.setTransform(dpr * transform.k, 0, 0, dpr * transform.k, dpr * transform.x, dpr * transform.y);
    g.clearRect(-1e4, -1e4, 3e4, 3e4);
    paths.forEach((p, i) => {
      const id = i + 1;
      g.fillStyle = `rgb(${id & 255}, ${(id >> 8) & 255}, ${(id >> 16) & 255})`;
      g.fill(p);
    });
  }
  function makeHatch(ctx: CanvasRenderingContext2D) {
    const t = document.createElement('canvas');
    t.width = t.height = 6;
    const g = t.getContext('2d')!;
    g.fillStyle = pal.paper; g.fillRect(0, 0, 6, 6);
    g.strokeStyle = pal.hatch; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 6); g.lineTo(6, 0); g.stroke();
    hatch = ctx.createPattern(t, 'repeat');
  }
  function draw() {
    const ctx = canvas.getContext('2d')!;
    if (!hatch) makeHatch(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * transform.k, 0, 0, dpr * transform.k, dpr * transform.x, dpr * transform.y);
    const lw = 0.35 / transform.k;
    ctx.lineWidth = lw;
    ctx.strokeStyle = pal.stroke;
    paths.forEach((p, i) => {
      ctx.fillStyle = hatched(i) && hatch ? hatch : colorOf(i);
      ctx.fill(p);
      if (transform.k > 2.5 || W > 700) ctx.stroke(p);
    });
    if (borders) { ctx.lineWidth = 0.9 / transform.k; ctx.strokeStyle = pal.border; ctx.stroke(borders); }
    for (const [i, w] of [[selected, 2.6], [focus, 2.2], [hover, 1.6]] as const) {
      if (i >= 0 && paths[i]) { ctx.lineWidth = w / transform.k; ctx.strokeStyle = pal.ink; ctx.stroke(paths[i]); }
    }
  }
  function indexAt(ev: PointerEvent | MouseEvent) {
    const r = canvas.getBoundingClientRect();
    const x = Math.round((ev.clientX - r.left) * dpr), y = Math.round((ev.clientY - r.top) * dpr);
    const d = pick.getContext('2d', { willReadFrequently: true })!.getImageData(x, y, 1, 1).data;
    const id = d[0] + (d[1] << 8) + (d[2] << 16);
    return d[3] === 255 ? id - 1 : -1;
  }
  const valueText = (i: number) => (values[i] == null ? null : String(values[i]));
  function announce(i: number) {
    const c = order[i]; const m = meta.get(c);
    if (m) live.textContent = opts.label(m);
  }

  canvas.addEventListener('pointermove', (ev) => {
    const i = indexAt(ev);
    if (i !== hover) {
      hover = i; draw();
      const m = i >= 0 ? meta.get(order[i]) ?? null : null;
      opts.onHover?.(m, i >= 0 ? valueText(i) : null);
    }
  }, sig);
  canvas.addEventListener('pointerleave', () => { hover = -1; draw(); opts.onHover?.(null, null); }, sig);
  canvas.addEventListener('click', (ev) => {
    const i = indexAt(ev);
    if (i >= 0) { selected = i; draw(); opts.onSelect?.(meta.get(order[i])!); }
  }, sig);
  if (!opts.mini) {
    // zoom with wheel / buttons, pan with drag
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomAt(ev.clientX - r.left, ev.clientY - r.top, ev.deltaY < 0 ? 1.25 : 0.8);
    }, { ...sig, passive: false });
    let drag: { x: number; y: number; tx: number; ty: number } | null = null;
    canvas.addEventListener('pointerdown', (ev) => { drag = { x: ev.clientX, y: ev.clientY, tx: transform.x, ty: transform.y }; }, sig);
    addEventListener('pointerup', () => { if (drag) { drag = null; drawPick(); } }, sig);
    canvas.addEventListener('pointermove', (ev) => {
      if (!drag || ev.buttons !== 1) return;
      transform.x = drag.tx + ev.clientX - drag.x; transform.y = drag.ty + ev.clientY - drag.y; draw();
    }, sig);
    host.addEventListener('keydown', (ev) => {
      const k = ev.key;
      let j = focus < 0 ? -1 : kbd.indexOf(order[focus]);
      if (k === 'ArrowRight' || k === 'ArrowDown') j = Math.min(kbd.length - 1, j + 1);
      else if (k === 'ArrowLeft' || k === 'ArrowUp') j = Math.max(0, j - 1);
      else if (k === 'PageDown') j = Math.min(kbd.length - 1, j + 25);
      else if (k === 'PageUp') j = Math.max(0, j - 25);
      else if (k === 'Home') j = 0;
      else if (k === 'End') j = kbd.length - 1;
      else if (k === 'Enter' && focus >= 0) { opts.onSelect?.(meta.get(order[focus])!); return; }
      else if (k === 'Escape') { focus = -1; draw(); opts.onHover?.(null, null); return; }
      else if (k === '+' || k === '=') { zoomAt(W / 2, H / 2, 1.25); return; }
      else if (k === '-') { zoomAt(W / 2, H / 2, 0.8); return; }
      else return;
      ev.preventDefault();
      focus = pos.get(kbd[j])!;
      draw(); announce(focus);
      opts.onHover?.(meta.get(order[focus])!, valueText(focus));
    }, sig);
  }
  function zoomAt(px: number, py: number, f: number) {
    const k = Math.max(1, Math.min(24, transform.k * f));
    const r = k / transform.k;
    transform = { k, x: px - (px - transform.x) * r, y: py - (py - transform.y) * r };
    if (k === 1) transform = { k: 1, x: 0, y: 0 };
    draw(); drawPick();
  }
  const ro = new ResizeObserver(() => { if (layout()) draw(); });
  ro.observe(host);
  layout();

  return {
    order, meta,
    /** Paint values: value per order index, colour function and optional hatching. */
    paint(v: (number | null)[], color: (x: number | null, i: number) => string, hatchFn?: (i: number) => boolean) {
      values = v;
      colorOf = (i) => color(values[i] ?? null, i);
      hatched = hatchFn ?? (() => false);
      draw();
    },
    select(code: number | null) { selected = code == null ? -1 : pos.get(code) ?? -1; draw(); },
    focusCode(code: number) {
      const b = paths[pos.get(code) ?? -1]; if (!b) return;
      selected = pos.get(code)!; draw();
    },
    zoom(f: number) { zoomAt(W / 2, H / 2, f); },
    relayout() { W = 0; H = 0; if (layout()) draw(); },
    reset() { transform = { k: 1, x: 0, y: 0 }; draw(); drawPick(); },
    retheme() { pal = palette(host); hatch = null; draw(); return pal; },
    palette: () => pal,
    destroy() { ctrl.abort(); ro.disconnect(); canvas.remove(); live.remove(); },
  };
}
export type MapHandle = Awaited<ReturnType<typeof createMap>>;
