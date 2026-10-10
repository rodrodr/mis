// Seven ideological groups: equal-width bands of the −1…+1 scale (2/7 each), from far left
// to far right. Used to colour parties (red → green → blue, tokens --color-ideo-grupo-*).
export const GRUPOS = ['ei', 'i', 'ci', 'c', 'cd', 'd', 'ed'] as const;
export type Grupo = (typeof GRUPOS)[number];
export const BANDA = 2 / 7;
export function grupo(theta: number): Grupo {
  const i = Math.min(6, Math.max(0, Math.floor((theta + 1) / BANDA)));
  return GRUPOS[i];
}
export const grupoColor = (g: Grupo) => `var(--color-ideo-grupo-${g})`;
/** Lower edge of each band, for legends: −1, −0.71, −0.43, −0.14, 0.14, 0.43, 0.71 */
export const limites = GRUPOS.map((_, i) => -1 + i * BANDA);
