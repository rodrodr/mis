// Comparator: up to three municipalities' MIS trajectories (state in the URL: ?c=code,code).
// Hue is reserved for ideology, so municipalities differ by dash pattern, never by colour.
import { lines } from './mini';
import { navegar } from '../../../kit/figura/navegar.js';

const root = document.querySelector<HTMLElement>('[data-comparador]');
if (root) init(root);

async function init(root: HTMLElement) {
  const base = root.dataset.base!;
  const L = JSON.parse(root.dataset.labels!) as Record<string, string>;
  const lang = root.dataset.lang!;
  const loc = lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es-ES' : 'en-GB';
  const f = (v: number | null) => v == null ? '—' : new Intl.NumberFormat(loc, { minimumFractionDigits: 3, maximumFractionDigits: 3, signDisplay: 'exceptZero' }).format(v).replace('-', '−');
  const input = root.querySelector<HTMLInputElement>('input')!;
  const dl = root.querySelector<HTMLDataListElement>('datalist')!;
  const list = root.querySelector<HTMLElement>('[data-comparar-lista]')!;
  const chart = root.querySelector<HTMLElement>('[data-grafico]')!;
  const legend = root.querySelector<HTMLElement>('[data-leyenda]')!;
  const DASH = ['', '6 4', '1 3'];
  let index: [number, string, string][] = [];
  const opt = (r: [number, string, string]) => `${r[1]} (${r[2]}) · ${r[0]}`;
  const chosen: { c: number; n: string; uf: string; data: any }[] = [];

  input.addEventListener('focus', async () => {
    if (index.length) return;
    index = await fetch(`${base}/data/municipalities.json`).then((r) => r.json());
    dl.innerHTML = index.map((r) => `<option value="${opt(r).replace(/"/g, '&quot;')}"></option>`).join('');
  }, { once: true });
  input.addEventListener('change', () => {
    const m = input.value.match(/· (\d{7})$/);
    if (m) add(Number(m[1]));
    input.value = '';
  });
  root.querySelector('form')!.addEventListener('submit', (e) => e.preventDefault());

  async function add(code: number, silent = false) {
    if (chosen.length >= 3 || chosen.some((x) => x.c === code)) return;
    const data = await fetch(`${base}/data/m/${code}.json`).then((r) => r.json());
    chosen.push({ c: code, n: data.n, uf: data.uf, data });
    if (!silent) sync();
    draw();
  }
  function sync() {
    const p = new URLSearchParams(location.search);
    if (chosen.length) p.set('c', chosen.map((x) => x.c).join(',')); else p.delete('c');
    history.replaceState(null, '', `${location.pathname}${p.toString() ? `?${p}` : ''}`);
  }
  function draw() {
    list.innerHTML = '';
    chosen.forEach((x, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="boton"><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="currentColor" stroke-width="2" stroke-dasharray="${DASH[i]}"/></svg><span></span></button>`;
      li.querySelector('span')!.textContent = `${x.n} (${x.uf}) · ${L.remove}`;
      li.querySelector('button')!.addEventListener('click', () => { chosen.splice(i, 1); sync(); draw(); });
      list.append(li);
    });
    if (!chosen.length) { chart.innerHTML = ''; legend.innerHTML = ''; return; }
    const ys = [...new Set(chosen.flatMap((x) => x.data.y as number[]))].sort();
    const series = chosen.map((x, i) => ({
      name: x.n, dash: DASH[i], width: 2.2,
      pts: (x.data.y as number[]).map((y, k) => ({
        x: y, y: x.data.s.ideo[k], hollow: (y - 1994) % 4 !== 0,
        label: `${x.n} (${x.uf}) · ${y}${y === 2026 ? ` (${L.provisional})` : ''} · ${(y - 1994) % 4 === 0 ? L.general : L.municipal}: ${f(x.data.s.ideo[k])}`,
      })),
    }));
    const vals = series.flatMap((s) => s.pts.map((p) => p.y)).filter((v): v is number => v != null);
    chart.innerHTML = lines(series, { xs: ys, ymin: Math.min(-0.2, Math.floor(Math.min(...vals) * 10) / 10), ymax: Math.max(0.5, Math.ceil(Math.max(...vals) * 10) / 10), yfmt: (v) => f(v).replace(/0+$/, '').replace(/[.,]$/, ''), zero: true, label: root.querySelector('h2')!.textContent! });
    legend.textContent = `● ${L.general} · ○ ${L.municipal}`;
    navegar(chart);
  }
  const pre = new URLSearchParams(location.search).get('c');
  if (pre) { for (const c of pre.split(',').map(Number).filter(Boolean).slice(0, 3)) await add(c, true); }
}
