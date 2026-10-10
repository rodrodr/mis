// E5: small multiples, one municipal map per election, two rows (general / municipal).
// One canvas; paths are built once and drawn 17 times with a translation.
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { getJSON, palette, scaleFor, classify } from './mapa';

const host = document.querySelector<HTMLElement>('[data-pequenos]');
if (host) {
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); draw(host); } }, { rootMargin: '300px' });
  io.observe(host);
}

async function draw(host: HTMLElement) {
  const base = host.dataset.base!;
  const [topo, order, arr] = await Promise.all([
    getJSON<any>(`${base}/data/geo/municipios.topo.json`),
    getJSON<number[]>(`${base}/data/map/order.json`),
    getJSON<{ years: number[]; v: (number | null)[][]; scale: number }>(`${base}/data/map/ideo.json`),
  ]);
  const geos = (feature(topo, topo.objects.municipios) as any).features;
  const pos = new Map(order.map((c, i) => [c, i]));
  const rows = [arr.years.filter((y) => (y - 1994) % 4 === 0), arr.years.filter((y) => (y - 1994) % 4 !== 0)];
  const cols = 9;
  const W = host.clientWidth || 900;
  const cell = Math.floor(W / cols);
  const lab = 16;
  const H = 2 * (cell + lab);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  canvas.setAttribute('aria-hidden', 'true');
  host.querySelector('[data-pequenos-lienzo]')!.append(canvas);
  const proj = geoConicEqualArea().parallels([-2, -22]).rotate([54, 0]).fitExtent([[3, 3], [cell - 3, cell - 3]], { type: 'FeatureCollection', features: geos });
  const path = geoPath(proj);
  const borders = new Path2D(path(mesh(topo, topo.objects.municipios, (a: any, b: any) => Math.floor(a.id / 1e5) !== Math.floor(b.id / 1e5) || a === b) as any) ?? '');
  const paths: (Path2D | null)[] = [];
  for (const g of geos) { const i = pos.get(+g.id); if (i != null) paths[i] = new Path2D(path(g) ?? ''); }
  const pal = palette(host);
  const sc = scaleFor('ideo', pal, (x) => x.toFixed(2));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.font = `600 11px ${getComputedStyle(host).getPropertyValue('--font-family-mono')}`;
  rows.forEach((ys, r) => ys.forEach((y, c) => {
    const yi = arr.years.indexOf(y);
    const ox = c * cell, oy = r * (cell + lab);
    ctx.fillStyle = pal.ink;
    ctx.fillText(String(y), ox + 4, oy + 12);
    ctx.save();
    ctx.translate(ox, oy + lab);
    paths.forEach((p, i) => {
      if (!p) return;
      const v = arr.v[yi][i];
      ctx.fillStyle = v == null ? pal.paper : classify(sc, v / arr.scale);
      ctx.fill(p);
    });
    // state borders and the country outline, in ink
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 0.6;
    ctx.stroke(borders);
    ctx.restore();
  }));
}
