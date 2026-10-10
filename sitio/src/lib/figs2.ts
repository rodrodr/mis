// Build-time figures for Polarization, Gender and Methodology.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Plot, svg, C } from './plot';
import { score, num, pct, type Lang } from './format';
import { years, counterfactual, moran, parties, partyVotes, facts } from './data';
import { municipalities, loadProfile } from './profiles';
import { t } from '../i18n';
import { grupo, grupoColor } from './grupos';

const W = 640;
const arenaName = (lang: Lang, a: string) => (a === 'general' ? t(lang).common.general : t(lang).common.municipal);
const mapArr = (k: string) => JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'map', `${k}.json`), 'utf8')) as { years: number[]; v: (number | null)[][]; scale: number; order?: number[] };
const xYear = { label: null, tickFormat: (v: number) => `’${String(v).slice(2)}`, ticks: 5 };
const fyArena = (lang: Lang) => ({ label: null, domain: [t(lang).common.general, t(lang).common.municipal] });

// ------------------------------------------------------------------ polarization
export function p1(lang: Lang) {
  const d = t(lang);
  const rows = years.flatMap((y) => [
    { year: y.year, arena: arenaName(lang, y.arena), kind: d.common.typical, v: y.dalton_mean },
    { year: y.year, arena: arenaName(lang, y.arena), kind: d.common.electorate, v: y.dalton_wmean },
  ]);
  const s = svg({
    width: W, height: 300, marginLeft: 44,
    fx: { label: null, domain: [d.common.general, d.common.municipal] }, x: xYear,
    y: { label: `${d.common.dalton} (0–10)`, grid: true, domain: [3, 6] },
    marks: [
      Plot.line(rows, { fx: 'arena', x: 'year', y: 'v', z: 'kind', stroke: C.ink, strokeWidth: 1.8, strokeDasharray: (r: any) => (r.kind === d.common.typical ? null : '3 3') }),
      Plot.dot(rows, { fx: 'arena', x: 'year', y: 'v', r: 3.5, stroke: C.ink, fill: (r: any) => (r.kind === d.common.typical ? C.ink : C.paper), title: (r: any) => `${r.year} · ${r.kind}: ${num(lang, r.v, 2)}` }),
    ],
  }, d.pol.p1_sub);
  const table = years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), typ: y.dalton_mean, el: y.dalton_wmean }));
  return { svg: s, rows: table };
}

/** Two contrasting municipalities (electorate ≥ 50,000) in the last election. */
export function p2(lang: Lang) {
  const d = t(lang);
  const Y = facts.last.year;
  const dl = mapArr('dalton'), ideo = mapArr('ideo');
  const yi = dl.years.indexOf(Y);
  const idx = municipalities().filter((r) => r[5] >= 50000).map((r) => r[0]);
  const order = ideo.order!;
  const cand = idx.map((c) => ({ c, dl: dl.v[yi][order.indexOf(c)], m: ideo.v[yi][order.indexOf(c)] }))
    .filter((r) => r.dl != null && r.m != null) as { c: number; dl: number; m: number }[];
  cand.sort((a, b) => a.dl - b.dl);
  const lo = cand[0], hi = cand[cand.length - 1];
  const pt = parties.filter((p) => p.year === Y);
  const theta = new Map(pt.map((p) => [p.num, p]));
  const pick = (c: number, tag: string) => {
    const P = loadProfile(c);
    const mis = P.s.ideo[P.y.indexOf(Y)] as number;
    return {
      name: `${P.n} (${P.uf})`, tag, mis, dalton: (P.s.dalton[P.y.indexOf(Y)] as number) * 10,
      bars: P.p.filter((r) => r[0] === Y && r[2] >= 0.005).map((r) => ({ s: r[2], th: theta.get(r[1])?.theta ?? 0, sig: theta.get(r[1])?.sigla ?? String(r[1]) })),
    };
  };
  const A = pick(lo.c, d.pol.low), B = pick(hi.c, d.pol.high);
  const lab = (x: typeof A) => `${x.tag}: ${x.name} · ${d.common.dalton} ${num(lang, x.dalton, 1)}`;
  const rows = [A, B].flatMap((x) => x.bars.map((b) => ({ panel: lab(x), ...b })));
  const s = svg({
    width: W, height: 380, marginLeft: 44, marginTop: 24,
    fy: { label: null, domain: [lab(A), lab(B)], axis: null },
    x: { domain: [-1, 1], label: `${d.common.left} ← θ → ${d.common.right}`, tickFormat: (v: number) => score(lang, v, 1) },
    y: { label: d.method.share, tickFormat: (v: number) => pct(lang, v, 0) },
    marks: [
      Plot.rectY(rows, { fy: 'panel', x1: (r: any) => r.th - 0.025, x2: (r: any) => r.th + 0.025, y: 's', fill: C.ink, title: (r: any) => `${r.sig} (${score(lang, r.th, 2)}): ${pct(lang, r.s)}` }),
      Plot.ruleX([A, B].map((x) => ({ panel: lab(x), mis: x.mis })), { fy: 'panel', x: 'mis', stroke: C.ink, strokeWidth: 2, strokeDasharray: '4 2' }),
      Plot.ruleY([0], { stroke: C.axis }),
      Plot.text([lab(A), lab(B)].map((p) => ({ panel: p })), { fy: 'panel', text: 'panel', frameAnchor: 'top-left', dy: -14, fontWeight: 700, fill: C.ink }),
    ],
  }, d.pol.p2_sub.replace('{year}', String(Y)));
  return { svg: s, rows: rows.map((r) => ({ panel: r.panel, sig: r.sig, th: r.th, s: r.s })), A, B };
}

export function p4(lang: Lang) {
  const d = t(lang);
  const rows = years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), enep: y.enep_mean, dalton: y.dalton_mean }));
  const s = svg({
    width: W, height: 340, marginLeft: 44,
    x: { label: d.common.enep, grid: true }, y: { label: `${d.common.dalton} (0–10)`, grid: true },
    marks: [
      Plot.line(rows.filter((r) => r.arena === d.common.general), { x: 'enep', y: 'dalton', stroke: C.axis, strokeWidth: 1 }),
      Plot.line(rows.filter((r) => r.arena === d.common.municipal), { x: 'enep', y: 'dalton', stroke: C.axis, strokeWidth: 1, strokeDasharray: '3 3' }),
      Plot.dot(rows, { x: 'enep', y: 'dalton', r: 4.5, stroke: C.ink, fill: (r: any) => (r.arena === d.common.general ? C.ink : C.paper), title: (r: any) => `${r.year} · ${r.arena}: ENEP ${num(lang, r.enep, 2)}, ${d.common.dalton} ${num(lang, r.dalton, 2)}` }),
      Plot.text(rows, { x: 'enep', y: 'dalton', text: (r: any) => String(r.year), dy: -10, fontSize: 9, fill: C.axis }),
    ],
  }, d.pol.p4_sub);
  return { svg: s, rows };
}

export function p5(lang: Lang) {
  const d = t(lang);
  const rows = counterfactual.dalton_fixed.map((r) => ({ year: r.year, arena: arenaName(lang, r.arena), act: r.dalton_actual, fix: r.dalton_fixed }));
  const s = svg({
    width: W, height: 300, marginLeft: 44,
    fx: fyArena(lang), x: xYear, y: { label: `${d.common.dalton} (0–10)`, grid: true },
    marks: [
      Plot.ruleX(rows, { fx: 'arena', x: 'year', y1: 'fix', y2: 'act', stroke: C.axis }),
      Plot.dot(rows, { fx: 'arena', x: 'year', y: 'fix', r: 3.5, fill: C.paper, stroke: C.ink, title: (r: any) => `${r.year} · ${d.pol.fixed}: ${num(lang, r.fix, 2)}` }),
      Plot.dot(rows, { fx: 'arena', x: 'year', y: 'act', r: 3.5, fill: C.ink, title: (r: any) => `${r.year} · ${d.pol.actual}: ${num(lang, r.act, 2)}` }),
    ],
  }, d.pol.p5_sub);
  return { svg: s, rows };
}

export function p6(lang: Lang) {
  const d = t(lang);
  const keys = [['dalton_mean', d.common.dalton, 2], ['er_mean', d.pol.er, 3], ['ss_mean', d.pol.ss, 3], ['range_mean', d.pol.range, 2], ['centrif_mean', d.pol.centrif, 3]] as const;
  // one panel per index, each with its own scale and real units (indices are not comparable in level)
  const panels = keys.map(([k, lab, dg]) => {
    const rows = years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), v: (y as any)[k] as number }));
    const vs = rows.map((r) => r.v), lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.15;
    return `<div class="panel-pequeno"><p class="panel-pequeno__titulo">${lab}</p>` + svg({
      width: 300, height: 170, marginLeft: 46, marginRight: 8, marginTop: 8, marginBottom: 24,
      x: { label: null, tickFormat: (v: number) => `’${String(v).slice(2)}`, ticks: 4 },
      y: { label: null, domain: [lo - pad, hi + pad], ticks: 3, grid: true, tickFormat: (v: number) => num(lang, v, dg) },
      marks: [
        Plot.line(rows.filter((r) => r.arena === d.common.general), { x: 'year', y: 'v', stroke: C.ink, strokeWidth: 1.6 }),
        Plot.line(rows.filter((r) => r.arena === d.common.municipal), { x: 'year', y: 'v', stroke: C.ink, strokeDasharray: '3 3' }),
        Plot.dot(rows, { x: 'year', y: 'v', r: 2.8, fill: (r: any) => (r.arena === d.common.general ? C.ink : C.paper), stroke: C.ink, title: (r: any) => `${lab} · ${r.year} · ${r.arena}: ${num(lang, r.v, 3)}` }),
      ],
    }, `${lab}: ${d.pol.p6_sub}`) + `</div>`;
  });
  return {
    svg: `<div class="paneles">${panels.join('')}</div>`,
    rows: years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), ...Object.fromEntries(keys.map(([k, lab]) => [lab, (y as any)[k]])) })),
    keys: keys.map(([k, lab]) => [k, lab] as const),
  };
}

export function p7(lang: Lang) {
  const d = t(lang);
  const rows = years.flatMap((y) => [
    { year: y.year, arena: arenaName(lang, y.arena), kind: d.common.enep, v: y.enep_mean },
    { year: y.year, arena: arenaName(lang, y.arena), kind: d.pol.enep_entropy, v: y.fragi_mean },
  ]);
  const s = svg({
    width: W, height: 280, marginLeft: 44, fx: fyArena(lang), x: xYear, y: { label: null, grid: true, domain: [0, 8] },
    marks: [
      Plot.line(rows, { fx: 'arena', x: 'year', y: 'v', z: 'kind', stroke: C.ink, strokeDasharray: (r: any) => (r.kind === d.common.enep ? null : '3 3') }),
      Plot.dot(rows, { fx: 'arena', x: 'year', y: 'v', r: 3, stroke: C.ink, fill: (r: any) => (r.kind === d.common.enep ? C.ink : C.paper), title: (r: any) => `${r.year} · ${r.kind}: ${num(lang, r.v, 2)}` }),
    ],
  }, d.pol.p7_sub);
  return { svg: s, rows: years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), enep: y.enep_mean, fragi: y.fragi_mean, maxp: y.maxprop_mean })) };
}

// ------------------------------------------------------------------ gender
export function g1(lang: Lang) {
  const d = t(lang);
  const rows = years.flatMap((y) => [
    { year: y.year, arena: arenaName(lang, y.arena), kind: d.gender.agg, v: y.fem_share_agg, imp: y.year === 1996 },
    { year: y.year, arena: arenaName(lang, y.arena), kind: d.gender.mean, v: y.fem_share_mean, imp: y.year === 1996 },
  ]);
  const s = svg({
    width: W, height: 300, marginLeft: 48, fx: fyArena(lang), x: xYear,
    y: { label: d.common.female_share, grid: true, tickFormat: (v: number) => pct(lang, v, 0), domain: [0, 0.3] },
    marks: [
      Plot.line(rows, { fx: 'arena', x: 'year', y: 'v', z: 'kind', stroke: C.ink, strokeDasharray: (r: any) => (r.kind === d.gender.agg ? null : '3 3') }),
      Plot.dot(rows, { fx: 'arena', x: 'year', y: 'v', r: 3.5, stroke: C.ink, fill: (r: any) => (r.kind === d.gender.agg ? C.ink : C.paper), title: (r: any) => `${r.year} · ${r.kind}: ${pct(lang, r.v)}${r.imp ? ` (${d.common.stamp_imputed})` : ''}` }),
    ],
  }, d.gender.g1_sub);
  return { svg: s, rows: years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), agg: y.fem_share_agg, mean: y.fem_share_mean, votes: y.fem_votes })) };
}

export function g2(lang: Lang) {
  const d = t(lang);
  const rows = years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), f: y.misF_agg, m: y.misM_agg }));
  const s = svg({
    width: W, height: 300, marginLeft: 48, fx: fyArena(lang), x: xYear,
    y: { label: d.common.mis, grid: true, tickFormat: (v: number) => score(lang, v, 1) },
    marks: [
      Plot.ruleY([0], { stroke: C.axis }),
      Plot.ruleX(rows, { fx: 'arena', x: 'year', y1: 'f', y2: 'm', stroke: C.axis }),
      Plot.dot(rows, { fx: 'arena', x: 'year', y: 'm', r: 4, fill: C.ink, title: (r: any) => `${r.year} · ${d.gender.men}: ${score(lang, r.m)}` }),
      Plot.dot(rows, { fx: 'arena', x: 'year', y: 'f', r: 4.5, fill: C.paper, stroke: C.ink, strokeWidth: 1.5, symbol: 'diamond', title: (r: any) => `${r.year} · ${d.gender.women}: ${score(lang, r.f)}` }),
    ],
  }, d.gender.g2_sub);
  return { svg: s, rows };
}

export function g3(lang: Lang) {
  const d = t(lang);
  const rows = years.map((y) => ({ year: y.year, arena: arenaName(lang, y.arena), gap: y.gap_mean }));
  const s = svg({
    width: W, height: 280, marginLeft: 48, fx: fyArena(lang), x: xYear,
    y: { label: d.common.gender_gap, grid: true, tickFormat: (v: number) => score(lang, v, 1) },
    marks: [
      Plot.rectY(rows, { fx: 'arena', x1: (r: any) => r.year - 1.4, x2: (r: any) => r.year + 1.4, y: 'gap', fill: C.hatch, stroke: C.ink, title: (r: any) => `${r.year} · ${r.arena}: ${score(lang, r.gap)}` }),
      Plot.ruleY([0], { stroke: C.ink }),
    ],
  }, d.gender.g3_sub);
  return { svg: s, rows };
}

export function g4(lang: Lang, year: number) {
  const d = t(lang);
  const pv = partyVotes.filter((p) => p.year === year);
  const tot = pv.reduce((s, p) => s + p.fem, 0);
  const rows = pv.filter((p) => p.fem / tot >= 0.01).map((p) => ({ sigla: p.sigla, theta: p.theta, share: p.fem / tot, fshare: p.fem / (p.fem + p.male), g: grupo(p.theta) }))
    .sort((a, b) => a.theta - b.theta);
  const s = svg({
    width: W, height: rows.length * 17 + 40, marginLeft: 110, marginRight: 50,
    y: { domain: rows.map((r) => r.sigla), label: null },
    x: { label: d.gender.g4_x, grid: true, tickFormat: (v: number) => pct(lang, v, 0) },
    marks: [
      Plot.barX(rows, { y: 'sigla', x: 'share', fill: (r: any) => grupoColor(r.g), stroke: C.ink, strokeWidth: 0.6, title: (r: any) => `${r.sigla} (θ ${score(lang, r.theta, 2)}): ${pct(lang, r.share)}` }),
      Plot.text(rows, { y: 'sigla', x: 'share', text: (r: any) => pct(lang, r.share), dx: 4, textAnchor: 'start', fill: C.ink, fontSize: 9 }),
      Plot.ruleX([0], { stroke: C.ink }),
    ],
  }, d.gender.g4_sub.replace('{year}', String(year)));
  return { svg: s, rows };
}

/** Gender gap by band of women's vote share: median and interquartile range, one panel per arena. */
export function g6(lang: Lang, yGen: number, yMun: number) {
  const d = t(lang);
  const fem = mapArr('fem'), gap = mapArr('gap'), fv = mapArr('fv');
  const edges = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 1];
  const q = (s: number[], p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  const rows: { arena: string; year: number; band: string; mid: number; n: number; med: number; q1: number; q3: number }[] = [];
  for (const [yy, ar] of [[yGen, d.common.general], [yMun, d.common.municipal]] as const) {
    const yi = fem.years.indexOf(yy);
    const pts = fem.v[yi].map((f, i) => ({ f, g: gap.v[yi][i], n: fv.v[yi][i] }))
      .filter((p) => p.f != null && p.g != null && (p.n ?? 0) >= 300).map((p) => ({ f: p.f! / fem.scale, g: p.g! / gap.scale }));
    edges.slice(0, -1).forEach((a, k) => {
      const b = edges[k + 1];
      const s = pts.filter((p) => p.f >= a && p.f < b).map((p) => p.g).sort((x, y) => x - y);
      if (s.length < 20) return;
      rows.push({ arena: ar, year: yy, band: b === 1 ? `≥ ${pct(lang, a, 0)}` : `${pct(lang, a, 0)}–${pct(lang, b, 0)}`, mid: b === 1 ? a + 0.025 : (a + b) / 2, n: s.length, med: q(s, 0.5), q1: q(s, 0.25), q3: q(s, 0.75) });
    });
  }
  const s = svg({
    width: W, height: 300, marginLeft: 52, marginBottom: 36,
    fx: { label: null, domain: [d.common.general, d.common.municipal] },
    x: { label: d.common.female_share, tickFormat: (v: number) => pct(lang, v, 0), domain: [0, 0.35] },
    y: { label: d.common.gender_gap, grid: true, tickFormat: (v: number) => score(lang, v, 1) },
    marks: [
      Plot.ruleY([0], { stroke: C.ink, strokeDasharray: '3 3' }),
      Plot.areaY(rows, { fx: 'arena', x: 'mid', y1: 'q1', y2: 'q3', fill: C.grid, fillOpacity: 0.9 }),
      Plot.line(rows, { fx: 'arena', x: 'mid', y: 'med', stroke: C.ink, strokeWidth: 2 }),
      Plot.dot(rows, { fx: 'arena', x: 'mid', y: 'med', r: 4, fill: C.ink, title: (r: any) => `${r.year} · ${r.band}: ${score(lang, r.med)} (${r.n})` }),
    ],
  }, d.gender.g6_sub);
  const genRows = rows.filter((r) => r.arena === d.common.general);
  const widest = genRows.reduce((a, b) => (b.med < a.med ? b : a));
  const lastBand = genRows[genRows.length - 1];
  return { svg: s, rows, widest, lastBand };
}

// ------------------------------------------------------------------ methodology
export function placements(lang: Lang, year: number) {
  const d = t(lang);
  const rows = parties.filter((p) => p.year === year).sort((a, b) => a.theta - b.theta);
  const s = svg({
    width: W, height: Math.max(260, rows.length * 16 + 50), marginLeft: 110,
    x: { domain: [-1.05, 1.05], label: `${d.common.left} ← θ → ${d.common.right}`, grid: true, tickFormat: (v: number) => score(lang, v, 1) },
    y: { domain: rows.map((r) => r.sigla), label: null },
    marks: [
      Plot.ruleX([0], { stroke: C.axis }),
      Plot.ruleY(rows, { y: 'sigla', x1: (r: any) => r.theta - r.se, x2: (r: any) => r.theta + r.se, stroke: C.axis }),
      Plot.dot(rows, { y: 'sigla', x: 'theta', r: 4.5, stroke: (r: any) => (r.theta < 0 ? C.leftStrong : C.rightStrong), fill: (r: any) => (r.imputed ? C.paper : r.theta < 0 ? C.leftStrong : C.rightStrong), title: (r: any) => `${r.sigla} (${r.num}): ${score(lang, r.theta)} ± ${num(lang, r.se, 3)}${r.imputed ? ` · ${d.common.stamp_imputed}` : ''}` }),
    ],
  }, d.method.s2_fig_sub.replace('{year}', String(year)));
  return { svg: s, rows };
}

export function moranFig(lang: Lang) {
  const d = t(lang);
  const rows = moran.map((m) => ({ year: m.year, arena: arenaName(lang, m.arena), I: m.I, HH: m.HH_fdr, LL: m.LL_fdr }));
  const s = svg({
    width: W, height: 240, marginLeft: 44, fx: fyArena(lang), x: xYear, y: { label: d.map.moran, grid: true, domain: [0, 0.6] },
    marks: [
      Plot.line(rows, { fx: 'arena', x: 'year', y: 'I', stroke: C.ink }),
      Plot.dot(rows, { fx: 'arena', x: 'year', y: 'I', r: 3.5, fill: C.ink, title: (r: any) => `${r.year} · ${r.arena}: I = ${num(lang, r.I, 3)}` }),
    ],
  }, d.map.moran);
  return { svg: s, rows };
}
