// Number and text formatting per locale. Every figure shown in prose goes through
// these helpers and comes from the pipeline's JSON; no number is typed in copy.
export type Lang = 'en' | 'pt' | 'es';
export const LANGS: Lang[] = ['en', 'pt', 'es'];
export const DEFAULT_LANG: Lang = 'en';
const LOCALE: Record<Lang, string> = { en: 'en-GB', pt: 'pt-BR', es: 'es-ES' };

export function locale(lang: Lang) {
  return LOCALE[lang];
}

/** Signed score with fixed decimals: +0.208 / +0,208 / −0.001 (true minus sign). */
export function score(lang: Lang, v: number | null | undefined, digits = 3): string {
  if (v == null || Number.isNaN(v)) return '—';
  const s = new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: 'exceptZero',
  }).format(v);
  return s.replace('-', '−');
}

export function num(lang: Lang, v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(v).replace('-', '−');
}

/** Percentage from a 0–1 share, with a non-breaking space where the locale uses one. */
export function pct(lang: Lang, v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat(LOCALE[lang], {
    style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(v);
}

/** Large counts: 5,571 / 5.571 / 5571 (es uses no separator below 10 000 by RAE rule). */
export function count(lang: Lang, v: number): string {
  return new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 0 }).format(v);
}

/** Replace {name} placeholders; throws if any placeholder is left unfilled. */
export function fill(template: string, vars: Record<string, string | number>): string {
  const out = template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  const left = out.match(/\{\w+\}/);
  if (left) throw new Error(`Unfilled placeholder ${left[0]} in: ${template.slice(0, 80)}`);
  return out;
}

export function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
