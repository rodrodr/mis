// bucle.js · simulación a paso fijo con acumulador (ARSENAL 2.1 #1; Gaffer on Games, «Fix your timestep»).
// El juego se comporta igual a 30, 60 y 144 Hz: la simulación avanza en pasos iguales y el dibujo
// interpola entre el estado anterior y el actual con alfa ∈ [0, 1).
//
//   import { pasoFijo } from './juego/bucle.js';
//   const paso = pasoFijo({ hz: 60, actualizar: (dt) => mundo.avanzar(dt), dibujar: (alfa) => pintar(alfa) });
//   ctx.loop((t, dtMs) => paso(dtMs));                         // canvas propio: el bucle de la isla
//   app.ticker.add((tk) => paso(tk.deltaMS));                  // Pixi: su Ticker
//   renderer.setAnimationLoop(() => paso(reloj.getDelta() * 1000));   // three
// Phaser ya trae paso fijo en su física (Arcade `fixedStep`, activo por defecto): no se usa aquí.
//
// Sin dependencias ni DOM: se prueba en Node (pruebas/prueba_juego.py).

/**
 * @param {{ hz?: number, maxPasos?: number, actualizar: (dt: number) => void, dibujar?: (alfa: number) => void }} o
 *   hz: pasos por segundo de la simulación; maxPasos: tope por frame (evita la espiral de la muerte
 *   tras una pausa larga o un frame lentísimo: el retraso que sobra se descarta).
 * @returns {(dtMs: number) => number} función a llamar en cada frame con los ms transcurridos;
 *   devuelve cuántos pasos de simulación ejecutó.
 */
export function pasoFijo({ hz = 60, maxPasos = 5, actualizar, dibujar = () => {} }) {
  const paso = 1000 / hz;
  let acumulado = 0;
  return (dtMs) => {
    acumulado += Math.max(0, Math.min(dtMs || 0, paso * maxPasos));
    let n = 0;
    while (acumulado >= paso && n < maxPasos) {
      actualizar(paso / 1000);            // dt en segundos, siempre el mismo
      acumulado -= paso;
      n++;
    }
    if (n === maxPasos && acumulado >= paso) acumulado = 0;   // espiral de la muerte: se suelta el retraso
    dibujar(acumulado / paso);
    return n;
  };
}

/** PRNG sembrado (mulberry32): la misma semilla da la misma partida. Nada de Math.random en la simulación. */
export function azar(semilla = 1) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
