/* preferencias.inline.js · GENERADO por build-tokens.mjs desde tokens.resolver.json. Pégalo dentro de <script> en <head>, antes de las hojas de estilo. */
(function () {
  var C = /*CONFIG*/{"temas":["light","dark"],"familias":[]}/*FIN*/;
  try {
    var p = JSON.parse(localStorage.getItem('prefs') || '{}'), d = document.documentElement, s = d.style;
    var num = function (v, min, max) { return typeof v === 'number' && v >= min && v <= max; };
    if (C.temas.indexOf(p.theme) >= 0) d.setAttribute('data-theme', p.theme);
    if (p.contrast === 'normal' || p.contrast === 'more') d.setAttribute('data-contrast', p.contrast);
    if (p.motion === 'normal' || p.motion === 'reduce') d.setAttribute('data-motion', p.motion);
    if (num(p.scale, 0.75, 2)) s.setProperty('--reader-scale', String(p.scale));
    if (num(p.leading, 1.2, 2.2)) s.setProperty('--leading-reading', String(p.leading));
    if (num(p.measure, 30, 90)) s.setProperty('--measure-reading', String(p.measure));
    if (C.familias.indexOf(p.family) >= 0) s.setProperty('--font-family-reading', 'var(--font-family-' + p.family + ')');
  } catch (e) { /* sin almacenamiento: manda el sistema */ }
})();
