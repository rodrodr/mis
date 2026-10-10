// Build-time figures (Observable Plot → SVG). Each returns the SVG plus the table rows,
// so the chart and its equivalent table come from the same records.
import { Plot, svg, C } from './plot';
import { score, num, pct, type Lang } from './format';
import { years, general, municipal, states, counterfactual, moran, byYear, type YearRow } from './data';
import { t } from '../i18n';
import { tramaDefs } from '../scripts/mini';

const W = 640;
const presBands = (() => {
  const out: { x1: number; x2: number; p: string; i: number }[] = [];
  let i = 0;
  for (const y of years) {
    const last = out[out.length - 1];
    if (last && last.p === y.president) last.x2 = y.year + 1;
    else out.push({ x1: y.year - 1, x2: y.year + 1, p: y.president, i: i++ });
  }
  return out;
})();
const arenaName = (lang: Lang, a: string) => (a === 'general' ? t(lang).common.general : t(lang).common.municipal);


/** Two stacked panels (general, municipal), each with only its own elections and a shared x scale. */
function byArena(lang: Lang, make: (arena: 'general' | 'municipal', title: string, last: boolean) => string) {
  const d = t(lang);
  return `<div class="paneles paneles--columna">${(['general', 'municipal'] as const).map((a, k) =>
    `<div class="panel-pequeno"><p class="panel-pequeno__titulo">${a === 'general' ? d.common.general_long : d.common.municipal_long}</p>${make(a, a === 'general' ? d.common.general_long : d.common.municipal_long, k === 1)}</div>`).join('')}</div>`;
}

export function e1(lang: Lang) {
  const d = t(lang);
  const rows = years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), mis: y.mis_mean, president: y.president, prov: y.provisional }));
  const s = svg({
    width: W, height: 300, marginLeft: 48, marginRight: 90,
    x: { label: null, tickFormat: (v: number) => String(v), ticks: years.filter((y) => y.year % 4 === 2).map((y) => y.year) },
    y: { label: `${d.common.mis} (${d.common.left} − / + ${d.common.right})`, domain: [0, 0.35], grid: true, tickFormat: (v: number) => score(lang, v, 1) },
    marks: [
      Plot.rect(presBands.filter((b) => b.i % 2 === 0), { x1: 'x1', x2: 'x2', y1: 0, y2: 0.35, fill: C.grid, fillOpacity: 0.45 }),
      Plot.text(presBands, { x: (b: any) => (b.x1 + b.x2) / 2, y: 0.345, text: 'p', fill: C.axis, fontSize: 9, lineAnchor: 'top' }),
      Plot.ruleY([0], { stroke: C.axis }),
      Plot.line(rows.filter((r) => r.arena === d.common.general), { x: 'year', y: 'mis', stroke: C.ink, strokeWidth: 2 }),
      Plot.line(rows.filter((r) => r.arena === d.common.municipal), { x: 'year', y: 'mis', stroke: C.ink, strokeWidth: 2, strokeDasharray: '5 4' }),
      Plot.dot(rows, {
        x: 'year', y: 'mis', r: 4.5, fill: (r: any) => (r.arena === d.common.general ? C.ink : C.paper), stroke: C.ink, strokeWidth: 1.5,
        title: (r: any) => `${r.year} · ${r.arena}: ${score(lang, r.mis)}${r.prov ? ` (${d.common.provisional})` : ''}`,
      }),
      Plot.text([general[general.length - 1]], { x: 'year', y: 'mis_mean', text: () => d.common.general, dx: 10, textAnchor: 'start', fill: C.ink, fontWeight: 700 }),
      Plot.text([municipal[municipal.length - 1]], { x: 'year', y: 'mis_mean', text: () => d.common.municipal, dx: 10, dy: 12, textAnchor: 'start', fill: C.ink }),
    ],
  }, d.figs.e1_sub);
  return { svg: s, rows };
}

export function e2(lang: Lang) {
  const d = t(lang);
  const rows = years.flatMap((y) => [
    { year: y.year, arena: arenaName(lang, y.arena), kind: d.common.typical, v: y.mis_mean },
    { year: y.year, arena: arenaName(lang, y.arena), kind: d.common.electorate, v: y.mis_wmean },
  ]);
  const s = svg({
    width: W, height: 300, marginLeft: 48, marginRight: 16,
    fx: { label: null, domain: [d.common.general, d.common.municipal] },
    x: { label: null, tickFormat: (v: number) => `’${String(v).slice(2)}`, ticks: 5 },
    y: { label: d.common.mis, grid: true, domain: [-0.05, 0.35], tickFormat: (v: number) => score(lang, v, 1) },
    marks: [
      Plot.ruleY([0], { stroke: C.axis }),
      Plot.areaY(years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), y1: y.mis_wmean, y2: y.mis_mean })), { fx: 'arena', x: 'year', y1: 'y1', y2: 'y2', fill: C.grid, fillOpacity: 0.7 }),
      Plot.line(rows, { fx: 'arena', x: 'year', y: 'v', z: 'kind', stroke: C.ink, strokeDasharray: (r: any) => (r.kind === d.common.typical ? null : '3 3'), strokeWidth: 1.8 }),
      Plot.dot(rows, {
        fx: 'arena', x: 'year', y: 'v', r: 3.5, stroke: C.ink, fill: (r: any) => (r.kind === d.common.typical ? C.ink : C.paper),
        title: (r: any) => `${r.year} · ${r.kind}: ${score(lang, r.v)}`,
      }),
    ],
  }, d.figs.e2_sub);
  return { svg: s, rows };
}

export function e3(lang: Lang, bins: number[]) {
  const d = t(lang);
  const html = byArena(lang, (arena, title, last) => {
    const ys = years.filter((y) => y.arena === arena);
    const rows: { year: number; x1: number; x2: number; n: number }[] = [];
    for (const y of ys) y.hist.forEach((n, i) => { if (n > 0) rows.push({ year: y.year, x1: bins[i], x2: bins[i + 1], n }); });
    return svg({
      width: W, height: ys.length * 17 + (last ? 44 : 14), marginLeft: 48, marginRight: 16, marginTop: 4, marginBottom: last ? 40 : 10,
      x: { label: last ? `${d.common.left} ← ${d.common.mis} → ${d.common.right}` : null, domain: [-0.8, 0.9], tickFormat: (v: number) => score(lang, v, 1), axis: last ? 'bottom' : null },
      y: { label: null, type: 'band', domain: ys.map((y) => y.year), tickFormat: (v: number) => String(v) },
      color: { type: 'sqrt', domain: [0, 900], range: ['var(--color-ideo-center)', 'var(--color-fig-ink)'] },
      marks: [
        Plot.rect(rows, { y: 'year', x1: 'x1', x2: 'x2', fill: 'n', inset: 0.5 }),
        Plot.ruleX([0], { stroke: C.axis, strokeDasharray: '2 2' }),
        Plot.dot(ys.map((y) => ({ year: y.year, m: y.mis_mean })), { y: 'year', x: 'm', r: 3, fill: C.paper, stroke: C.ink, title: (r: any) => `${r.year}: ${d.common.typical} ${score(lang, r.m)}` }),
      ],
    }, `${title}: ${d.figs.e3_sub}`);
  });
  const table = years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), sd: y.mis_sd, p10: y.mis_q[0], p50: y.mis_q[2], p90: y.mis_q[4] }));
  return { svg: html, rows: table };
}

export function e4(lang: Lang) {
  const d = t(lang);
  const bands = [d.figs.band_l2, d.figs.band_l1, d.figs.band_r1, d.figs.band_r2, d.figs.band_r3];
  const fills = [C.leftStrong, C.leftSoft, 'var(--color-ideo-right-faint)', C.rightSoft, C.rightStrong];
  const html = byArena(lang, (arena, title, last) => {
    const ys = years.filter((y) => y.arena === arena);
    const rows = ys.flatMap((y) => y.share_bins.map((v, i) => ({ year: y.year, band: bands[i], i, v })));
    return svg({
      width: W, height: ys.length * 17 + (last ? 44 : 14), marginLeft: 48, marginRight: 16, marginTop: 4, marginBottom: last ? 40 : 10,
      x: { label: last ? d.figs.share : null, tickFormat: (v: number) => pct(lang, v, 0), domain: [0, 1], axis: last ? 'bottom' : null },
      y: { label: null, type: 'band', domain: ys.map((y) => y.year), tickFormat: (v: number) => String(v) },
      color: { domain: bands, range: fills },
      marks: [
        Plot.barX(rows, Plot.stackX({ order: 'i', y: 'year', x: 'v', fill: 'band', stroke: 'var(--color-bg-raised)', strokeWidth: 0.5, title: (r: any) => `${r.year} · ${r.band}: ${pct(lang, r.v)}` })),
        Plot.ruleX([0.5], { stroke: C.axis, strokeDasharray: '2 2' }),
      ],
    }, `${title}: ${d.figs.e4_sub}`);
  });
  const table = years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), ...Object.fromEntries(bands.map((b, i) => [b, y.share_bins[i]])) }));
  return { svg: html, rows: table, bands, fills };
}

export function e6(lang: Lang, lastYear: number) {
  const d = t(lang);
  const rows = Object.entries(states).flatMap(([uf, r]) => {
    const a = r.find((x) => x.year === 2010), b = r.find((x) => x.year === lastYear);
    return a && b ? [{ uf, a: a.mis_wmean, b: b.mis_wmean, d: b.mis_wmean - a.mis_wmean }] : [];
  }).sort((p, q) => q.d - p.d);
  const pts = rows.flatMap((r) => [{ uf: r.uf, year: 2010, v: r.a }, { uf: r.uf, year: lastYear, v: r.b }]);
  const s = svg({
    width: W, height: 460, marginLeft: 70, marginRight: 70,
    x: { type: 'point', domain: [2010, lastYear], label: null, padding: 0.1 },
    y: { label: d.common.mis, grid: true, tickFormat: (v: number) => score(lang, v, 1) },
    marks: [
      Plot.ruleY([0], { stroke: C.axis }),
      Plot.line(pts, { x: 'year', y: 'v', z: 'uf', stroke: C.ink, strokeOpacity: 0.55 }),
      Plot.dot(pts, { x: 'year', y: 'v', r: 3, fill: C.ink, title: (p: any) => `${p.uf} ${p.year}: ${score(lang, p.v)}` }),
      Plot.text(pts.filter((p) => p.year === 2010), { x: 'year', y: 'v', text: 'uf', dx: -8, textAnchor: 'end', fontSize: 9, fill: C.ink }),
      Plot.text(pts.filter((p) => p.year === lastYear), { x: 'year', y: 'v', text: 'uf', dx: 8, textAnchor: 'start', fontSize: 9, fill: C.ink }),
    ],
  }, d.figs.e6_sub);
  return { svg: s, rows };
}

export function e7(lang: Lang) {
  const d = t(lang);
  const terms = [d.figs.vote, d.figs.place, d.figs.entry];
  const fills = ['var(--color-fig-vote)', 'var(--color-fig-place)', 'url(#trama-entrada)'];
  const swatches = ['var(--color-fig-vote)', 'var(--color-fig-place)', 'repeating-linear-gradient(45deg, var(--color-fig-vote) 0 2px, var(--color-bg-raised) 2px 5px)'];
  const rows = counterfactual.national.map((r) => ({
    pair: `${r.from}→${r.to}`, arena: arenaName(lang, r.arena), arenaKey: r.arena, total: r.d_mis_mean,
    [terms[0]]: r.vote_mean, [terms[1]]: r.place_mean, [terms[2]]: r.entry_mean,
  }));
  const ext = Math.max(...rows.flatMap((r) => [terms.reduce((s, k) => s + Math.max(0, (r as any)[k]), 0), -terms.reduce((s, k) => s + Math.min(0, (r as any)[k]), 0)]));
  const lim = Math.ceil(ext * 20) / 20;
  const html = byArena(lang, (arena, title, last) => {
    const rr = rows.filter((r) => r.arenaKey === arena);
    const long = rr.flatMap((r) => terms.map((k, i) => ({ pair: r.pair, term: k, i, v: (r as any)[k] as number })));
    const s = svg({
      width: W, height: rr.length * 22 + (last ? 44 : 14), marginLeft: 84, marginRight: 16, marginTop: 4, marginBottom: last ? 40 : 10,
      y: { label: null, type: 'band', domain: rr.map((r) => r.pair) },
      x: { label: last ? `${d.common.left} ← Δ ${d.common.mis} → ${d.common.right}` : null, grid: true, domain: [-lim, lim], tickFormat: (v: number) => score(lang, v, 2), axis: last ? 'bottom' : null },
      color: { domain: terms, range: fills },
      marks: [
        Plot.barX(long, Plot.stackX({ order: 'i', y: 'pair', x: 'v', fill: 'term', inset: 1, title: (r: any) => `${r.pair} · ${r.term}: ${score(lang, r.v)}` })),
        Plot.tickX(rr, { y: 'pair', x: 'total', stroke: C.ink, strokeWidth: 2.5, title: (r: any) => `${r.pair} · Δ ${d.common.mis}: ${score(lang, r.total)}` }),
        Plot.ruleX([0], { stroke: C.ink }),
      ],
    }, `${title}: ${d.figs.e7_sub}`);
    return s.replace(/^(<svg[^>]*>)/, `$1${tramaDefs}`);
  });
  return { svg: html, rows, terms, fills: swatches };
}

export { moran, byYear, num };
export type { YearRow };
