// Build-time state-level map (no-JS poster for the municipal canvas map).
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import topo from '../data/estados.topo.json';
import { states } from './data';

const fc = feature(topo as any, (topo as any).objects.estados) as any;
const SIZE = 600;
const proj = geoConicEqualArea().parallels([-2, -22]).rotate([54, 0]).fitExtent([[8, 8], [SIZE - 8, SIZE - 8]], fc);
const path = geoPath(proj).digits(0);

/** Fill as a token mix, so it follows the theme: left/right ink mixed with the centre tone. */
export function mixFill(v: number | null, lim = 0.5): string {
  if (v == null) return 'var(--color-fig-missing)';
  const t = Math.max(-1, Math.min(1, v / lim));
  const tok = t < 0 ? 'var(--color-ideo-left-strong)' : 'var(--color-ideo-right-strong)';
  return `color-mix(in oklab, ${tok} ${Math.round(Math.abs(t) * 100)}%, var(--color-ideo-center))`;
}

export function statePoster(year: number, label: (uf: string, v: number | null) => string) {
  const shapes = fc.features.map((f: any) => {
    const row = states[f.id]?.find((r) => r.year === year);
    const v = row ? row.mis_wmean : null;
    return { uf: f.id as string, d: path(f) ?? '', fill: mixFill(v), label: label(f.id, v) };
  });
  return { size: SIZE, shapes };
}

/** Generic state poster: value per state and a fill function (ink ramp for non-ideology measures). */
export function statePosterBy(value: (uf: string) => number | null, fillFn: (v: number | null) => string, label: (uf: string, v: number | null) => string) {
  return {
    size: SIZE,
    shapes: fc.features.map((f: any) => {
      const v = value(f.id);
      return { uf: f.id as string, d: path(f) ?? '', fill: fillFn(v), label: label(f.id, v) };
    }),
  };
}
export function inkFill(v: number | null, lo: number, hi: number): string {
  if (v == null) return 'var(--color-fig-missing)';
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return `color-mix(in oklab, var(--color-fig-ink) ${Math.round(8 + t * 82)}%, var(--color-ideo-center))`;
}

/** Change map without using hue: increases in ink (darker = larger), decreases hatched. */
export function changeFill(v: number | null, hi: number): string {
  if (v == null) return 'var(--color-fig-missing)';
  if (v < 0) return 'url(#trama-desc)';
  const t = Math.max(0, Math.min(1, v / hi));
  return `color-mix(in oklab, var(--color-fig-ink) ${Math.round(8 + t * 82)}%, var(--color-ideo-center))`;
}
