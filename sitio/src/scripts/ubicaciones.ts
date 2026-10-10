// Methodology: party placements for the election chosen on the year rail.
import { placements } from './mini';
import { grupo, grupoColor, limites } from '../lib/grupos';
import { navegar } from '../../../kit/figura/navegar.js';

const rail = document.querySelector<HTMLElement>('[data-ubicaciones]');
if (rail) init(rail);

async function init(rail: HTMLElement) {
  const fig = rail.closest<HTMLElement>('[data-figura]')!;
  const lang = rail.dataset.lang!;
  const loc = lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es-ES' : 'en-GB';
  const L = JSON.parse(rail.dataset.lab!) as { imputed: string; left: string; right: string };
  const f = (v: number, dg = 3, sign = true) => new Intl.NumberFormat(loc, { minimumFractionDigits: dg, maximumFractionDigits: dg, signDisplay: sign ? 'exceptZero' : 'auto' }).format(v).replace('-', '−');
  let data: Record<string, Record<string, [string, number, number, number, string, number]>> | null = null;
  const draw = async (year: number) => {
    data ??= await fetch(rail.dataset.src!).then((r) => r.json());
    const rows = Object.entries(data![String(year)] ?? {}).map(([num, [sigla, theta, imp, se, crit, wave]]) => ({ num: Number(num), sigla, theta, imputed: !!imp, se, crit, wave }))
      .sort((a, b) => a.theta - b.theta);
    const sub = rail.dataset.sub!.replace('{year}', String(year));
    const holder = fig.querySelector<HTMLElement>('[data-navegable]')!;
    holder.innerHTML = placements(rows.map((r) => ({ ...r, fill: grupoColor(grupo(r.theta)), label: `${r.sigla} (${r.num}): ${f(r.theta)} ± ${f(r.se, 3, false)}${r.imputed ? ` · ${L.imputed}` : ''}` })),
      { label: sub, xfmt: (v) => (v === -1 ? `−1 ${L.left}` : v === 1 ? `${L.right} +1` : f(v, 1)), bands: limites.slice(1) });
    navegar(holder);
    fig.querySelector('.figura__subtitulo')!.textContent = sub;
    const tbody = fig.querySelector('tbody')!;
    tbody.innerHTML = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      const cells = [r.sigla, String(r.num), f(r.theta), f(r.se, 3, false), r.crit, String(r.wave)];
      cells.forEach((c, i) => { const el = document.createElement(i === 0 ? 'th' : 'td'); if (i === 0) (el as HTMLTableCellElement).scope = 'row'; if ([1, 2, 3, 5].includes(i)) el.dataset.cifra = ''; el.textContent = c; tr.append(el); });
      tbody.append(tr);
    }
  };
  rail.querySelectorAll<HTMLButtonElement>('[data-ano]').forEach((b) => b.addEventListener('click', () => {
    rail.querySelectorAll('[data-ano]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw(Number(b.dataset.ano));
  }));
}
