// almacen.js · datos del visitante en IndexedDB (contrato 7, segundo piso), sin dependencias.
// Alternativa a idb-keyval 6.3.0 cuando no hay npm ni CDN (entregable de doble clic, empaquetado con
// empaquetar.mjs) o cuando se quieren migraciones de esquema. Nunca lanza: si IndexedDB falta o se
// niega (ventana privada, file:// en algunos motores, cuota), guarda en memoria para esta visita y
// disponible() lo dice, para avisar al lector de que sus notas no se conservarán.
//
//   import { crearAlmacen } from './almacen.js';
//   const almacen = crearAlmacen('mi-lector', {
//     version: 2,
//     migraciones: { 2: async (a) => { const n = await a.get('notas'); if (n) await a.set('notas', n.map(…)); } },
//   });
//   await almacen.set('posicion', locator);  await almacen.get('posicion');
//   await almacen.del('posicion');  await almacen.claves();  almacen.disponible();  await almacen.persistir();
//
// Esquema versionado: la versión de los DATOS se guarda en la clave «__version»; al abrir, si es menor
// que `version`, se ejecutan en orden las migraciones que faltan (cada una recibe el propio almacén)
// y se anota la nueva. Unos datos de una versión MÁS NUEVA no se tocan: listo() se rechaza con un
// error legible (como guardado.js con una partida de un juego más nuevo).

export function crearAlmacen(nombre, { version = 1, migraciones = {} } = {}) {
  let db = null, falla = false;
  const memoria = new Map();

  const abierta = new Promise((ok) => {
    try {
      const r = indexedDB.open(nombre, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { db = r.result; ok(); };
      r.onerror = () => { falla = true; ok(); };
      r.onblocked = () => { falla = true; ok(); };
    } catch { falla = true; ok(); }
  });

  const tx = (modo, f) => new Promise((ok, ko) => {
    const t = db.transaction('kv', modo);
    const req = f(t.objectStore('kv'));
    t.oncomplete = () => ok(req.result);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error);
  });

  const crudo = {
    async get(k) {
      await abierta;
      if (falla) return memoria.get(k);
      try { return await tx('readonly', (s) => s.get(k)); } catch { return memoria.get(k); }
    },
    async set(k, v) {
      await abierta;
      memoria.set(k, v);
      if (falla) return;
      try { await tx('readwrite', (s) => s.put(v, k)); } catch { /* queda en memoria para esta visita */ }
    },
    async del(k) {
      await abierta;
      memoria.delete(k);
      if (falla) return;
      try { await tx('readwrite', (s) => s.delete(k)); } catch { /* nada */ }
    },
    async claves() {
      await abierta;
      if (falla) return [...memoria.keys()].filter((k) => k !== '__version');
      try { return (await tx('readonly', (s) => s.getAllKeys())).filter((k) => k !== '__version'); } catch { return [...memoria.keys()]; }
    },
  };

  const listo = (async () => {
    await abierta;
    const guardada = await crudo.get('__version');
    const hayDatos = (await crudo.claves()).length > 0;
    const actual = guardada ?? (hayDatos ? 1 : version);   // datos sin versión = v1; almacén vacío = al día
    if (actual > version) throw new Error(`los datos de «${nombre}» son de la versión ${actual}, más nueva que esta página (${version})`);
    for (let v = actual + 1; v <= version; v++) if (migraciones[v]) await migraciones[v](crudo);
    await crudo.set('__version', version);
  })();
  listo.catch(() => {});   // el error se entrega a quien espere; nunca queda una promesa rechazada sin atender

  const trasListo = (f) => async (...a) => { await listo; return f(...a); };
  return {
    listo,
    get: trasListo(crudo.get),
    set: trasListo(crudo.set),
    del: trasListo(crudo.del),
    claves: trasListo(crudo.claves),
    /** ¿Se conservan los datos entre visitas? false = solo en memoria (avísalo en la interfaz). */
    disponible: () => !falla,
    /** Pide al navegador que no borre estos datos bajo presión de espacio (juegos y lectura). */
    persistir: async () => { try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; } },
  };
}
