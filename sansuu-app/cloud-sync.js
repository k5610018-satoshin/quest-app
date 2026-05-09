/* ============================================================
 * Cloud Sync for sansuu-app
 * GAS doPost / doGet を経由して Spreadsheet + Supabase 両方へ同期
 * 設定:
 *   localStorage 'sansuuApp_syncConfig' = { endpoint: '...', apiKey: '...' }
 * 設定ページ: setup-gas.html（別途）
 * ============================================================ */
(() => {
  'use strict';

  const SYNC_CONFIG_KEY = 'sansuuApp_syncConfig';
  const PENDING_KEY = 'sansuuApp_pendingQueue';
  const LAST_SYNC_KEY = 'sansuuApp_lastSync';
  const TIMEOUT_MS = 12000;

  function getConfig() {
    try {
      return JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY) || '{}');
    } catch { return {}; }
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c.endpoint && c.apiKey);
  }

  function getPending() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    } catch { return []; }
  }

  function setPending(arr) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(arr));
  }

  function pushPending(item) {
    const list = getPending();
    list.push({ ...item, queued_at: new Date().toISOString() });
    setPending(list);
    if (window.IDBStorage && window.IDBStorage.savePending) {
      window.IDBStorage.savePending(list).catch(() => {});
    }
  }

  function fetchWithTimeout(url, options) {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
      fetch(url, { ...options, signal: controller.signal })
        .then(r => { clearTimeout(tid); resolve(r); })
        .catch(e => { clearTimeout(tid); reject(e); });
    });
  }

  async function push(table, action, data) {
    const cfg = getConfig();
    if (!cfg.endpoint || !cfg.apiKey) {
      pushPending({ table, action, data });
      return { ok: false, reason: 'not_configured', queued: true };
    }
    if (!navigator.onLine) {
      pushPending({ table, action, data });
      return { ok: false, reason: 'offline', queued: true };
    }
    const body = { apiKey: cfg.apiKey, table, action, data };
    try {
      const res = await fetchWithTimeout(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.ok) {
        localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
        return json;
      }
      pushPending({ table, action, data });
      return { ok: false, reason: 'server_error', error: json.error, queued: true };
    } catch (err) {
      pushPending({ table, action, data });
      return { ok: false, reason: 'network', error: String(err), queued: true };
    }
  }

  async function pull(action, params) {
    const cfg = getConfig();
    if (!cfg.endpoint || !cfg.apiKey) {
      return { ok: false, reason: 'not_configured' };
    }
    if (!navigator.onLine) {
      return { ok: false, reason: 'offline' };
    }
    const url = new URL(cfg.endpoint);
    url.searchParams.set('action', action);
    url.searchParams.set('key', cfg.apiKey);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== null && v !== undefined) url.searchParams.set(k, v);
    });
    try {
      const res = await fetchWithTimeout(url.toString(), { method: 'GET' });
      const json = await res.json();
      return json;
    } catch (err) {
      return { ok: false, reason: 'network', error: String(err) };
    }
  }

  async function flushPending() {
    const list = getPending();
    if (list.length === 0) return { flushed: 0 };
    const remaining = [];
    let flushed = 0;
    for (const item of list) {
      const result = await push(item.table, item.action, item.data);
      if (result.ok) flushed++;
      else remaining.push(item);
    }
    setPending(remaining);
    return { flushed, remaining: remaining.length };
  }

  // オンライン復帰で自動フラッシュ
  window.addEventListener('online', () => {
    setTimeout(flushPending, 500);
  });

  // 起動時に1回フラッシュ試行
  setTimeout(() => {
    if (navigator.onLine && isConfigured()) flushPending();
  }, 2000);

  window.CloudSync = {
    isConfigured,
    getConfig,
    push,
    pull,
    flushPending,
    getPending
  };
})();
