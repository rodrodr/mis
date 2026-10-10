// Map explorer (app surface). State lives in the URL: ?year=&var=&scale=&mode=&agg=&fdr=&m=
import { createMap, getJSON, scaleFor, classify, type MapHandle, type Municipality } from './mapa';

interface Arr { scale: number; years: number[]; v: (number | null)[][] }
type Unit = { year: number; fem_share_agg: number | null; gap_agg: number | null; fem_votes: number };

const root = document.querySelector<HTMLElement>('[data-explorador]');
if (root) init(root);

async function init(root: HTMLElement) {
  const base = root.dataset.base!;
  const lang = root.dataset.lang!;
  const L = JSON.parse(root.dataset.labels!) as Record<string, string>;
  const profileBase = root.dataset.profile!;
  const FEW = Number(root.dataset.few);
  const loc = lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es-ES' : 'en-GB';
  const nf = (d: number, sign = false) => new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: sign ? 'exceptZero' : 'auto' });
  const fmtScore = (x: number) => nf(3, true).format(x).replace('-', '−');
  const fmtPct = (x: number) => new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 1 }).format(x);
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const q = new URLSearchParams(location.search);
  const S = {
    year: Number(q.get('year')) || Number(root.dataset.year),
    v: (q.get('var') || 'ideo') as string,
    scale: q.get('scale') === 'rel' ? 'rel' : 'abs',
    mode: (['level', 'change', 'lisa'].includes(q.get('mode') ?? '') ? q.get('mode') : 'level') as 'level' | 'change' | 'lisa',
    agg: (['muni', 'ri', 'uf'].includes(q.get('agg') ?? '') ? q.get('agg') : 'muni') as 'muni' | 'ri' | 'uf',
    fdr: q.get('fdr') === '1',
    m: Number(q.get('m')) || null as number | null,
  };
  const $ = <T extends Element>(s: string) => (root.querySelector<T>(s) ?? document.querySelector<T>(s))!;
  const host = $<HTMLElement>('[data-lienzo]');
  const panel = $<HTMLElement>('[data-panel]');
  const legend = $<HTMLElement>('[data-leyenda]');
  const hist = $<HTMLElement>('[data-histograma]');
  const tableBody = $<HTMLElement>('[data-tabla] tbody');
  const tableTitle = $<HTMLElement>('[data-tabla-titulo]');
  const ufSelect = $<HTMLSelectElement>('[data-uf]');
  const status = $<HTMLElement>('[data-estado]');

  status.textContent = L.loading;
  let map: MapHandle;
  const arrays = new Map<string, Arr>();
  const need = async (k: string) => {
    if (!arrays.has(k)) arrays.set(k, await getJSON<Arr>(`${base}/data/map/${k}.json`));
    return arrays.get(k)!;
  };
  let ri: { names: Record<string, string>; series: Record<string, Unit[]> } | null = null;
  let uf: Record<string, Unit[]> | null = null;

  try {
    const rotulo = document.querySelector<HTMLElement>('.mapa__rotulo');
    const lateral = document.querySelector<HTMLElement>('.mapa__lateral');
    const leyenda = document.querySelector<HTMLElement>('.mapa__leyenda');
    map = await createMap(host, {
      base,
      reserve: () => innerWidth < 640
        ? { w: 0, h: (rotulo?.offsetHeight ?? 0) + 12, b: (leyenda?.offsetHeight ?? 0) + 12 }
        : { w: (lateral?.offsetWidth ?? 0) + 16, h: 0, b: 0 },
      label: (m) => `${m.n} (${m.uf}): ${valueLabel(m.c)}`,
      onHover: (m) => showCard(m ?? (S.m ? map.meta.get(S.m) ?? null : null)),
      onSelect: (m) => { S.m = m.c; map.select(m.c); showCard(m); sync(); },
    });
    await need('ideo');
    status.textContent = '';
  } catch {
    status.textContent = L.error;
    return;
  }
  const order = map.order;
  const years = arrays.get('ideo')!.years;
  const arenaOf = (y: number) => ((y - 1994) % 4 === 0 ? 'general' : 'municipal');
  const prevSame = (y: number) => years.filter((x) => x < y && arenaOf(x) === arenaOf(y)).at(-1) ?? null;

  let lastSig = '';
  let current: (number | null)[] = [];
  let currentScale: ReturnType<typeof scaleFor> | null = null;
  let rank = new Map<number, number>();

  function valueLabel(code: number): string {
    const i = order.indexOf(code);
    const x = current[i];
    if (x == null) return L.missing;
    if (S.mode === 'lisa') return [L.lisa_ns, L.lisa_hh, L.lisa_ll, L.lisa_hl, L.lisa_lh][x % 10] ?? '';
    return fmt(x);
  }
  function fmt(x: number): string {
    if (S.mode === 'change' || S.scale === 'rel') return fmtScore(x);
    switch (S.v) {
      case 'dalton': return nf(1).format(x * 10);
      case 'enep': return nf(1).format(x);
      case 'fem': return fmtPct(x);
      default: return fmtScore(x);
    }
  }

  async function render() {
    const yi = years.indexOf(S.year);
    const pal = map.palette();
    const fv = (await need('fv')).v[yi];
    let hatchFn: ((i: number) => boolean) | undefined;
    if (S.mode === 'lisa') {
      const l = await need('lisa');
      const li = l.years.indexOf(S.year);
      current = l.v[li].map((c) => (c == null ? null : S.fdr && c > 0 && c < 10 ? 0 : c));
      currentScale = null;
      map.paint(current, (c) => (c == null ? pal.missing : pal.lisa[c % 10]));
    } else {
      const key = S.v === 'misF' ? 'misF' : S.v;
      const a = await need(key);
      let vals = a.v[yi].map((x) => (x == null ? null : x / a.scale));
      if (['fem', 'gap'].includes(S.v) && S.agg !== 'muni') vals = await aggregate(vals);
      if (S.mode === 'change') {
        const p = prevSame(S.year);
        const pi = p == null ? -1 : years.indexOf(p);
        vals = pi < 0 ? vals.map(() => null) : vals.map((x, i) => (x == null || a.v[pi][i] == null ? null : x - a.v[pi][i]! / a.scale));
      } else if (S.scale === 'rel') {
        const ok = vals.filter((x): x is number => x != null);
        const mean = ok.reduce((s, x) => s + x, 0) / ok.length;
        vals = vals.map((x) => (x == null ? null : x - mean));
      }
      current = vals;
      const sk = S.mode === 'change' ? 'change' : S.scale === 'rel' && ['ideo', 'ideopref'].includes(S.v) ? 'rel' : (S.v as any);
      currentScale = scaleFor(sk, pal, (x, d) => nf(d ?? 2, true).format(x));
      const sc = currentScale;
      if (['fem', 'gap', 'misF'].includes(S.v) && S.agg === 'muni') hatchFn = (i) => fv[i] != null && fv[i]! < FEW;
      map.paint(current, (x) => (x == null ? pal.missing : classify(sc, x)), hatchFn);
    }
    // rank (left → right for scores; high → low otherwise)
    const idx = current.map((x, i) => [x, i] as const).filter(([x]) => x != null) as [number, number][];
    idx.sort((p, q2) => p[0] - q2[0]);
    rank = new Map(idx.map(([, i], r) => [order[i], r + 1]));
    drawLegend(); drawHist(); drawTable(); showCard(S.m ? map.meta.get(S.m) ?? null : null);
    root.querySelectorAll<HTMLButtonElement>('[data-ano]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.ano) === S.year)));
    const prov = root.querySelector<HTMLElement>('[data-provisional]');
    // keep the stamp's space so the map geometry never moves between years
    if (prov) prov.style.visibility = S.year === Math.max(...years) ? 'visible' : 'hidden';
    // print the encoding context on the map itself: measure, year, arena
    const measure = L[`var_${S.v}`] ?? S.v;
    const prev = prevSame(S.year);
    let medida = S.mode === 'lisa' ? `${L.mode_lisa} · ${L.var_ideo}`
      : S.mode === 'change' ? L.change_title.replace('{measure}', measure) : measure;
    if (S.mode === 'level' && S.scale === 'rel' && ['ideo', 'ideopref'].includes(S.v)) medida += ` · ${L.scale_rel}`;
    if (S.mode === 'level' && ['fem', 'gap'].includes(S.v) && S.agg !== 'muni') medida += ` · ${S.agg === 'ri' ? L.agg_ri : L.agg_uf}`;
    $<HTMLElement>('[data-r-medida]').textContent = medida;
    $<HTMLElement>('[data-r-ano]').textContent = S.mode === 'change' && prev ? `${prev}→${S.year}` : String(S.year);
    $<HTMLElement>('[data-r-arena]').textContent = arenaOf(S.year) === 'general' ? L.general_long : L.municipal_long;
    $<HTMLElement>('[data-lisa-nota]').hidden = S.mode !== 'lisa';
    const sig = `${medida}|${S.mode}|${S.v}|${S.scale}|${S.agg}`;
    if (sig !== lastSig) { lastSig = sig; map.relayout(); }
    $<HTMLElement>('[data-agg-grupo]').hidden = !['fem', 'gap'].includes(S.v) || S.mode !== 'level';
    $<HTMLElement>('[data-fdr-grupo]').hidden = S.mode !== 'lisa';
    $<HTMLElement>('[data-moran]').hidden = S.mode !== 'lisa';
    $<HTMLElement>('[data-hist-bloque]').hidden = S.mode === 'lisa';
    if (S.mode === 'lisa') {
      const mor = JSON.parse(root.dataset.moran!) as Record<string, number>;
      $<HTMLElement>('[data-moran]').textContent = `${L.moran}: ${nf(3).format(mor[S.year])}`;
    }
    const few = $<HTMLElement>('[data-few]');
    few.hidden = !hatchFn;
    if (S.mode === 'change') {
      const p = prevSame(S.year);
      $<HTMLElement>('[data-nota-cambio]').textContent = p ? L.change_note.replace('{from}', String(p)).replace('{to}', String(S.year)) : '';
    } else $<HTMLElement>('[data-nota-cambio]').textContent = '';
  }

  async function aggregate(vals: (number | null)[]): Promise<(number | null)[]> {
    const key = S.v === 'fem' ? 'fem_share_agg' : 'gap_agg';
    if (S.agg === 'ri') {
      ri ??= await getJSON(`${base}/data/immediate_regions.json`);
      return order.map((c) => {
        const r = map.meta.get(c)?.ri;
        const row = r == null ? null : ri!.series[String(r)]?.find((x) => x.year === S.year);
        return row ? (row as any)[key] : null;
      });
    }
    uf ??= await getJSON(`${base}/data/states.json`);
    return order.map((c) => {
      const row = uf![map.meta.get(c)!.uf]?.find((x) => x.year === S.year);
      return row ? (row as any)[key] : null;
    });
  }

  function drawLegend() {
    legend.innerHTML = '';
    const pal = map.palette();
    const items: [string, string, boolean?][] = [];
    if (S.mode === 'lisa') {
      items.push([pal.lisa[1], L.lisa_hh], [pal.lisa[2], L.lisa_ll], [pal.lisa[3], L.lisa_hl], [pal.lisa[4], L.lisa_lh], [pal.lisa[0], L.lisa_ns]);
    } else if (currentScale) {
      const s = currentScale;
      s.colors.forEach((c, i) => {
        const lo = i === 0 ? null : s.breaks[i - 1], hi = i === s.colors.length - 1 ? null : s.breaks[i];
        const f = (x: number) => fmt(x);
        items.push([c, lo == null ? `< ${f(hi!)}` : hi == null ? `≥ ${f(lo)}` : `${f(lo)} – ${f(hi)}`]);
      });
    }
    items.push([pal.missing, L.missing]);
    for (const [c, t] of items) {
      const li = document.createElement('li');
      const sw = document.createElement('span');
      sw.className = 'leyenda__muestra';
      sw.style.background = c;
      li.append(sw, document.createTextNode(t));
      legend.append(li);
    }
  }

  function drawHist() {
    const ok = current.filter((x): x is number => x != null);
    if (S.mode === 'lisa' || !ok.length) { hist.innerHTML = ''; return; }
    const lo = Math.min(...ok), hi = Math.max(...ok), n = 24, w = (hi - lo) / n || 1;
    const bins = new Array(n).fill(0);
    ok.forEach((x) => bins[Math.min(n - 1, Math.floor((x - lo) / w))]++);
    const max = Math.max(...bins);
    const sel = S.m != null ? current[order.indexOf(S.m)] : null;
    const W = 300, H = 90;
    const bars = bins.map((b, i) => `<rect x="${(i * W) / n + 0.5}" y="${H - (b / max) * (H - 4)}" width="${W / n - 1}" height="${(b / max) * (H - 4)}" fill="var(--color-fig-ink)" opacity="0.75"/>`).join('');
    const mark = sel == null ? '' : `<line x1="${((sel - lo) / (hi - lo)) * W}" x2="${((sel - lo) / (hi - lo)) * W}" y1="0" y2="${H}" stroke="var(--color-fig-ink)" stroke-width="2" stroke-dasharray="3 2"/>`;
    hist.innerHTML = `<svg viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${L.histogram}"><g>${bars}</g>${mark}<text x="0" y="${H + 16}" font-size="12" fill="currentColor">${fmt(lo)}</text><text x="${W}" y="${H + 16}" font-size="12" text-anchor="end" fill="currentColor">${fmt(hi)}</text></svg>`;
  }

  function showCard(m: Municipality | null) {
    const card = $<HTMLElement>('[data-ficha]');
    if (!m) { card.hidden = true; return; }
    card.hidden = false;
    card.querySelector('[data-f-nombre]')!.textContent = `${m.n} (${m.uf})`;
    card.querySelector('[data-f-valor]')!.textContent = valueLabel(m.c);
    const r = rank.get(m.c);
    card.querySelector('[data-f-rango]')!.textContent = r && S.mode !== 'lisa'
      ? L.rank_text.replace('{rank}', nf(0).format(r)).replace('{total}', nf(0).format(rank.size)) : '';
    (card.querySelector('[data-f-enlace]') as HTMLAnchorElement).href = `${profileBase}${m.c}-${slug(m.n)}/`;
  }

  function drawTable() {
    const want = ufSelect.value;
    tableTitle.textContent = L.table_title.replace('{year}', String(S.year));
    const rows = order.map((c, i) => ({ m: map.meta.get(c)!, x: current[i] }))
      .filter((r) => r.m.uf === want)
      .sort((a, b) => a.m.n.localeCompare(b.m.n, 'pt'));
    tableBody.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      const a = document.createElement('a');
      a.href = `${profileBase}${r.m.c}-${slug(r.m.n)}/`;
      a.textContent = r.m.n;
      th.append(a);
      const td = document.createElement('td');
      td.dataset.cifra = '';
      td.textContent = r.x == null ? '—' : S.mode === 'lisa' ? valueLabel(r.m.c) : fmt(r.x);
      const tr2 = document.createElement('td');
      tr2.dataset.cifra = '';
      tr2.textContent = rank.get(r.m.c) ? nf(0).format(rank.get(r.m.c)!) : '—';
      tr.append(th, td, tr2);
      frag.append(tr);
    }
    tableBody.append(frag);
  }

  function sync() {
    const p = new URLSearchParams();
    p.set('year', String(S.year));
    if (S.v !== 'ideo') p.set('var', S.v);
    if (S.scale !== 'abs') p.set('scale', S.scale);
    if (S.mode !== 'level') p.set('mode', S.mode);
    if (S.agg !== 'muni') p.set('agg', S.agg);
    if (S.fdr) p.set('fdr', '1');
    if (S.m) p.set('m', String(S.m));
    history.replaceState(null, '', `${location.pathname}?${p}`);
  }

  // controls
  root.querySelectorAll<HTMLButtonElement>('[data-ano]').forEach((b) => b.addEventListener('click', () => { S.year = Number(b.dataset.ano); sync(); render(); }));
  const bind = (sel: string, key: keyof typeof S) => {
    const el = $<HTMLSelectElement | HTMLInputElement>(sel);
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(S[key]);
    else (el as HTMLSelectElement).value = String(S[key]);
    el.addEventListener('change', () => {
      (S as any)[key] = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value;
      sync(); render();
    });
  };
  bind('[data-var]', 'v'); bind('[data-escala]', 'scale'); bind('[data-modo]', 'mode'); bind('[data-agg]', 'agg'); bind('[data-fdr]', 'fdr');
  ufSelect.value = S.m ? map.meta.get(S.m)?.uf ?? ufSelect.value : ufSelect.value;
  ufSelect.addEventListener('change', drawTable);
  $<HTMLButtonElement>('[data-zoom-mas]').addEventListener('click', () => map.zoom(1.5));
  $<HTMLButtonElement>('[data-zoom-menos]').addEventListener('click', () => map.zoom(1 / 1.5));
  $<HTMLButtonElement>('[data-zoom-reset]').addEventListener('click', () => map.reset());
  let timer = 0;
  const play = $<HTMLButtonElement>('[data-play]');
  play.addEventListener('click', () => {
    if (timer) { clearInterval(timer); timer = 0; play.querySelector('.icono')!.textContent = '▶'; play.querySelector('[data-play-texto]')!.textContent = L.play; play.setAttribute('aria-pressed', 'false'); return; }
    play.querySelector('.icono')!.textContent = '❚❚'; play.querySelector('[data-play-texto]')!.textContent = L.pause; play.setAttribute('aria-pressed', 'true');
    const arena = years.filter((y) => arenaOf(y) === arenaOf(S.year));
    timer = window.setInterval(() => {
      const i = arena.indexOf(S.year);
      S.year = arena[(i + 1) % arena.length];
      sync(); render();
    }, 1400);
  });
  addEventListener('prefs', () => { map.retheme(); render(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { map.retheme(); render(); });
  if (S.m) map.select(S.m);
  await render();
  sync();
}
