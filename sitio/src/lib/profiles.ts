// Build-time access to the per-municipality JSON written by the pipeline (public/data/m).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { slug } from './format';

const DATA = join(process.cwd(), 'public', 'data');
type IndexRow = [number, string, string, string, number | null, number];

export interface Profile {
  c: number; n: string; uf: string; rg: string; ri: string | null; y: number[];
  s: Record<string, (number | null)[]>;
  p: [number, number, number][];
  ss: [number, number, number, number][];
}

let index: IndexRow[] | null = null;
export function municipalities(): IndexRow[] {
  index ??= JSON.parse(readFileSync(join(DATA, 'municipalities.json'), 'utf8'));
  return index!;
}
export const profileSlug = (code: number, name: string) => `${code}-${slug(name)}`;

export function loadProfile(code: number): Profile {
  return JSON.parse(readFileSync(join(DATA, 'm', `${code}.json`), 'utf8'));
}

/** Left-to-right rank of every municipality in each year (1 = furthest left). */
let ranks: Map<number, Map<number, [number, number]>> | null = null;
export function rankOf(year: number, code: number): [number, number] | null {
  if (!ranks) {
    ranks = new Map();
    const a = JSON.parse(readFileSync(join(DATA, 'map', 'ideo.json'), 'utf8')) as { years: number[]; v: (number | null)[][]; order: number[] };
    a.years.forEach((y, yi) => {
      const pairs = a.order.map((c, i) => [c, a.v[yi][i]] as const).filter(([, v]) => v != null) as [number, number][];
      pairs.sort((p, q) => p[1] - q[1]);
      ranks!.set(y, new Map(pairs.map(([c], r) => [c, [r + 1, pairs.length]])));
    });
  }
  return ranks.get(year)?.get(code) ?? null;
}

/** Extremes and movers for the index page. */
export function rankings(year: number, prevYear: number, n = 10) {
  const a = JSON.parse(readFileSync(join(DATA, 'map', 'ideo.json'), 'utf8')) as { years: number[]; v: (number | null)[][]; order: number[] };
  const dl = JSON.parse(readFileSync(join(DATA, 'map', 'dalton.json'), 'utf8')) as { years: number[]; v: (number | null)[][] };
  const yi = a.years.indexOf(year), pi = a.years.indexOf(prevYear);
  const meta = new Map(municipalities().map((r) => [r[0], r]));
  const rows = a.order.map((c, i) => ({ c, v: a.v[yi][i], p: a.v[pi][i], dl: dl.v[yi][i] }))
    .filter((r) => r.v != null) as { c: number; v: number; p: number | null; dl: number | null }[];
  const named = (r: { c: number }) => ({ c: r.c, n: meta.get(r.c)![1], uf: meta.get(r.c)![2] });
  const byV = [...rows].sort((p, q) => p.v - q.v);
  const moves = rows.filter((r) => r.p != null).map((r) => ({ ...r, d: r.v - r.p! })).sort((p, q) => Math.abs(q.d) - Math.abs(p.d));
  const polar = rows.filter((r) => r.dl != null).sort((p, q) => q.dl! - p.dl!);
  return {
    left: byV.slice(0, n).map((r) => ({ ...named(r), x: r.v / 1000 })),
    right: byV.slice(-n).reverse().map((r) => ({ ...named(r), x: r.v / 1000 })),
    change: moves.slice(0, n).map((r) => ({ ...named(r), x: r.d / 1000 })),
    polar: polar.slice(0, n).map((r) => ({ ...named(r), x: (r.dl! / 1000) * 10 })),
  };
}
