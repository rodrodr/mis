// E6: state slope chart between two user-chosen elections of the same arena.
import { slope } from './mini';
import { navegar } from '../../../kit/figura/navegar.js';

const box = document.querySelector<HTMLElement>('[data-pendiente]');
if (box) init(box);

type Row = { year: number; mis_wmean: number };
async function init(box: HTMLElement) {
  const fig = box.closest<HTMLElement>('[data-figura]')!;
  const lang = box.dataset.lang!;
  const loc = lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es-ES' : 'en-GB';
  const f = (v: number) => new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(v).replace('-', '−');
  const years = JSON.parse(box.dataset.years!) as Record<'general' | 'municipal', number[]>;
  const arena = box.querySelector<HTMLSelectElement>('[data-p-arena]')!;
  const A = box.querySelector<HTMLSelectElement>('[data-p-a]')!, B = box.querySelector<HTMLSelectElement>('[data-p-b]')!;
  let data: Record<string, Row[]> | null = null;
  const load = async () => (data ??= await fetch(box.dataset.src!).then((r) => r.json()));
  const fillYears = () => {
    const ys = years[arena.value as 'general' | 'municipal'];
    for (const [sel, def] of [[A, ys[Math.max(0, ys.length - 5)]], [B, ys[ys.length - 1]]] as const) {
      sel.innerHTML = ys.map((y) => `<option value="${y}">${y}</option>`).join('');
      sel.value = String(def);
    }
  };
  const draw = async () => {
    const d = await load();
    const ya = Number(A.value), yb = Number(B.value);
    const ufName = new Map<string, string>();
    fig.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((tr) => { const uf = tr.dataset.key; if (uf) ufName.set(uf, tr.children[0].textContent ?? uf); });
    const rows = Object.entries(d).map(([uf, r]) => {
      const a = r.find((x) => x.year === ya)?.mis_wmean ?? null, b = r.find((x) => x.year === yb)?.mis_wmean ?? null;
      return { key: uf, name: ufName.get(uf) ?? uf, a, b };
    });
    holder.innerHTML = slope(rows, { ya: String(ya), yb: String(yb), label: fig.querySelector('.figura__subtitulo')!.textContent!, fmt: f, w: 1100, h: 560 });
    navegar(holder);
    highlight(fixed);
    fig.querySelector('.figura__titulo')!.textContent = box.dataset.title!.replace('{from}', String(ya)).replace('{to}', String(yb));
    const ths = fig.querySelectorAll('thead th');
    ths[1].textContent = String(ya); ths[2].textContent = String(yb);
    const byUf = new Map(rows.map((r) => [r.key, r]));
    fig.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((tr) => {
      const r = byUf.get(tr.dataset.key ?? '');
      if (!r) return;
      tr.children[1].textContent = r.a == null ? '—' : f(r.a);
      tr.children[2].textContent = r.b == null ? '—' : f(r.b);
      tr.children[3].textContent = r.a == null || r.b == null ? '—' : f(r.b - r.a);
    });
  };
  // highlight one state: the rest of the lines, dots and labels turn light grey.
  // Delegated on the holder, so it survives every redraw.
  const holder = fig.querySelector<HTMLElement>('[data-navegable]')!;
  let fixed: string | null = null;
  const highlight = (key: string | null) => {
    const svg = holder.querySelector('svg.pendiente');
    if (!svg) return;
    svg.classList.toggle('atenuado', key != null);
    svg.querySelectorAll<SVGGElement>('.pendiente__u').forEach((g) => g.classList.toggle('activo', g.dataset.key === key));
  };
  const unitOf = (el: EventTarget | null) => (el instanceof Element ? el.closest<SVGGElement>('.pendiente__u') : null);
  holder.addEventListener('pointerover', (e) => { const g = unitOf(e.target); if (g && e.pointerType !== 'touch') highlight(g.dataset.key ?? null); });
  holder.addEventListener('pointerleave', () => highlight(fixed));
  holder.addEventListener('click', (e) => {            // tap / click pins a state; tapping it again (or outside) releases
    const g = unitOf(e.target);
    fixed = g && g.dataset.key !== fixed ? g.dataset.key ?? null : null;
    highlight(fixed);
  });
  holder.addEventListener('focusin', (e) => { const g = unitOf(e.target); if (g) highlight(g.dataset.key ?? null); });
  holder.addEventListener('focusout', () => highlight(fixed));
  holder.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fixed = null; highlight(null); } });

  arena.addEventListener('change', () => { fillYears(); draw(); });
  A.addEventListener('change', draw);
  B.addEventListener('change', draw);
}
