'use strict';

// Guarda todo en el propio navegador (IndexedDB), sin servidor.
// Almacén "data": colecciones en JSON. Almacén "files": fotos y PDF de recibos y contratos.
const DB = (() => {
  let dbPromise;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('arriendos', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('data');
          req.result.createObjectStore('files');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    get: (store, key) => run(store, 'readonly', s => s.get(key)),
    put: (store, key, value) => run(store, 'readwrite', s => s.put(value, key)),
    del: (store, key) => run(store, 'readwrite', s => s.delete(key)),
    keys: store => run(store, 'readonly', s => s.getAllKeys()),
    clear: store => run(store, 'readwrite', s => s.clear()),
  };
})();
