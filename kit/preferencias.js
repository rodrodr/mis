// preferencias.js · preferencias persistidas del visitante (contrato 7, primer piso: localStorage).
// La MISMA lógica va en línea en <head> (tokens/dist/preferencias.inline.js, que genera
// build-tokens.mjs) para aplicarla antes del primer pintado; este módulo sirve para leerlas y
// cambiarlas después. Todo en try/catch: el almacenamiento puede faltar (ventana privada, datos
// bloqueados) y la página tiene que funcionar igual.
//
//   theme:    'system' | uno de los temas del resolver ('light', 'dark'; en lectura, 'sepia', 'black')
//                                                    → [data-theme]
//   contrast: 'system' | 'normal' | 'more'       → [data-contrast]
//   motion:   'system' | 'normal' | 'reduce'     → [data-motion]
//   scale:    null | 0,75–2 (tamaño de lectura)   → --reader-scale (lo usa .lectura de base.css)
//   leading:  null | 1,2–2,2                      → --leading-reading
//   measure:  null | 30–90 (en ch)                → --measure-reading
//   family:   null | una familia marcada con $extensions["es.maestro"].lectura (lectura.tokens.json:
//             serif, sans, dyslexic) → --font-family-reading. display y mono nunca componen el cuerpo.
//   sound:    false (por defecto) | true         → lo lee feedback.js
//   haptic:   true (por defecto) | false         → lo lee feedback.js
// null o 'system' = lo que diga el sistema o el token. Un valor fuera de rango no se aplica.

import CONFIG from './tokens/dist/preferencias-config.js';

export const CLAVE = 'prefs';
const DEFECTO = Object.freeze({
  theme: 'system', contrast: 'system', motion: 'system',
  scale: null, leading: null, measure: null, family: null,
  sound: false, haptic: true,
});
const RANGOS = { scale: ['--reader-scale', 0.75, 2], leading: ['--leading-reading', 1.2, 2.2], measure: ['--measure-reading', 30, 90] };
const VALIDOS = {
  theme: (v) => CONFIG.temas.includes(v),
  contrast: (v) => v === 'normal' || v === 'more',
  motion: (v) => v === 'normal' || v === 'reduce',
};

function leer() {
  try { return { ...DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE) || '{}') }; }
  catch { return { ...DEFECTO }; }
}

export function aplicar(p = leer()) {
  const d = document.documentElement, s = d.style;
  for (const [k, valido] of Object.entries(VALIDOS)) {
    if (valido(p[k])) d.dataset[k] = p[k];
    else delete d.dataset[k];
  }
  for (const [k, [prop, min, max]] of Object.entries(RANGOS)) {
    const v = p[k];
    if (typeof v === 'number' && v >= min && v <= max) s.setProperty(prop, String(v));
    else s.removeProperty(prop);
  }
  if (CONFIG.familias.includes(p.family)) s.setProperty('--font-family-reading', `var(--font-family-${p.family})`);
  else s.removeProperty('--font-family-reading');
}

export const prefs = {
  get: leer,
  /** Temas y familias que acepta este build (para pintar los controles del lector). */
  opciones: () => ({ temas: [...CONFIG.temas], familias: [...CONFIG.familias] }),
  /** Guarda, aplica y avisa (evento 'prefs' en window) para que islas y bus reaccionen. */
  set(cambios) {
    const p = { ...leer(), ...cambios };
    try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin almacenamiento: vale para esta visita */ }
    aplicar(p);
    window.dispatchEvent(new CustomEvent('prefs', { detail: p }));
    return p;
  },
};

/** ¿Movimiento reducido? El atributo manda; si no hay, la preferencia del sistema. */
export function reducido() {
  const m = document.documentElement.dataset.motion;
  if (m === 'reduce') return true;
  if (m === 'normal') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
