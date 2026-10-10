// acciones.js · capa de acciones reasignables sobre KeyboardEvent.code (ARSENAL 2.1 #4; precedencia J15).
// Se escucha la POSICIÓN de la tecla (event.code), no la letra (event.key): WASD físico también en
// AZERTY. Solo con el foco dentro del ámbito (la isla, con tabindex="0" y foco visible): las teclas
// del juego no secuestran el scroll ni los atajos de la página. Ratón, táctil y mando: el motor.
//
//   import { crearAcciones } from './juego/acciones.js';
//   const acc = crearAcciones(el, {
//     saltar: ['Space', 'KeyW', 'ArrowUp'], izquierda: ['KeyA', 'ArrowLeft'], derecha: ['KeyD', 'ArrowRight'],
//     pausa: ['Escape', 'KeyP'],
//   }, { signal: ctx.signal, clave: 'acciones-mijuego' });
//   // en cada paso de simulación:
//   if (acc.pulsada('saltar')) …;  if (acc.activa('izquierda')) …;  acc.fin();
//   // pantalla de controles:
//   acc.reasignar('saltar', ['KeyJ']);           // se guarda (preferencia: localStorage, contrato 7)
//   await acc.etiqueta('KeyW');                  // «Z» en AZERTY si el navegador expone el mapa
//
// Reglas: sin modificadores (Ctrl, Cmd, Alt siguen siendo del navegador); nada en campos de texto;
// al perder el foco se sueltan todas (sin teclas atascadas); el listener muere con `signal`.

export function crearAcciones(ambito, mapa, { signal, clave = null } = {}) {
  const defecto = structuredClone(mapa);
  let actual = cargar() ?? structuredClone(mapa);
  let indice = indexar();
  const abajo = new Set();             // códigos pulsados ahora
  const recien = new Set();            // acciones pulsadas desde el último fin()

  function cargar() {
    if (!clave) return null;
    try {
      const g = JSON.parse(localStorage.getItem(clave) || 'null');
      return g && typeof g === 'object' ? { ...structuredClone(mapa), ...g } : null;
    } catch { return null; }
  }
  function guardar() {
    if (!clave) return;
    try { localStorage.setItem(clave, JSON.stringify(actual)); } catch { /* sin almacenamiento: vale para esta visita */ }
  }
  function indexar() {
    const m = new Map();
    for (const [accion, codigos] of Object.entries(actual)) for (const c of codigos) m.set(c, [...(m.get(c) ?? []), accion]);
    return m;
  }
  // campos de texto y controles nativos conservan sus teclas (Espacio y Entrar activan un botón;
  // las flechas mueven un deslizador): la capa solo actúa sobre el propio ámbito o lo no interactivo
  const editable = (t) => t !== ambito && t?.closest?.('input, textarea, select, button, a[href], summary, [contenteditable=""], [contenteditable="true"], [role="button"], [role="slider"]');

  if (ambito.tabIndex < 0 && !ambito.hasAttribute('tabindex')) ambito.tabIndex = 0;
  ambito.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return;
    const acciones = indice.get(e.code);
    if (!acciones) return;
    e.preventDefault();                   // solo las teclas del juego, y solo con el foco dentro
    if (!abajo.has(e.code)) for (const a of acciones) recien.add(a);
    abajo.add(e.code);
  }, { signal });
  ambito.addEventListener('keyup', (e) => { abajo.delete(e.code); }, { signal });
  const soltar = () => abajo.clear();
  ambito.addEventListener('focusout', soltar, { signal });
  window.addEventListener('blur', soltar, { signal });

  return {
    /** ¿Alguna de sus teclas está pulsada ahora? */
    activa: (accion) => (actual[accion] ?? []).some((c) => abajo.has(c)),
    /** ¿Se pulsó desde el último fin()? (flanco: un salto por pulsación) */
    pulsada: (accion) => recien.has(accion),
    /** Llamar al final de cada paso de simulación. */
    fin: () => recien.clear(),
    mapa: () => structuredClone(actual),
    reasignar(accion, codigos) {
      if (!(accion in actual)) throw new Error(`acciones: «${accion}» no existe`);
      actual[accion] = [...codigos];
      indice = indexar();
      guardar();
    },
    restablecer() {
      actual = structuredClone(defecto);
      indice = indexar();
      try { if (clave) localStorage.removeItem(clave); } catch { /* nada */ }
    },
    /** Lo que hay impreso en la tecla con la distribución del usuario (Keyboard Map API, si existe). */
    async etiqueta(codigo) {
      try {
        const m = await navigator.keyboard?.getLayoutMap?.();
        const letra = m?.get(codigo);
        if (letra) return letra.toLocaleUpperCase('es');
      } catch { /* sin permiso o sin API */ }
      const NOMBRES = { ArrowLeft: 'Flecha izquierda', ArrowRight: 'Flecha derecha', ArrowUp: 'Flecha arriba', ArrowDown: 'Flecha abajo',
        Space: 'Espacio', Enter: 'Entrar', Escape: 'Esc', Backspace: 'Retroceso', Tab: 'Tabulador', ShiftLeft: 'Mayúsculas', ShiftRight: 'Mayúsculas' };
      return NOMBRES[codigo] ?? codigo.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Numérico ');
    },
  };
}
