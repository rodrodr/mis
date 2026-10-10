// guardado.js · partidas en IndexedDB con esquema versionado, migraciones, exportar e importar
// (contrato 7, segundo piso; ARSENAL 2.1 #8). localStorage solo para preferencias (precedencia J8).
// Depende de idb-keyval 6.3.0 (≈ 1 kB gz): `npm i idb-keyval@6.3.0`, o un import map a
// https://cdn.jsdelivr.net/npm/idb-keyval@6.3.0/+esm
//
//   import { crearGuardado } from './juego/guardado.js';
//   const partidas = crearGuardado({ nombre: 'mijuego', version: 2, migraciones: {
//     2: (d) => ({ ...d, vidas: d.vidas ?? 3 }),          // de v1 a v2
//   } });
//   await partidas.guardar(estado);                       // ranura 'auto' por defecto
//   const estado = await partidas.cargar();               // migrado a la versión actual, o null
//   const blob = await partidas.exportar();               // JSON para descargar (con permiso del usuario)
//   await partidas.importar(fichero);                      // valida, migra y guarda
//   await partidas.persistir();                           // navigator.storage.persist()
//
// Una partida guardada por una versión MÁS NUEVA del juego no se abre ni se sobrescribe: error claro.

import { createStore, get, set, del, keys } from 'idb-keyval';

export function crearGuardado({ nombre, version = 1, migraciones = {} }) {
  if (!nombre) throw new Error('guardado: falta el nombre del juego');
  const almacen = createStore(`${nombre}-partidas`, 'partidas');

  async function migrar(registro) {
    if (!registro || typeof registro !== 'object' || !('v' in registro) || !('datos' in registro)) throw new Error('guardado: formato desconocido');
    let { v, datos } = registro;
    if (v > version) throw new Error(`guardado: la partida es de la versión ${v} y este juego es la ${version}; actualiza el juego`);
    while (v < version) {
      const m = migraciones[v + 1];
      if (!m) throw new Error(`guardado: falta la migración a la versión ${v + 1}`);
      datos = await m(datos);
      v++;
    }
    return datos;
  }

  return {
    version,
    async guardar(datos, ranura = 'auto') {
      await set(ranura, { juego: nombre, v: version, fecha: new Date().toISOString(), datos }, almacen);
    },
    async cargar(ranura = 'auto') {
      const r = await get(ranura, almacen);
      return r ? migrar(r) : null;
    },
    borrar: (ranura = 'auto') => del(ranura, almacen),
    ranuras: () => keys(almacen),
    async exportar(ranura = 'auto') {
      const r = await get(ranura, almacen);
      if (!r) return null;
      return new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' });
    },
    async importar(fuente, ranura = 'auto') {
      const texto = typeof fuente === 'string' ? fuente : await fuente.text();
      let r;
      try { r = JSON.parse(texto); } catch { throw new Error('guardado: el fichero no es JSON'); }
      if (r.juego && r.juego !== nombre) throw new Error(`guardado: la partida es de «${r.juego}»`);
      const datos = await migrar(r);
      await this.guardar(datos, ranura);
      return datos;
    },
    async persistir() {
      try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
    },
  };
}
