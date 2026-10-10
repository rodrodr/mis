// Profile island: draws the six charts of a municipality from its JSON.
import { lines, divergingRows, ideoBars, TRAMA_ID, type Series } from './mini';
import { grupo, grupoColor, limites, GRUPOS } from '../lib/grupos';
import { navegar } from '../../../kit/figura/navegar.js';

const root = document.querySelector<HTMLElement>('[data-perfil]');
if (root) draw(root);

async function draw(root: HTMLElement) {
  const L = JSON.parse(root.dataset.labels!) as Record<string, string>;
  const lang = root.dataset.lang!;
  const loc = lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es-ES' : 'en-GB';
  const f = (v: number | null | undefined, dgt = 3, sign = true) =>
    v == null ? '—' : new Intl.NumberFormat(loc, { minimumFractionDigits: dgt, maximumFractionDigits: dgt, signDisplay: sign ? 'exceptZero' : 'auto' }).format(v).replace('-', '−');
  const pc = (v: number) => new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 1 }).format(v);
  const slot = (id: string) => root.querySelector<HTMLElement>(`[data-figura-cliente="${id}"] [data-grafico]`)!;
  const legend = (id: string, items: [string, string, string?][]) => {
    const el = root.querySelector<HTMLElement>(`[data-figura-cliente="${id}"] [data-leyenda]`)!;
    el.innerHTML = items.map(([sw, txt, dash]) =>
      `<span><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="${sw}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/></svg> ${txt}</span>`).join('');
  };
  let P: any, parties: Record<string, Record<string, [string, number, number]>>;
  try {
    [P, parties] = await Promise.all([fetch(root.dataset.src!).then((r) => r.json()), fetch(root.dataset.parties!).then((r) => r.json())]);
  } catch {
    root.querySelectorAll('[data-grafico]').forEach((el) => (el.textContent = L.error));
    return;
  }
  const ys: number[] = P.y, S = P.s;
  const gen = (y: number) => (y - 1994) % 4 === 0;
  const last = Math.max(...ys);
  const tag = (y: number) => `${y}${y === 2026 ? ` (${L.provisional})` : ''}`;
  const state = new Map<number, number>(JSON.parse(root.dataset.state!));
  const brazil = new Map<number, number>(JSON.parse(root.dataset.brazil!));
  const allY = [...new Set([...ys, ...brazil.keys()])].sort();

  // 1 trajectory: one arena at a time (filter), three lines labelled at their ends, no legend lookup
  const traj = (arena: 'general' | 'municipal') => {
    const inArena = (y: number) => (arena === 'general' ? gen(y) : !gen(y));
    const xs = allY.filter(inArena);
    const own = xs.map((y) => { const i = ys.indexOf(y); return i < 0 ? null : S.ideo[i]; });
    const st = xs.map((y) => state.get(y) ?? null), br = xs.map((y) => brazil.get(y) ?? null);
    const series: Series[] = [
      { name: L.brazil, dash: '1 3', width: 1.6, color: 'var(--color-fig-axis)', marks: false, pts: xs.map((y, k) => ({ x: y, y: br[k], label: `${tag(y)} · ${L.brazil}: ${f(br[k])}` })) },
      { name: L.state, dash: '6 3', width: 1.6, color: 'var(--color-fig-axis)', marks: false, pts: xs.map((y, k) => ({ x: y, y: st[k], label: `${tag(y)} · ${L.state}: ${f(st[k])}` })) },
      { name: P.n, width: 2.8, pts: xs.map((y, k) => ({ x: y, y: own[k], label: `${tag(y)} · ${P.n}: ${f(own[k])}` })) },
    ];
    const vals = [...own, ...st, ...br].filter((v): v is number => v != null);
    const lo = Math.min(-0.1, Math.floor(Math.min(...vals) * 10) / 10), hi = Math.max(0.3, Math.ceil(Math.max(...vals) * 10) / 10);
    let svg = lines(series, { xs, ymin: lo, ymax: hi, yfmt: (v) => f(v, 1), zero: true, label: root.querySelector('#f-trayectoria-t')!.textContent!, w: 640, h: 260 });
    // direct labels at the right end of each line (spread to avoid overlaps)
    const W = 640, H = 260, ml = 52, mr = 14, mt = 12, mb = 26;
    const Yp = (v: number) => mt + (1 - (v - lo) / (hi - lo || 1)) * (H - mt - mb);
    const ends = series.map((s) => { const p = [...s.pts].reverse().find((q) => q.y != null); return p ? { name: s.name, y: Yp(p.y as number) } : null; }).filter(Boolean) as { name: string; y: number }[];
    ends.sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 12) ends[k].y = ends[k - 1].y + 12;
    const lab = ends.map((e) => `<text x="${W - mr + 4}" y="${(e.y + 3).toFixed(1)}" font-size="10" fill="var(--color-fig-ink)" aria-hidden="true">${e.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`).join('');
    svg = svg.replace('<svg viewBox="0 0 640 260"', '<svg viewBox="0 0 780 260"').replace('</svg>', `${lab}</svg>`);
    slot('trayectoria').innerHTML = svg;
    navegar(slot('trayectoria'));
  };
  const filtro = root.querySelector<HTMLElement>('[data-arena-filtro]');
  filtro?.querySelectorAll<HTMLButtonElement>('[data-arena]').forEach((b) => b.addEventListener('click', () => {
    filtro.querySelectorAll('[data-arena]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    traj(b.dataset.arena as 'general' | 'municipal');
  }));
  traj('general');
  legend('trayectoria', [['var(--color-fig-ink)', P.n], ['var(--color-fig-axis)', L.state, '6 3'], ['var(--color-fig-axis)', L.brazil, '1 3']]);

  // 2 party vote in one election: bars at each party's position, coloured by ideological group
  const gAbbr = L.gabbr.split('|'), gNames = L.gnames.split('|');
  const partidos = (y: number) => {
    const i = ys.indexOf(y);
    const tab = parties[String(y)] ?? {};
    const bars = (P.p as [number, number, number][]).filter((r) => r[0] === y && r[2] > 0).map((r) => {
      const sig = tab[String(r[1])]?.[0] ?? String(r[1]);
      const th = tab[String(r[1])]?.[1] ?? 0;
      const g = grupo(th);
      return { theta: th, share: r[2], short: sig, fill: grupoColor(g), label: `${tag(y)} · ${sig} (${gAbbr[GRUPOS.indexOf(g)]}, θ ${f(th, 2)}): ${pc(r[2])}` };
    });
    const mis = i < 0 ? null : S.ideo[i];
    slot('partidos').innerHTML = ideoBars(bars, {
      mis, misLabel: `${L.mis} ${f(mis)}`, label: root.querySelector('#f-partidos-t')!.textContent!,
      yfmt: (v) => pc(v), xfmt: (v) => (v === -1 ? `−1 ${L.left}` : v === 1 ? `${L.right} +1` : f(v, 1)), bands: limites.slice(1),
    });
    root.querySelector('#f-partidos-t')!.textContent = (root.dataset.titlePartidos ?? '').replace('{year}', String(y));
    navegar(slot('partidos'));
  };
  const rail = root.querySelector<HTMLElement>('[data-anos-partidos]');
  rail?.querySelectorAll<HTMLButtonElement>('[data-ano]').forEach((b) => b.addEventListener('click', () => {
    rail.querySelectorAll('[data-ano]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    partidos(Number(b.dataset.ano));
  }));
  partidos(last);
  const lgp = root.querySelector<HTMLElement>('[data-figura-cliente="partidos"] [data-leyenda]')!;
  lgp.innerHTML = `<span class="mono caps">${L.group_title.split('(')[0].trim()}:</span>` + GRUPOS.map((g, k) => `<span title="${gNames[k]}"><span class="leyenda__muestra" style="background:${grupoColor(g)};outline:1px solid var(--color-fig-ink)"></span>${gAbbr[k]}</span>`).join('') + `<span><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--color-fig-ink)" stroke-width="2" stroke-dasharray="5 3"/></svg> ${L.mis}</span>`;

  // 3 executives in office vs legislative MIS
  slot('ejecutivos').innerHTML = lines([
    { name: L.mis, pts: ys.map((y, i) => ({ x: y, y: S.ideo[i], label: `${tag(y)} · ${L.mis}: ${f(S.ideo[i])}`, hollow: !gen(y) })), width: 2 },
    { name: L.mayor, marks: true, dash: '0 1', width: 0, color: 'var(--color-fig-axis)', pts: ys.map((y, i) => ({ x: y, y: S.ideopref[i], label: `${tag(y)} · ${L.mayor}: ${f(S.ideopref[i])}` })) },
    { name: L.governor, marks: true, dash: '0 1', width: 0, color: 'var(--color-fig-axis)', pts: ys.map((y, i) => ({ x: y, y: S.ideogov[i], label: `${tag(y)} · ${L.governor}: ${f(S.ideogov[i])}`, hollow: true })) },
  ], { xs: ys, ymin: -1, ymax: 1, yfmt: (v) => f(v, 1), zero: true, label: root.querySelector('#f-ejecutivos-t')!.textContent! });
  legend('ejecutivos', [['var(--color-fig-ink)', L.mis], ['var(--color-fig-axis)', `● ${L.mayor}`, '0 1'], ['var(--color-fig-axis)', `○ ${L.governor}`, '0 1']]);

  // 4 party system
  const dal = ys.map((y, i) => ({ x: y, y: S.dalton[i] == null ? null : S.dalton[i] * 10, label: `${tag(y)} · ${L.dalton}: ${f(S.dalton[i] == null ? null : S.dalton[i] * 10, 1, false)}`, hollow: !gen(y) }));
  const enp = ys.map((y, i) => ({ x: y, y: S.enep[i], label: `${tag(y)} · ${L.enep}: ${f(S.enep[i], 1, false)}`, hollow: !gen(y) }));
  slot('sistema').innerHTML = lines([{ name: L.dalton, pts: dal }, { name: L.enep, pts: enp, dash: '4 3', color: 'var(--color-fig-axis)' }],
    { xs: ys, ymin: 0, ymax: Math.max(10, ...(S.enep.filter((x: number | null) => x != null) as number[])), yfmt: (v) => f(v, 0, false), label: root.querySelector('#f-sistema-t')!.textContent! });
  legend('sistema', [['var(--color-fig-ink)', `${L.dalton} (0–10)`], ['var(--color-fig-axis)', L.enep, '4 3']]);

  // 5 gender
  slot('genero').innerHTML = lines([
    { name: L.misF, color: 'var(--color-fig-ink)', pts: ys.map((y, i) => ({ x: y, y: S.misF[i], label: `${tag(y)} · ${L.misF}: ${f(S.misF[i])} · ${L.female}: ${S.fem[i] == null ? '—' : pc(S.fem[i])}`, hollow: S.fv[i] != null && S.fv[i] < 300 })) },
    { name: L.misM, color: 'var(--color-fig-axis)', dash: '4 3', pts: ys.map((y, i) => ({ x: y, y: S.misM[i], label: `${tag(y)} · ${L.misM}: ${f(S.misM[i])}` })) },
  ], { xs: ys, ymin: -1, ymax: 1, yfmt: (v) => f(v, 1), zero: true, label: root.querySelector('#f-genero-t')!.textContent! });
  legend('genero', [['var(--color-fig-ink)', L.misF], ['var(--color-fig-axis)', L.misM, '4 3']]);

  // 6 counterfactual
  const ss = P.ss as [number, number, number, number][];
  const fills = ['var(--color-fig-vote)', 'var(--color-fig-place)', `url(#${TRAMA_ID})`];
  const terms = [L.vote, L.place, L.entry];
  const lim = Math.max(0.1, ...ss.flatMap((r) => [Math.abs(r[1]) + Math.abs(r[2]) + Math.abs(r[3])]));
  slot('contrafactual').innerHTML = ss.length ? divergingRows(ss.map((r) => ({
    key: `${r[0] - 4}→${r[0]}`, total: r[1] + r[2] + r[3], totalLabel: `${tag(r[0])} · Δ ${L.mis}: ${f(r[1] + r[2] + r[3])}`,
    parts: [1, 2, 3].map((k) => ({ v: r[k], fill: fills[k - 1], label: `${tag(r[0])} · ${terms[k - 1]}: ${f(r[k])}` })),
  })), { lim: Math.ceil(lim * 10) / 10, fmt: (v) => f(v, 1), label: root.querySelector('#f-contrafactual-t')!.textContent! }) : '';
  const lg = root.querySelector<HTMLElement>('[data-figura-cliente="contrafactual"] [data-leyenda]')!;
  const swatch = ['var(--color-fig-vote)', 'var(--color-fig-place)', 'repeating-linear-gradient(45deg, var(--color-fig-vote) 0 2px, var(--color-bg-raised) 2px 5px)'];
  lg.innerHTML = terms.map((t, i) => `<span><span class="leyenda__muestra" style="background:${swatch[i]};outline:1px solid var(--color-fig-ink)"></span>${t}</span>`).join('');

  ['ejecutivos', 'sistema', 'genero', 'contrafactual'].forEach((id) => navegar(slot(id)));
  void last;
}
