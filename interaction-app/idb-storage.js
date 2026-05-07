'use strict';
/* ==========================================================================
 * idb-storage.js — IndexedDB 二重化バックアップ
 *
 * 目的:
 *   localStorage と並行して state JSON を IndexedDB にも書き込み、
 *   localStorage が消えた場合の最後の砦にする。
 *
 * 動作:
 *   - saveState() の最後に idbSaveState(json) が fire-and-forget で発火
 *   - 起動時 init() で idbCheckAndRestore() が呼ばれ、
 *     IDB の方がローカルより件数が多ければ不足分を ID マージで補完
 *
 * 容量:
 *   IndexedDB はディスク容量の数十%まで使える(localStorage 5-10MBの数百倍)
 *
 * 永続性:
 *   ブラウザの「閲覧履歴データの削除」で「Cookie/サイトデータ」を選んだ場合は
 *   localStorage と一緒に消える可能性あり。ただし容量大なので保護対象になりやすい。
 *   多くの設定ではブラウザ閉じた程度では消えない。
 *
 * 公開API (window グローバル):
 *   - idbSaveState(jsonStr): Promise<void> ─ JSON文字列を保存
 *   - idbLoadState(): Promise<{ts, json}|null> ─ 保存済みstateを読み込み
 *   - idbGetCounts(): Promise<{records,praises,...}|null> ─ レコード件数を返す
 *   - idbDeleteAll(): Promise<void> ─ デバッグ用、全削除
 * ========================================================================== */

(function() {

const DB_NAME = 'interactionApp';
const DB_VERSION = 1;
const STORE = 'appState';
const KEY = 'current';

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  if (!window.indexedDB) {
    console.warn('[idb] IndexedDB が利用不可');
    return Promise.resolve(null);
  }
  _dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      console.warn('[idb] open 例外:', e);
      _dbPromise = null;
      resolve(null);
      return;
    }
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn('[idb] open 失敗:', req.error && req.error.message);
      _dbPromise = null;
      resolve(null);
    };
    req.onblocked = () => {
      console.warn('[idb] open blocked - 別タブで古いバージョン使用中');
      resolve(null);
    };
  });
  return _dbPromise;
}

async function idbSaveState(jsonStr) {
  try {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE], 'readwrite');
        const store = tx.objectStore(STORE);
        const wrapped = { ts: new Date().toISOString(), json: jsonStr };
        store.put(wrapped, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          console.warn('[idb] save 失敗:', tx.error && tx.error.message);
          resolve();
        };
        tx.onabort = () => {
          console.warn('[idb] save abort:', tx.error && tx.error.message);
          resolve();
        };
      } catch (e) {
        console.warn('[idb] tx 失敗:', e);
        resolve();
      }
    });
  } catch (e) {
    console.warn('[idb] save 例外:', e);
  }
}

async function idbLoadState() {
  try {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE], 'readonly');
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () => {
          const v = req.result;
          if (!v || !v.json) { resolve(null); return; }
          resolve(v); // {ts, json}
        };
        req.onerror = () => {
          console.warn('[idb] load 失敗:', req.error && req.error.message);
          resolve(null);
        };
      } catch (e) {
        console.warn('[idb] load tx 失敗:', e);
        resolve(null);
      }
    });
  } catch (e) {
    console.warn('[idb] load 例外:', e);
    return null;
  }
}

async function idbGetCounts() {
  const wrapped = await idbLoadState();
  if (!wrapped || !wrapped.json) return null;
  try {
    const data = JSON.parse(wrapped.json);
    return {
      ts: wrapped.ts,
      records: (data.records || []).length,
      praises: (data.praises || []).length,
      evaluations: (data.evaluations || []).length,
      abaRecords: (data.abaRecords || []).length,
      ketebureRecords: (data.ketebureRecords || []).length,
      seatingSnapshots: (data.seatingSnapshots || []).length
    };
  } catch (_) { return null; }
}

async function idbDeleteAll() {
  try {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction([STORE], 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (_) {}
}

window.idbSaveState = idbSaveState;
window.idbLoadState = idbLoadState;
window.idbGetCounts = idbGetCounts;
window.idbDeleteAll = idbDeleteAll;

// 起動時にウォームアップ (初回 onupgradeneeded を済ませる)
openDb();

})();
