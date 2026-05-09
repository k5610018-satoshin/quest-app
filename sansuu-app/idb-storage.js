/* ============================================================
 * IndexedDB Storage for sansuu-app
 * v0.1 では pendingQueue の冗長化（L2）として最低限のラッパー
 * v0.2 で state 全体の冗長化に拡張する
 * ============================================================ */
(() => {
  'use strict';

  const DB_NAME = 'sansuuApp';
  const DB_VERSION = 1;
  const STORE_PENDING = 'pendingQueue';
  const STORE_STATE = 'appState';

  let _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_PENDING)) {
          db.createObjectStore(STORE_PENDING, { keyPath: 'queued_at' });
        }
        if (!db.objectStoreNames.contains(STORE_STATE)) {
          db.createObjectStore(STORE_STATE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function _tx(store, mode) {
    return openDB().then(db => db.transaction(store, mode).objectStore(store));
  }

  async function savePending(items) {
    const store = await _tx(STORE_PENDING, 'readwrite');
    return new Promise((resolve, reject) => {
      // クリアしてから一括投入
      store.clear();
      let remain = items.length;
      if (remain === 0) return resolve();
      items.forEach(it => {
        const req = store.put(it);
        req.onsuccess = () => { if (--remain === 0) resolve(); };
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function loadPending() {
    const store = await _tx(STORE_PENDING, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveAppState(state) {
    const store = await _tx(STORE_STATE, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({ ts: new Date().toISOString(), data: state }, 'current');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function loadAppState() {
    const store = await _tx(STORE_STATE, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get('current');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  window.IDBStorage = { savePending, loadPending, saveAppState, loadAppState };
})();
