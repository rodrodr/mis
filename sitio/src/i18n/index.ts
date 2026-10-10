import en, { type Dict } from './en';
import pt from './pt';
import es from './es';
import type { Lang } from '../lib/format';

export const dicts: Record<Lang, Dict> = { en, pt, es };

// Key parity: every language must have exactly the keys of English (principle 5).
function keys(o: unknown, prefix = ''): string[] {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  }
  if (Array.isArray(o)) return [`${prefix}[${o.length}]`];
  return [prefix];
}
const ref = new Set(keys(en));
for (const [lang, d] of Object.entries({ pt, es })) {
  const k = new Set(keys(d));
  const missing = [...ref].filter((x) => !k.has(x));
  const extra = [...k].filter((x) => !ref.has(x));
  if (missing.length || extra.length) {
    throw new Error(`i18n parity (${lang}): missing ${missing.join(', ') || '—'}; extra ${extra.join(', ') || '—'}`);
  }
}

export function t(lang: Lang): Dict {
  return dicts[lang];
}
