/* preferencias.inline.js · PLANTILLA. No la pegues tal cual: build-tokens.mjs escribe la versión
   lista en tokens/dist/preferencias.inline.js, con los temas y las familias de TU resolver (con
   lectura.resolver.json acepta sepia y negro). Esa se pega dentro de <script> en <head>, ANTES de las
   hojas de estilo, y aplica lo guardado antes del primer pintado (sin FOUC ni salto de tema):
     tema, contraste y movimiento  → data-theme, data-contrast, data-motion en <html>
     tamaño, interlineado y medida → --reader-scale, --leading-reading, --measure-reading
     familia de lectura            → --font-family-reading: var(--font-family-<familia>)
   Es la misma lógica que aplicar() en preferencias.js; si cambias una, cambia la otra. ES5 a propósito. */
(function () {
  var C = /*CONFIG*/{"temas":["light","dark"],"familias":["display","mono"]}/*FIN*/;
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
