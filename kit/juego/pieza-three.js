// pieza-three.js · PLANTILLA de isla para three 0.186 (contrato 3; tipos/juego.md y la fila
// «Experiencia inmersiva» de SKILL.md). Cópiala y cambia la escena.
//   <maestro-isla pieza="escena3d" pausa-sin-foco> …póster (img) y HTML real… </maestro-isla>
//   registrar('escena3d', () => import('./juego/pieza-three.js'));
// Probada en pruebas/prueba_juego.py: monta, dibuja, lee el color de los tokens, se pausa y destroy()
// no deja rAF, listeners, ResizeObserver, contexto WebGL ni nodos de audio conectados.
//
// Bucle: renderer.setAnimationLoop (el de three, necesario para WebXR); pause() lo quita. Simulación
// a paso fijo (bucle.js). Colores: new THREE.Color(ctx.hex('--token')) (three pasa el sRGB a lineal
// solo); con ctx.color() three avisa «Unknown color model» y deja el color sin cambiar.
// Audio: el AudioContext compartido del bus y el AudioListener reconectado a salidaMaestra(); se crea
// en el primer gesto dentro de la isla (política de reproducción automática).
// WebGL2 + ShaderMaterial si cabe; three/webgpu + TSL si hay compute (precedencia J11).

import * as THREE from 'three';
import { audioContext, salidaMaestra } from '../feedback.js';
import { pasoFijo } from './bucle.js';

export function mount(el, ctx) {
  const lienzo = el.querySelector('[data-lienzo]') ?? el;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(ctx.dpr());
  renderer.domElement.setAttribute('aria-hidden', 'true');
  lienzo.prepend(renderer.domElement);

  const estado = (window.__juego = { motor: 'three', frames: 0, resizes: 0, hex: 0, color_motor: null, destruida: false });
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  camara.position.set(0, 0, 4);
  const geometria = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.6 });
  const malla = new THREE.Mesh(geometria, material);
  const luz = new THREE.DirectionalLight(0xffffff, 2.2);
  luz.position.set(2, 3, 4);
  escena.add(malla, luz, new THREE.AmbientLight(0xffffff, 0.5));

  const leerColores = () => {
    estado.hex = ctx.hex('--color-accent-solid');
    material.color.set(estado.hex);            // número sRGB → lineal (gestión de color de three)
    estado.color_motor = material.color.getHex();
  };
  leerColores();

  let reducido = ctx.reduced();
  let angulo = 0, anterior = 0;
  const paso = pasoFijo({
    actualizar: (dt) => { anterior = angulo; angulo += reducido ? 0 : dt * 0.6; },
    dibujar: (alfa) => { malla.rotation.set(0.4, anterior + (angulo - anterior) * alfa, 0); renderer.render(escena, camara); },
  });
  const reloj = new THREE.Timer();             // three ≥ r168: sustituye a Clock
  const bucle = () => { reloj.update(); estado.frames++; paso(reloj.getDelta() * 1000); };
  const pintar = () => { malla.rotation.set(0.4, angulo, 0); renderer.render(escena, camara); };

  const medir = () => {
    const w = lienzo.clientWidth || 300, h = lienzo.clientHeight || 150;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
    pintar();
  };
  const ro = new ResizeObserver(() => { estado.resizes++; medir(); });
  ro.observe(lienzo);
  medir();

  // audio en el primer gesto dentro de la isla, por el bus (limitador incluido)
  let oyente = null;
  el.addEventListener('pointerdown', () => {
    if (oyente) return;
    const ac = audioContext();
    if (!ac) return;
    THREE.AudioContext.setContext(ac);
    oyente = new THREE.AudioListener();         // se conecta a ac.destination al crearse…
    oyente.gain.disconnect();
    oyente.gain.connect(salidaMaestra());       // …y se pasa al bus maestro
    camara.add(oyente);
  }, { signal: ctx.signal });

  const arrancar = () => renderer.setAnimationLoop(reducido ? null : bucle);
  arrancar();

  return {
    pause() { renderer.setAnimationLoop(null); },
    resume() { reloj.reset?.(); arrancar(); if (reducido) pintar(); },
    theme() { leerColores(); pintar(); },
    motion(r) { reducido = r; arrancar(); pintar(); },
    destroy() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      if (oyente) { oyente.gain.disconnect(); camara.remove(oyente); }
      geometria.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();               // dispose() no suelta el contexto: el navegador tiene un cupo
      renderer.domElement.remove();
      estado.destruida = true;
    },
  };
}
