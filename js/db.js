// Almacenamiento local en IndexedDB: las fotos y los datos se quedan en el dispositivo.

const DB_NAME = 'vestidor';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('outfits')) db.createObjectStore('outfits', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  all: store => run(store, 'readonly', s => s.getAll()),
  get: (store, key) => run(store, 'readonly', s => s.get(key)),
  put: (store, value) => run(store, 'readwrite', s => s.put(value)),
  putMany: (store, values) => run(store, 'readwrite', s => { values.forEach(v => s.put(v)); }),
  delete: (store, key) => run(store, 'readwrite', s => s.delete(key)),
  clear: store => run(store, 'readwrite', s => s.clear()),
  async getPref(key, fallback) {
    const row = await this.get('prefs', key);
    return row ? row.value : fallback;
  },
  setPref: (key, value) => db.put('prefs', { key, value }),
};

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
