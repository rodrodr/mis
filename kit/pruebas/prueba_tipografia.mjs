// prueba_tipografia.mjs · prueba kits/tipografia-es.mjs (contrato 11). Sin dependencias.
//   node ~/.claude/skills/maestro-diseno-web/kits/pruebas/prueba_tipografia.mjs
import { tipografiar, tipografiarHTML, remarkTipografia, crearEstado } from '../tipografia-es.mjs';

const NB = ' ', F = ' ', U = '⁠';
let fallos = 0;
const igual = (obtenido, esperado, texto) => {
  const ok = obtenido === esperado;
  if (!ok) fallos++;
  const ver = (x) => JSON.stringify(x).replace(/\\u00a0/gi, '⍽').replace(/\\u202f/gi, '·').replace(/\\u2060/gi, '⁀');
  console.log(`${ok ? '  ok  ' : '  NO  '}${texto}${ok ? '' : `\n        esperado ${ver(esperado)}\n        obtenido ${ver(obtenido)}`}`);
};

console.log('tipografiar()');
igual(tipografiar('Dijo "hola" y "adiós".'), 'Dijo «hola» y «adiós».', 'comillas rectas → «»');
igual(tipografiar('"Dijo "no" y se fue"'), '«Dijo “no” y se fue»', 'comillas dentro de comillas → “”');
igual(tipografiar('Said "hi"', crearEstado('en')), 'Said “hi”', 'en inglés, “”');
igual(tipografiar('el 10 % de los votos'), `el 10${NB}% de los votos`, '10 % con espacio de no separación');
igual(tipografiar('a 25 km de 3 € el kilo'), `a 25${NB}km de 3${NB}€ el kilo`, 'unidades y moneda');
igual(tipografiar('el art. 26 y la pág. 12'), `el art.${NB}26 y la pág.${NB}12`, 'abreviaturas con número');
igual(tipografiar('en EE. UU. y RR. HH.'), `en EE.${NB}UU. y RR.${NB}HH.`, 'EE. UU.');
igual(tipografiar('el Sr. López y la Dra. Pérez'), `el Sr.${NB}López y la Dra.${NB}Pérez`, 'tratamientos');
igual(tipografiar('107551 votos y 12345678 euros'), `107${F}551 votos y 12${F}345${F}678 euros`, 'millares desde cinco cifras');
igual(tipografiar('en 1936, 2026 y 9999'), 'en 1936, 2026 y 9999', 'cuatro cifras y años, sin espacio');
igual(tipografiar('ISBN 9788420471839, tel. 912345678, Ley 39/2015, v2.10005, ref-10005'), 'ISBN 9788420471839, tel. 912345678, Ley 39/2015, v2.10005, ref-10005', 'códigos, teléfonos, leyes y versiones, intactos');
igual(tipografiar('La casa —dijo— es grande.'), `La casa —${U}dijo${U}— es grande.`, 'raya de inciso pegada a su palabra');
igual(tipografiar('—Hola —dijo él—.'), `—${U}Hola —${U}dijo él${U}—.`, 'raya de diálogo e inciso');
igual(tipografiar('Y entonces...'), 'Y entonces…', 'puntos suspensivos');
igual(tipografiar('107551 votos', crearEstado('es', { millares: 'punto' })), '107.551 votos', "millares: 'punto' (valor de la identidad)");
igual(tipografiar('107551 votos y 107.551 escaños', crearEstado('es', { millares: 'no' })), '107551 votos y 107.551 escaños', "millares: 'no' deja las cifras como vienen");
igual(tipografiar('ya escrito 107.551 y 1.530'), 'ya escrito 107.551 y 1.530', 'cifras ya agrupadas con punto: intactas');
igual(tipografiar('que se pongan de pie."'), 'que se pongan de pie.»', "comilla huérfana: 'cerrar' por defecto");
igual(tipografiar('que se pongan de pie."', crearEstado('es', { huerfanas: 'conservar' })), 'que se pongan de pie."', "comilla huérfana de OCR: 'conservar' no inventa «»»");

console.log('tipografiarHTML()');
igual(tipografiarHTML('<p>"a" <code>"b"</code> 10 %</p>'), `<p>«a» <code>"b"</code> 10${NB}%</p>`, 'no toca code');
igual(tipografiarHTML('<p title="x &quot;y&quot;">"z"</p>'), '<p title="x &quot;y&quot;">«z»</p>', 'no toca atributos');
igual(tipografiarHTML('<p>"una <em>cita</em>"</p>'), '<p>«una <em>cita</em>»</p>', 'comillas repartidas entre elementos');
igual(tipografiarHTML('<p lang="en">"hi"</p><p>"hola"</p>'), '<p lang="en">“hi”</p><p>«hola»</p>', 'respeta lang por elemento');
igual(tipografiarHTML('<pre>"x" 10 %</pre><p lang="de">"x"</p>'), '<pre>"x" 10 %</pre><p lang="de">"x"</p>', 'pre y otras lenguas, intactos');
igual(tipografiarHTML('<p>12345 y fin."</p>', { millares: 'punto', huerfanas: 'conservar' }), '<p>12.345 y fin."</p>', 'opciones también en tipografiarHTML');

console.log('remarkTipografia()');
const arbol = { type: 'root', children: [
  { type: 'paragraph', children: [{ type: 'text', value: 'Dijo "' }, { type: 'emphasis', children: [{ type: 'text', value: 'sí' }] }, { type: 'text', value: '" al 10 %' }] },
  { type: 'paragraph', children: [{ type: 'inlineCode', value: '"x"' }] },
] };
remarkTipografia()(arbol);
igual(arbol.children[0].children.map((n) => n.value ?? n.children[0].value).join(''), `Dijo «sí» al 10${NB}%`, 'texto de un párrafo con énfasis');
igual(arbol.children[1].children[0].value, '"x"', 'inlineCode intacto');

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK');
process.exit(fallos ? 1 : 0);
