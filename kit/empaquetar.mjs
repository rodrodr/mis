#!/usr/bin/env node
// empaquetar.mjs · módulos ES relativos → UN script clásico, sin dependencias (contrato 7; verificacion.md).
//
// Para un entregable que se abre con doble clic (file://): Chromium y WebKit no cargan módulos ES desde
// el origen null. Sigue los import ESTÁTICOS relativos desde la entrada, ordena por dependencias y mete
// cada módulo en su función; la entrada va la última. Sin paquetes npm ni import(): con un nombre suelto
// ('idb-keyval', 'phaser') se niega (usa almacen.js o el <script> del CDN); un import() lo avisa y lo
// deja tal cual (fallará desde file://).
//
//   node kit/empaquetar.mjs src/app.js --salida dist/app.js [--global App]
//   import { empaquetar } from './kit/empaquetar.mjs';  const { js, avisos } = empaquetar('src/app.js', { global: 'App' });
//
// Forma que entiende (la del kit y la de un proyecto normal):
//   import { a, b as c } from './x.js';   import X from './y.js';   import * as NS from './z.js';
//   import X, { a } from './y.js';        import './efecto.js';
//   export function|async function|class|const|let|var nombre …;   export default …;   export { a, b as c };
// Límites: los enlaces vivos de ES se congelan al final de cada módulo (una `let` exportada que cambia
// después no se ve fuera); `export * from` y `await` de primer nivel no están soportados (se niega).
// Las fuentes web tampoco cargan desde file://: el entregable de doble clic lleva reservas con
// size-adjust (medir-reservas.py) o fuentes en data:. Probado en pruebas/prueba_herramientas.py.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMPORT = /^[ \t]*import\s+(?:([\w$]+)\s*,?\s*)?(?:\*\s+as\s+([\w$]+)\s*)?(?:\{([^}]*)\}\s*)?(?:from\s+)?(['"])([^'"]+)\4\s*;?/gm;

export function empaquetar(entrada, { global = null } = {}) {
  const orden = [], visitados = new Map(), avisos = [];
  const nombreDe = (ruta) => `__m${visitados.get(ruta).n}`;

  function visitar(ruta, pila = []) {
    if (visitados.has(ruta)) {
      if (pila.includes(ruta)) throw new Error(`dependencia circular: ${[...pila, ruta].map((r) => relative(process.cwd(), r)).join(' → ')}`);
      return;
    }
    const fuente = readFileSync(ruta, 'utf8');
    const info = { n: visitados.size, fuente, deps: [] };
    visitados.set(ruta, info);
    if (/^\s*export\s*\*/m.test(fuente)) throw new Error(`${ruta}: «export * from» no está soportado`);
    // primer nivel = columna 0 (los cuerpos de función van sangrados)
    if (/^await\s|^(?:const|let|var)\s+[^=\n]+=\s*await\s/m.test(fuente)) throw new Error(`${ruta}: await de primer nivel no está soportado en un script clásico`);
    const lineas = fuente.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    if (/\bimport\s*\(/.test(lineas)) avisos.push(`${relative(process.cwd(), ruta)}: import() dinámico, se deja tal cual (no carga desde file://)`);
    for (const m of fuente.matchAll(IMPORT)) {
      const esp = m[5];
      if (!/^\.{1,2}\//.test(esp)) throw new Error(`${ruta}: import de «${esp}» (paquete o URL): empaquetar.mjs solo junta módulos relativos. Usa almacen.js en vez de idb-keyval, o carga el paquete con <script> aparte`);
      const dep = resolve(dirname(ruta), esp);
      info.deps.push(dep);
      visitar(dep, [...pila, ruta]);
    }
    orden.push(ruta);
  }
  visitar(resolve(entrada));

  const bloques = orden.map((ruta) => {
    const { fuente } = visitados.get(ruta);
    const exportados = [];
    let cuerpo = fuente.replace(IMPORT, (_, def, ns, llaves, _q, esp) => {
      const m = nombreDe(resolve(dirname(ruta), esp));
      const partes = [];
      if (def) partes.push(`const ${def} = ${m}.default;`);
      if (ns) partes.push(`const ${ns} = ${m};`);
      if (llaves && llaves.trim()) partes.push(`const { ${llaves.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\s+as\s+/, ': ')).join(', ')} } = ${m};`);
      return partes.join(' ');
    });
    cuerpo = cuerpo.replace(/^([ \t]*)export\s+default\s+/m, (_, s) => { exportados.push('default: __defecto'); return `${s}const __defecto = `; });
    cuerpo = cuerpo.replace(/^([ \t]*)export\s+((?:async\s+)?function\*?|class|const|let|var)\s+([\w$]+)/gm, (_, s, tipo, nombre) => { exportados.push(nombre); return `${s}${tipo} ${nombre}`; });
    cuerpo = cuerpo.replace(/^[ \t]*export\s*\{([^}]*)\}\s*;?/gm, (_, lista) => {
      for (const x of lista.split(',').map((y) => y.trim()).filter(Boolean)) {
        const [local, fuera] = x.split(/\s+as\s+/);
        exportados.push(fuera ? `${fuera}: ${local}` : local);
      }
      return '';
    });
    const nombre = nombreDe(ruta);
    return `// ${relative(process.cwd(), ruta)}\nconst ${nombre} = (() => {\n${cuerpo}\nreturn { ${exportados.join(', ')} };\n})();`;
  });
  const fin = global ? `\nwindow[${JSON.stringify(global)}] = ${nombreDe(resolve(entrada))};` : '';
  const js = `/* GENERADO por empaquetar.mjs desde ${relative(process.cwd(), resolve(entrada))}: script clásico, se abre también desde file://. No editar. */\n(() => {\n'use strict';\n${bloques.join('\n')}${fin}\n})();\n`;
  return { js, avisos, modulos: orden.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
  const salida = opt('--salida'), global = opt('--global');
  const [entrada] = argv;
  if (!entrada) { console.error('uso: node kit/empaquetar.mjs src/app.js --salida dist/app.js [--global Nombre]'); process.exit(1); }
  try {
    const { js, avisos, modulos } = empaquetar(entrada, { global });
    if (salida) writeFileSync(salida, js); else process.stdout.write(js);
    for (const a of avisos) console.error(`aviso: ${a}`);
    if (salida) console.error(`${modulos} módulos → ${salida} (${js.length} B)`);
  } catch (e) {
    console.error(`ERROR ${e.message}`);
    process.exit(1);
  }
}
