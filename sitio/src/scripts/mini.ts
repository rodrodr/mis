// Small hand-rolled SVG charts for client islands (profile, comparator). No Plot on the client.
// Every mark with data carries data-punto + role="img" + aria-label, so kit/figura/navegar.js
// gives one tab stop and arrow-key navigation; tables carry the same values.

export interface Pt { x: number; y: number | null; label: string; hollow?: boolean }
export interface Series { name: string; pts: Pt[]; dash?: string; width?: number; color?: string; marks?: boolean }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function lines(series: Series[], o: {
  w?: number; h?: number; ymin: number; ymax: number; xs: number[]; yfmt: (v: number) => string;
  zero?: boolean; label: string; yticks?: number[];
}) {
  const W = o.w ?? 640, H = o.h ?? 240, ml = 52, mr = 14, mt = 12, mb = 26;
  const x0 = Math.min(...o.xs), x1 = Math.max(...o.xs);
  const X = (x: number) => ml + ((x - x0) / (x1 - x0 || 1)) * (W - ml - mr);
  const Y = (y: number) => mt + (1 - (y - o.ymin) / (o.ymax - o.ymin || 1)) * (H - mt - mb);
  const span = o.ymax - o.ymin;
  const step = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].find((s) => span / s <= 6) ?? span / 4;
  const ticks = o.yticks ?? Array.from({ length: Math.floor(span / step + 1e-9) + 1 }, (_, i) => Math.ceil(o.ymin / step - 1e-9) * step + i * step).filter((v) => v <= o.ymax + 1e-9);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(o.label)}" font-size="10">`;
  s += `<g aria-hidden="true">`;
  for (const t of ticks) s += `<line x1="${ml}" x2="${W - mr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--color-fig-grid)"/><text x="${ml - 6}" y="${Y(t) + 3}" text-anchor="end" fill="var(--color-fig-axis)">${esc(o.yfmt(t))}</text>`;
  if (o.zero && o.ymin < 0 && o.ymax > 0) s += `<line x1="${ml}" x2="${W - mr}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--color-fig-axis)" stroke-dasharray="2 2"/>`;
  for (const x of o.xs.length <= 9 ? o.xs : o.xs.filter((x) => (x - 1994) % 8 === 0 || x === x1)) s += `<text x="${X(x)}" y="${H - 8}" text-anchor="middle" fill="var(--color-fig-axis)">${x}</text>`;
  s += `</g>`;
  for (const se of series) {
    const col = se.color ?? 'var(--color-fig-ink)';
    let d = '', pen = false;
    for (const p of se.pts) {
      if (p.y == null) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`; pen = true;
    }
    s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${se.width ?? 1.8}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''} aria-hidden="true"/>`;
    if (se.marks !== false) for (const p of se.pts) if (p.y != null) {
      s += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4" fill="${p.hollow ? 'var(--color-bg-raised)' : col}" stroke="${col}" stroke-width="1.5" data-punto role="img" aria-label="${esc(p.label)}"/>`;
    }
  }
  return s + `</svg>`;
}

/** Diverging colour for a party score (hue = ideology), via token mixing. */
export function scoreFill(theta: number) {
  const t = Math.max(-1, Math.min(1, theta / 0.9));
  const tok = t < 0 ? 'var(--color-ideo-left-strong)' : 'var(--color-ideo-right-strong)';
  return `color-mix(in oklab, ${tok} ${Math.round(Math.abs(t) * 100)}%, var(--color-ideo-center))`;
}

export interface Seg { v: number; fill: string; label: string; text?: string }
/** One stacked 100% bar per row (party shares ordered left → right). */
export function stackRows(rows: { key: string; segs: Seg[] }[], o: { w?: number; label: string }) {
  const W = o.w ?? 640, rh = 22, ml = 44, mr = 8, H = rows.length * rh + 10;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(o.label)}" font-size="9">`;
  rows.forEach((r, i) => {
    const y = 4 + i * rh;
    s += `<text x="${ml - 6}" y="${y + 14}" text-anchor="end" fill="var(--color-fig-axis)" aria-hidden="true">${esc(r.key)}</text>`;
    let x = ml;
    for (const g of r.segs) {
      const w = g.v * (W - ml - mr);
      s += `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(0, w - 0.6).toFixed(1)}" height="${rh - 4}" fill="${g.fill}" stroke="var(--color-fig-stroke)" stroke-width="0.5" data-punto role="img" aria-label="${esc(g.label)}"/>`;
      if (g.text && w > 34) s += `<text x="${(x + w / 2).toFixed(1)}" y="${y + 12}" text-anchor="middle" fill="var(--color-fig-ink)" aria-hidden="true" style="paint-order:stroke;stroke:var(--color-bg-raised);stroke-width:2px">${esc(g.text)}</text>`;
      x += w;
    }
  });
  return s + `</svg>`;
}

/** Diverging stacked bars (counterfactual terms) with a total tick. */
export function divergingRows(rows: { key: string; parts: Seg[]; total: number; totalLabel: string }[], o: { w?: number; lim: number; label: string; fmt: (v: number) => string }) {
  const W = o.w ?? 640, rh = 22, ml = 70, mr = 10, H = rows.length * rh + 26;
  const X = (v: number) => ml + ((v + o.lim) / (2 * o.lim)) * (W - ml - mr);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(o.label)}" font-size="9">${tramaDefs}`;
  s += `<g aria-hidden="true"><line x1="${X(0)}" x2="${X(0)}" y1="0" y2="${H - 18}" stroke="var(--color-fig-ink)"/>`;
  for (const t of [-o.lim, -o.lim / 2, o.lim / 2, o.lim]) s += `<text x="${X(t)}" y="${H - 6}" text-anchor="middle" fill="var(--color-fig-axis)">${esc(o.fmt(t))}</text>`;
  s += `</g>`;
  rows.forEach((r, i) => {
    const y = 2 + i * rh;
    s += `<text x="${ml - 6}" y="${y + 13}" text-anchor="end" fill="var(--color-fig-axis)" aria-hidden="true">${esc(r.key)}</text>`;
    let pos = 0, neg = 0;
    for (const p of r.parts) {
      const a = p.v >= 0 ? pos : neg + p.v, b = p.v >= 0 ? pos + p.v : neg;
      if (p.v >= 0) pos += p.v; else neg += p.v;
      s += `<rect x="${X(Math.max(-o.lim, a)).toFixed(1)}" y="${y + 2}" width="${Math.max(0, X(Math.min(o.lim, b)) - X(Math.max(-o.lim, a))).toFixed(1)}" height="${rh - 6}" fill="${p.fill}" data-punto role="img" aria-label="${esc(p.label)}"/>`;
    }
    s += `<line x1="${X(Math.max(-o.lim, Math.min(o.lim, r.total)))}" x2="${X(Math.max(-o.lim, Math.min(o.lim, r.total)))}" y1="${y}" y2="${y + rh - 2}" stroke="var(--color-fig-ink)" stroke-width="2.5" data-punto role="img" aria-label="${esc(r.totalLabel)}"/>`;
  });
  return s + `</svg>`;
}

/**
 * Place labels as close as possible to their targets without overlapping: overlapping labels are
 * merged into clusters centred on the mean of their targets (minimum total displacement), until
 * no two clusters overlap; then the whole set is kept inside [lo, hi].
 */
export function placeLabels(items: { key: string; y: number }[], gap: number, lo: number, hi: number) {
  type C = { keys: string[]; ys: number[]; top: number };
  let cs: C[] = [...items].sort((a, b) => a.y - b.y).map((it) => ({ keys: [it.key], ys: [it.y], top: it.y }));
  const centre = (c: C) => c.ys.reduce((a, b) => a + b, 0) / c.ys.length - ((c.ys.length - 1) * gap) / 2;
  let moved = true;
  while (moved) {
    moved = false;
    for (let i = 1; i < cs.length; i++) {
      const a = cs[i - 1], b = cs[i];
      if (a.top + a.keys.length * gap > b.top) {
        const m: C = { keys: [...a.keys, ...b.keys], ys: [...a.ys, ...b.ys], top: 0 };
        m.top = centre(m);
        cs.splice(i - 1, 2, m);
        moved = true;
        break;
      }
    }
  }
  const out = new Map<string, number>();
  for (const c of cs) c.keys.forEach((k, j) => out.set(k, c.top + j * gap));
  const vals = [...out.values()];
  const shift = Math.min(0, hi - Math.max(...vals)) + Math.max(0, lo - Math.min(...vals));
  if (shift) for (const [k, v] of out) out.set(k, v + shift);
  return out;
}

/**
 * Slope chart between two years. Labels carry only the unit's name and sit beside their point
 * (a thin leader line joins them when they had to move); values appear on hover / focus.
 * Each unit is a <g data-key> so the page can highlight one and grey out the rest.
 */
export function slope(rows: { key: string; name: string; a: number | null; b: number | null }[], o: {
  ya: string; yb: string; label: string; fmt: (v: number) => string; w?: number; h?: number;
}) {
  const W = o.w ?? 720, H = o.h ?? 520, mt = 26, mb = 14, x0 = 200, x1 = W - 200, gap = 14.5, lead = 48;
  const ok = rows.filter((r) => r.a != null && r.b != null) as { key: string; name: string; a: number; b: number }[];
  const vals = ok.flatMap((r) => [r.a, r.b]);
  const lo = Math.floor(Math.min(...vals, 0) * 10) / 10, hi = Math.ceil(Math.max(...vals) * 10) / 10;
  const Y = (v: number) => mt + (1 - (v - lo) / (hi - lo || 1)) * (H - mt - mb);
  const la = placeLabels(ok.map((r) => ({ key: r.key, y: Y(r.a) })), gap, mt + 8, H - 6);
  const lb = placeLabels(ok.map((r) => ({ key: r.key, y: Y(r.b) })), gap, mt + 8, H - 6);
  let s = `<svg class="pendiente" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="${esc(o.label)}" font-size="13.5">`;
  s += `<g aria-hidden="true"><text x="${x0}" y="16" text-anchor="middle" font-weight="700" fill="var(--color-fig-ink)">${esc(o.ya)}</text><text x="${x1}" y="16" text-anchor="middle" font-weight="700" fill="var(--color-fig-ink)">${esc(o.yb)}</text>`;
  s += `<line x1="${x0}" x2="${x0}" y1="${mt}" y2="${H - mb}" stroke="var(--color-fig-grid)"/><line x1="${x1}" x2="${x1}" y1="${mt}" y2="${H - mb}" stroke="var(--color-fig-grid)"/>`;
  if (lo < 0 && hi > 0) s += `<line x1="${x0}" x2="${x1}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--color-fig-axis)" stroke-dasharray="2 3"/><text x="${(x0 + x1) / 2}" y="${Y(0) - 4}" text-anchor="middle" fill="var(--color-fig-axis)">0</text>`;
  s += `</g>`;
  for (const r of ok) {
    const up = r.b > r.a;
    const ya = Y(r.a), yb = Y(r.b), ta = la.get(r.key)!, tb = lb.get(r.key)!;
    s += `<g class="pendiente__u" data-key="${esc(r.key)}">`;
    s += `<line class="pendiente__hit" x1="${x0}" y1="${ya.toFixed(1)}" x2="${x1}" y2="${yb.toFixed(1)}" stroke="transparent" stroke-width="12" aria-hidden="true"/>`;
    s += `<line class="pendiente__linea" x1="${x0}" y1="${ya.toFixed(1)}" x2="${x1}" y2="${yb.toFixed(1)}" stroke="var(--color-fig-ink)" stroke-opacity="0.6" stroke-width="1.4" aria-hidden="true"/>`;
    // leader lines: point → label (straight when the label sits at the point's height)
    s += `<path class="pendiente__guia" d="M${x0 - 5},${ya.toFixed(1)} L${x0 - lead + 8},${ta.toFixed(1)} L${x0 - lead},${ta.toFixed(1)}" fill="none" stroke="var(--color-fig-muted)" stroke-width="0.9" aria-hidden="true"/>`;
    s += `<path class="pendiente__guia" d="M${x1 + 5},${yb.toFixed(1)} L${x1 + lead - 8},${tb.toFixed(1)} L${x1 + lead},${tb.toFixed(1)}" fill="none" stroke="var(--color-fig-muted)" stroke-width="0.9" aria-hidden="true"/>`;
    s += `<circle class="pendiente__a" cx="${x0}" cy="${ya.toFixed(1)}" r="3.5" fill="var(--color-fig-ink)" aria-hidden="true"/>`;
    s += `<circle class="pendiente__b" cx="${x1}" cy="${yb.toFixed(1)}" r="4" fill="${up ? 'var(--color-fig-ink)' : 'var(--color-bg-raised)'}" stroke="var(--color-fig-ink)" stroke-width="1.4" data-punto role="img" aria-label="${esc(`${r.name}: ${o.fmt(r.a)} → ${o.fmt(r.b)} (Δ ${o.fmt(r.b - r.a)})`)}"/>`;
    s += `<text class="pendiente__t" x="${x0 - lead - 4}" y="${(ta + 5).toFixed(1)}" text-anchor="end" fill="var(--color-fig-ink)" aria-hidden="true">${esc(r.key)}</text>`;
    s += `<text class="pendiente__t" x="${x1 + lead + 4}" y="${(tb + 5).toFixed(1)}" fill="var(--color-fig-ink)" aria-hidden="true">${esc(r.key)}</text>`;
    // values, shown only for the highlighted unit (inside the chart, next to each point)
    s += `<text class="pendiente__v" x="${x0 + 10}" y="${(ya + 5).toFixed(1)}" font-weight="700" fill="var(--color-fig-ink)" aria-hidden="true">${esc(o.fmt(r.a))}</text>`;
    s += `<text class="pendiente__v" x="${x1 - 10}" y="${(yb + 5).toFixed(1)}" text-anchor="end" font-weight="700" fill="var(--color-fig-ink)" aria-hidden="true">${esc(o.fmt(r.b))}</text>`;
    s += `</g>`;
  }
  return s + `</svg>`;
}

/** Hatched fill used for "parties entering and leaving" (visible in both themes, not a hue). */
export const TRAMA_ID = 'trama-entrada';
export const tramaDefs = `<defs><pattern id="${TRAMA_ID}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--color-bg-raised)"/><line x1="0" y1="0" x2="0" y2="5" stroke="var(--color-fig-vote)" stroke-width="2"/></pattern></defs>`;

export interface Bar { theta: number; share: number; label: string; short: string; fill: string }
/**
 * Vote share (y) of each party at its ideological position (x, −1…+1). Parties closer than one
 * bar width are stacked so none hides another. A dashed line marks the centre of gravity (MIS).
 */
export function ideoBars(bars: Bar[], o: {
  mis: number | null; misLabel: string; label: string; yfmt: (v: number) => string; xfmt: (v: number) => string;
  bands?: number[]; w?: number; h?: number; ymax?: number;
}) {
  const W = o.w ?? 640, H = o.h ?? 300, ml = 44, mr = 12, mt = 28, mb = 30;
  const X = (v: number) => ml + ((v + 1) / 2) * (W - ml - mr);
  const bw = 0.045; // bar width in scale units
  const sorted = [...bars].sort((a, b) => a.theta - b.theta);
  const stacks: { theta: number; items: Bar[] }[] = [];
  for (const b of sorted) {
    const last = stacks[stacks.length - 1];
    if (last && Math.abs(b.theta - last.theta) < bw) last.items.push(b);
    else stacks.push({ theta: b.theta, items: [b] });
  }
  const top = o.ymax ?? Math.max(0.1, ...stacks.map((s) => s.items.reduce((a, b) => a + b.share, 0)));
  const ymax = Math.ceil(top * 10) / 10;
  const Y = (v: number) => mt + (1 - v / ymax) * (H - mt - mb);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(o.label)}" font-size="10">`;
  s += `<g aria-hidden="true">`;
  for (const b of o.bands ?? []) s += `<line x1="${X(b)}" x2="${X(b)}" y1="${mt}" y2="${H - mb}" stroke="var(--color-fig-grid)"/>`;
  for (let v = 0; v <= ymax + 1e-9; v += ymax > 0.5 ? 0.2 : 0.1) s += `<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--color-fig-grid)" stroke-dasharray="1 3"/><text x="${ml - 6}" y="${Y(v) + 3}" text-anchor="end" fill="var(--color-fig-axis)">${esc(o.yfmt(v))}</text>`;
  s += `<line x1="${ml}" x2="${W - mr}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--color-fig-ink)"/>`;
  for (const v of [-1, -0.5, 0, 0.5, 1]) s += `<text x="${X(v)}" y="${H - 12}" text-anchor="middle" fill="var(--color-fig-axis)">${esc(o.xfmt(v))}</text>`;
  s += `</g>`;
  let lastLab: { x2: number; y: number } | null = null;
  for (const st of stacks) {
    let base = 0;
    const cx = X(st.items.reduce((a, b) => a + b.theta, 0) / st.items.length);
    const half = Math.max(4, ((W - ml - mr) * bw) / 4);
    for (const b of st.items) {
      const y0 = Y(base), y1 = Y(base + b.share);
      s += `<rect x="${(cx - half).toFixed(1)}" y="${y1.toFixed(1)}" width="${(2 * half).toFixed(1)}" height="${Math.max(0.5, y0 - y1).toFixed(1)}" fill="${b.fill}" stroke="var(--color-fig-ink)" stroke-width="0.7" data-punto role="img" aria-label="${esc(b.label)}"/>`;
      if (st.items.length > 1 && y0 - y1 >= 11) s += `<text x="${cx}" y="${((y0 + y1) / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="var(--color-fig-ink)" aria-hidden="true" style="paint-order:stroke;stroke:var(--color-bg-raised);stroke-width:2.5px">${esc(b.short)}</text>`;
      base += b.share;
    }
    // one party: label above the bar (raised a line when the previous label is too close);
    // stacked parties are labelled inside their segments
    if (st.items.length === 1 && base >= 0.01) {
      let ly = Y(base) - 4;
      const w = st.items[0].short.length * 5.6;
      if (lastLab && cx - w / 2 < lastLab.x2 && Math.abs(ly - lastLab.y) < 11) ly = lastLab.y - 11;
      s += `<text x="${cx}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--color-fig-ink)" aria-hidden="true">${esc(st.items[0].short)}</text>`;
      lastLab = { x2: cx + w / 2, y: ly };
    }
  }
  if (o.mis != null) {
    s += `<line x1="${X(o.mis)}" x2="${X(o.mis)}" y1="${mt - 14}" y2="${H - mb}" stroke="var(--color-fig-ink)" stroke-width="1.6" stroke-dasharray="5 3" data-punto role="img" aria-label="${esc(o.misLabel)}"/>`;
    const anchor = o.mis > 0.6 ? 'end' : o.mis < -0.6 ? 'start' : 'middle';
    s += `<text x="${X(o.mis)}" y="${mt - 17}" text-anchor="${anchor}" font-weight="700" fill="var(--color-fig-ink)" aria-hidden="true">${esc(o.misLabel)}</text>`;
  }
  return s + `</svg>`;
}

export interface Placement { sigla: string; num: number; theta: number; se: number; imputed: boolean; fill: string; label: string }
/** Party placements: one row per party (left to right), dot ± 1 SE, hollow when imputed. */
export function placements(rows: Placement[], o: { label: string; xfmt: (v: number) => string; bands?: number[]; w?: number }) {
  const W = o.w ?? 560, rh = 14, mt = 8, mb = 26, ml = 96, mr = 14, H = mt + mb + rows.length * rh;
  const X = (v: number) => ml + ((v + 1.05) / 2.1) * (W - ml - mr);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="${esc(o.label)}" font-size="9.5">`;
  s += `<g aria-hidden="true">`;
  for (const b of o.bands ?? []) s += `<line x1="${X(b)}" x2="${X(b)}" y1="${mt}" y2="${H - mb}" stroke="var(--color-fig-grid)"/>`;
  s += `<line x1="${X(0)}" x2="${X(0)}" y1="${mt}" y2="${H - mb}" stroke="var(--color-fig-axis)" stroke-dasharray="2 3"/>`;
  for (const v of [-1, -0.5, 0, 0.5, 1]) s += `<text x="${X(v)}" y="${H - 8}" text-anchor="middle" fill="var(--color-fig-axis)">${esc(o.xfmt(v))}</text>`;
  s += `</g>`;
  rows.forEach((r, i) => {
    const y = mt + i * rh + rh / 2;
    s += `<text x="${ml - 8}" y="${y + 3}" text-anchor="end" fill="var(--color-fig-ink)" aria-hidden="true">${esc(r.sigla)}</text>`;
    if (r.se) s += `<line x1="${X(r.theta - r.se)}" x2="${X(r.theta + r.se)}" y1="${y}" y2="${y}" stroke="var(--color-fig-axis)" stroke-width="1.5" aria-hidden="true"/>`;
    s += `<circle cx="${X(r.theta).toFixed(1)}" cy="${y}" r="4.2" fill="${r.imputed ? 'var(--color-bg-raised)' : r.fill}" stroke="${r.imputed ? r.fill : 'var(--color-fig-ink)'}" stroke-width="${r.imputed ? 2.2 : 0.7}" data-punto role="img" aria-label="${esc(r.label)}"/>`;
  });
  return s + `</svg>`;
}
