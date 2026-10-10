// fluido.mjs · escala fluida al estilo Utopia a partir de un token DTCG.
// DTCG 2025.10 no puede expresar clamp(): el token guarda el mínimo en $value y el máximo en
// $extensions["es.maestro"].max. Este módulo lo comparten build-tokens.mjs y terrazzo.config.mjs,
// así los dos compiladores emiten el mismo clamp().

export const VIEWPORT = { min: 320, max: 1440 }; // px; Utopia usa el mismo par por defecto

const aPx = (d) => (d.unit === 'rem' ? d.value * 16 : d.value);
const r = (n) => Number(n.toFixed(4));

/** clamp(min, intercepto + pendiente·vw, max) en rem, o null si el token no es fluido. */
export function clampFluido(token) {
  const max = token?.$extensions?.['es.maestro']?.max;
  const min = token?.$value;
  if (!max || !min || typeof min !== 'object' || !('unit' in min)) return null;
  const a = aPx(min), b = aPx(max);
  if (a === b) return null;
  const pendiente = (b - a) / (VIEWPORT.max - VIEWPORT.min);
  const intercepto = a - pendiente * VIEWPORT.min;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `clamp(${r(lo / 16)}rem, ${r(intercepto / 16)}rem + ${r(pendiente * 100)}vw, ${r(hi / 16)}rem)`;
}
