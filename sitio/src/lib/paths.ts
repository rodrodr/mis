import type { Lang } from './format';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Internal link: shared English slugs, language prefix for pt/es. */
export function href(lang: Lang, path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${lang === 'en' ? '' : `/${lang}`}${p}`;
}

/** Static asset / data file under public/. */
export function asset(path: string): string {
  return `${BASE}/${path.replace(/^\//, '')}`;
}

/** Same page in another language (path without base and language prefix). */
export function stripLang(pathname: string): string {
  let p = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  p = p.replace(/^\/(pt|es)(?=\/|$)/, '');
  return p || '/';
}
