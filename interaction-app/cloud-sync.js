'use strict';
/* ==========================================================================
 * cloud-sync.js — 交友関係記録アプリ クラウド同期モジュール
 *
 * 依存: app.js の state, saveState, showToast, normalizeRecord が定義済みであること
 * ロード順: <script src="cloud-sync.js"> は app.js の後に置くこと
 * ========================================================================== */

// ===== 設定キー =====
const SYNC_STORAGE_KEY  = 'interactionApp_gasSync';
const PENDING_QUEUE_KEY = 'interactionApp_pendingQueue';
const LAST_PULL_KEY     = 'interactionApp_lastPull';

// ===== 同期設定 (デフォルト値・初回起動時に自動適用) =====
// 個人版: APP_CONFIG.defaultSync から GAS URL/APIキーを取得（ハードコード）
// 配布版: defaultSync は空 → ユーザーが設定タブで手入力
const _CFG_SYNC = (window.APP_CONFIG && window.APP_CONFIG.defaultSync) || { endpoint: '', apiKey: '' };
const _IS_PERSONAL = (window.APP_CONFIG && window.APP_CONFIG.mode === 'personal');
const DEFAULT_SYNC = {
  enabled:  _IS_PERSONAL && !!_CFG_SYNC.endpoint,
  endpoint: _CFG_SYNC.endpoint || '',
  apiKey:   _CFG_SYNC.apiKey   || '',
  autoSync: _IS_PERSONAL && !!_CFG_SYNC.endpoint
};
const syncConfig = { ...DEFAULT_SYNC };

// 自動同期タイマー
let _autoSyncTimer = null;
let _isSyncing = false;
let _deviceId = null;

// ===== 初期化 =====

function initCloudSync() {
  _deviceId = getOrCreateDeviceId();
  loadSyncConfig();
  renderSyncUI();
  bindSyncEvents();

  if (syncConfig.enabled && syncConfig.endpoint) {
    // 起動時に差分pull
    pullFromGas().catch(err => console.warn('[sync] 起動時pull失敗:', err.message));
  }

  if (syncConfig.autoSync) {
    startAutoSync();
  }

  // オンライン復帰時にpending送信
  window.addEventListener('online', () => {
    showSyncStatus('オンライン復帰');
    flushPendingQueue();
  });
}

// ===== デバイスID =====

function getOrCreateDeviceId() {
  let id = localStorage.getItem('interactionApp_deviceId');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('interactionApp_deviceId', id);
  }
  return id;
}

// ===== 設定の読み書き =====

function loadSyncConfig() {
  // 個人版: endpoint/apiKey は常にデフォルト値を強制使用（過去の手動入力ミスを上書き）。
  // 配布版: localStorageが正、未設定ならDEFAULT_SYNC（空）。各先生がGAS URL/APIキーを設定。
  if (_IS_PERSONAL) {
    syncConfig.endpoint = DEFAULT_SYNC.endpoint;
    syncConfig.apiKey   = DEFAULT_SYNC.apiKey;
  }
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (!_IS_PERSONAL) {
        // 配布版のみendpoint/apiKeyを復元
        if (typeof saved.endpoint === 'string') syncConfig.endpoint = saved.endpoint;
        if (typeof saved.apiKey   === 'string') syncConfig.apiKey   = saved.apiKey;
      }
      if (typeof saved.enabled  === 'boolean') syncConfig.enabled  = saved.enabled;
      if (typeof saved.autoSync === 'boolean') syncConfig.autoSync = saved.autoSync;
    }
  } catch (_) {}
  saveSyncConfig();
}

function saveSyncConfig() {
  localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(syncConfig));
}

// ===== UI レンダリング =====

function renderSyncUI() {
  const container = document.getElementById('syncSettingsCard');
  if (!container) return;

  const lastPull = localStorage.getItem(LAST_PULL_KEY);
  const lastPullText = lastPull
    ? new Date(lastPull).toLocaleString('ja-JP')
    : '未実行';

  container.innerHTML = `
    <h3>クラウド同期 (GAS)</h3>
    <p class="muted">Google Sheetsにリアルタイム保存。複数PC間で自動同期されます。</p>

    <div class="sync-row">
      <label>エンドポイントURL</label>
      <input type="url" id="syncEndpointInput" placeholder="https://script.google.com/macros/s/..." value="${escapeAttr(syncConfig.endpoint)}">
    </div>
    <div class="sync-row">
      <label>APIキー</label>
      <input type="password" id="syncApiKeyInput" placeholder="Script Propertiesに設定したキー" value="${escapeAttr(syncConfig.apiKey)}">
    </div>
    <div class="sync-row sync-row-toggle">
      <label for="syncEnabledToggle">同期を有効にする</label>
      <label class="toggle-switch">
        <input type="checkbox" id="syncEnabledToggle" ${syncConfig.enabled ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="sync-row sync-row-toggle">
      <label for="syncAutoToggle">自動同期（5分ごと）</label>
      <label class="toggle-switch">
        <input type="checkbox" id="syncAutoToggle" ${syncConfig.autoSync ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="sync-row" style="margin-top:8px">
      <button class="primary" id="syncNowBtn">今すぐ同期</button>
      <button class="ghost" id="syncPushAllBtn" title="ローカルの全記録をGASへ送る（初回移行用）">全件アップロード</button>
    </div>
    <div class="sync-status-row">
      <span class="muted small">最終同期: <span id="syncLastPullTime">${lastPullText}</span></span>
      <span id="syncStatusBadge" class="sync-badge"></span>
    </div>
    <div id="syncLog" class="sync-log muted small"></div>
  `;
}

function bindSyncEvents() {
  document.addEventListener('click', e => {
    if (e.target.id === 'syncNowBtn') {
      saveSyncInputs();
      syncNow();
    } else if (e.target.id === 'syncPushAllBtn') {
      saveSyncInputs();
      pushAllRecords();
    }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'syncEnabledToggle') {
      saveSyncInputs();
      if (syncConfig.enabled && !syncConfig.autoSync) {
        pullFromGas().catch(console.warn);
      }
    } else if (e.target.id === 'syncAutoToggle') {
      saveSyncInputs();
      if (syncConfig.autoSync) startAutoSync();
      else stopAutoSync();
    }
  });
}

function saveSyncInputs() {
  const endpointEl = document.getElementById('syncEndpointInput');
  const apiKeyEl   = document.getElementById('syncApiKeyInput');
  const enabledEl  = document.getElementById('syncEnabledToggle');
  const autoEl     = document.getElementById('syncAutoToggle');
  if (endpointEl) syncConfig.endpoint = endpointEl.value.trim();
  if (apiKeyEl)   syncConfig.apiKey   = apiKeyEl.value.trim();
  if (enabledEl)  syncConfig.enabled  = enabledEl.checked;
  if (autoEl)     syncConfig.autoSync = autoEl.checked;
  saveSyncConfig();
}

// ===== ステータス表示 =====

function showSyncStatus(msg, isError) {
  const badge = document.getElementById('syncStatusBadge');
  const log   = document.getElementById('syncLog');
  if (badge) {
    badge.textContent = isError ? '⚠ エラー' : '✓ 同期済';
    badge.className = 'sync-badge ' + (isError ? 'sync-badge-error' : 'sync-badge-ok');
  }
  if (log) {
    const time = new Date().toLocaleTimeString('ja-JP');
    log.textContent = `[${time}] ${msg}`;
  }
}

function updateLastPullTime() {
  const now = new Date().toISOString();
  localStorage.setItem(LAST_PULL_KEY, now);
  const el = document.getElementById('syncLastPullTime');
  if (el) el.textContent = new Date(now).toLocaleString('ja-JP');
}

// ===== メイン同期ロジック =====

async function syncNow() {
  if (!checkSyncReady()) return;
  showSyncStatus('同期中…');
  try {
    await flushPendingQueue();
    await pullFromGas();
    showSyncStatus('同期完了');
  } catch (err) {
    showSyncStatus('同期エラー: ' + err.message, true);
  }
}

async function pullFromGas() {
  if (!checkSyncReady()) return;
  const since = localStorage.getItem(LAST_PULL_KEY) || '2000-01-01T00:00:00.000Z';
  // dataType=all で records, praises, evaluations, aba を一括取得
  const url = `${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}&since=${encodeURIComponent(since)}&deviceId=${encodeURIComponent(_deviceId)}&dataType=all`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'GAS error');

  // ===== 交友関係レコード =====
  const pulledRecs = data.records || [];
  let mergedRecs = 0;
  const existingRecIds = new Set(state.records.map(r => r.id));
  for (const r of pulledRecs) {
    if (String(r.deleted) === '1') continue;
    if (existingRecIds.has(r.id)) continue;
    const n = normalizeRecord(r);
    if (n) { state.records.push(n); mergedRecs++; }
  }

  // ===== ほめたい =====
  const pulledPraises = data.praises || [];
  let mergedPraises = 0;
  if (Array.isArray(state.praises)) {
    const existingPrIds = new Set(state.praises.map(p => p.id));
    for (const p of pulledPraises) {
      if (String(p.deleted) === '1') continue;
      if (existingPrIds.has(p.id)) continue;
      const n = (typeof normalizePraise === 'function') ? normalizePraise(p) : p;
      if (n) { state.praises.push(n); mergedPraises++; }
    }
  }

  // ===== 評価 =====
  const pulledEvals = data.evaluations || [];
  let mergedEvals = 0;
  if (Array.isArray(state.evaluations)) {
    const existingEvIds = new Set(state.evaluations.map(e => e.id));
    for (const e of pulledEvals) {
      if (String(e.deleted) === '1') continue;
      if (existingEvIds.has(e.id)) continue;
      const n = (typeof normalizeEvaluation === 'function') ? normalizeEvaluation(e) : e;
      if (n) { state.evaluations.push(n); mergedEvals++; }
    }
  }

  // ===== ABA =====
  const pulledAba = data.abaRecords || [];
  let mergedAba = 0;
  if (Array.isArray(state.abaRecords)) {
    const existingAbaIds = new Set(state.abaRecords.map(r => r.id));
    for (const r of pulledAba) {
      if (String(r.deleted) === '1') continue;
      if (existingAbaIds.has(r.id)) continue;
      // behaviorsはJSON文字列の場合パース
      if (typeof r.behaviors === 'string' && r.behaviors) {
        try { r.behaviors = JSON.parse(r.behaviors); } catch(_) { r.behaviors = [r.behaviors]; }
      }
      const n = (typeof normalizeAba === 'function') ? normalizeAba(r) : r;
      if (n) { state.abaRecords.push(n); mergedAba++; }
    }
  }

  if (mergedRecs > 0 || mergedPraises > 0 || mergedEvals > 0 || mergedAba > 0) {
    saveState();
    if (typeof refreshAll === 'function') refreshAll();
  }
  updateLastPullTime();
  if (mergedRecs > 0 || mergedPraises > 0 || mergedEvals > 0 || mergedAba > 0) {
    const parts = [];
    if (mergedRecs > 0) parts.push(`記録 ${mergedRecs}件`);
    if (mergedPraises > 0) parts.push(`ほめ ${mergedPraises}件`);
    if (mergedEvals > 0) parts.push(`評価 ${mergedEvals}件`);
    if (mergedAba > 0) parts.push(`ABA ${mergedAba}件`);
    showSyncStatus(`新規 ${parts.join(' / ')} を取得`);
  }
}

// ===== ほめたい push =====

async function pushPraiseToGas(praise, action) {
  if (!checkSyncReady()) return false;
  if (!navigator.onLine) {
    addToPendingQueue({ action: action || 'add', praise, dataType: 'praise' });
    return false;
  }
  try {
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: action || 'add',
        dataType: 'praise',
        praise,
        deviceId: _deviceId
      })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'GAS error');
    return true;
  } catch (err) {
    console.warn('[sync] praise push失敗、キューへ:', err.message);
    addToPendingQueue({ action: action || 'add', praise, dataType: 'praise' });
    return false;
  }
}

// ===== けテぶれ push (GAS未対応の場合は安全にキュー) =====

async function pushKetebureToGas(rec, action) {
  if (!checkSyncReady()) return false;
  if (!navigator.onLine) {
    addToPendingQueue({ action: action || 'add', ketebure: rec, dataType: 'ketebure' });
    return false;
  }
  try {
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: action || 'add',
        dataType: 'ketebure',
        ketebure: rec,
        deviceId: _deviceId
      })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'GAS error');
    return true;
  } catch (err) {
    // GAS側がketebure未対応でもアプリ側はローカル保存できているのでwarnのみ
    console.warn('[sync] ketebure push失敗（GAS未対応の可能性、ローカル保存はOK）:', err.message);
    return false;
  }
}

// ===== ABA push/pull =====

async function pushAbaToGas(rec, action) {
  if (!checkSyncReady()) return false;
  if (!navigator.onLine) {
    addToPendingQueue({ action: action || 'add', aba: rec, dataType: 'aba' });
    return false;
  }
  try {
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: action || 'add',
        dataType: 'aba',
        aba: rec,
        deviceId: _deviceId
      })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'GAS error');
    return true;
  } catch (err) {
    console.warn('[sync] aba push失敗:', err.message);
    addToPendingQueue({ action: action || 'add', aba: rec, dataType: 'aba' });
    return false;
  }
}

async function pushAllAba() {
  if (!checkSyncReady()) return;
  if (!Array.isArray(state.abaRecords) || state.abaRecords.length === 0) {
    showToast('送信するABA記録がありません', 'error');
    return;
  }
  if (_isSyncing) return;
  _isSyncing = true;
  showSyncStatus(`ABA全${state.abaRecords.length}件送信中…`);
  try {
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'bulk_add',
        dataType: 'aba',
        abaRecords: state.abaRecords,
        deviceId: _deviceId
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    showSyncStatus(`ABA送信完了: ${data.added}件追加 / ${data.skipped}件重複`);
  } catch (err) {
    showSyncStatus('ABA送信失敗: ' + err.message, true);
  } finally {
    _isSyncing = false;
  }
}

// ===== 評価 push/pull =====

function enrichEvaluation(ev) {
  // GASマトリクスシート用に学生名・単元名を付与
  const s = state.students.find(x => x.id === ev.studentId);
  const u = state.units && state.units.find(x => x.id === ev.unitId);
  return Object.assign({}, ev, {
    studentName: s ? s.name : '',
    unitName: u ? u.name : ev.unitId
  });
}

async function pushEvaluationToGas(evaluation, action) {
  if (!checkSyncReady()) return false;
  if (!navigator.onLine) {
    addToPendingQueue({ action: action || 'add', evaluation, dataType: 'evaluation' });
    return false;
  }
  const payload = action === 'delete' ? evaluation : enrichEvaluation(evaluation);
  try {
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: action || 'add',
        dataType: 'evaluation',
        evaluation: payload,
        deviceId: _deviceId
      })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'GAS error');
    return true;
  } catch (err) {
    console.warn('[sync] evaluation push失敗:', err.message);
    addToPendingQueue({ action: action || 'add', evaluation, dataType: 'evaluation' });
    return false;
  }
}

async function pushAllEvaluations() {
  if (!checkSyncReady()) return;
  if (!Array.isArray(state.evaluations) || state.evaluations.length === 0) {
    showToast('送信する評価がありません', 'error');
    return;
  }
  if (_isSyncing) return;
  _isSyncing = true;
  showSyncStatus(`評価全${state.evaluations.length}件送信中…`);
  try {
    const enriched = state.evaluations.map(enrichEvaluation);
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'bulk_add',
        dataType: 'evaluation',
        evaluations: enriched,
        deviceId: _deviceId
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    showSyncStatus(`評価送信完了: ${data.added}件追加 / ${data.skipped}件重複`);
  } catch (err) {
    showSyncStatus('評価送信失敗: ' + err.message, true);
  } finally {
    _isSyncing = false;
  }
}

async function pushAllPraises() {
  if (!checkSyncReady()) return;
  if (!Array.isArray(state.praises) || state.praises.length === 0) {
    showToast('送信するほめ記録がありません', 'error');
    return;
  }
  if (_isSyncing) return;
  _isSyncing = true;
  showSyncStatus(`ほめ全${state.praises.length}件送信中…`);
  try {
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'bulk_add',
        dataType: 'praise',
        praises: state.praises,
        deviceId: _deviceId
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    showSyncStatus(`ほめ送信完了: ${data.added}件追加 / ${data.skipped}件重複`);
  } catch (err) {
    showSyncStatus('ほめ送信失敗: ' + err.message, true);
  } finally {
    _isSyncing = false;
  }
}

async function pushRecordToGas(record, action) {
  if (!checkSyncReady()) return false;
  if (!navigator.onLine) {
    addToPendingQueue({ action: action || 'add', record });
    return false;
  }
  try {
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: action || 'add',
        record,
        deviceId: _deviceId
      })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'GAS error');
    return true;
  } catch (err) {
    console.warn('[sync] push失敗、キューへ:', err.message);
    addToPendingQueue({ action: action || 'add', record });
    showSyncStatus('オフライン中(自動再試行します)', true);
    return false;
  }
}

async function pushAllRecords() {
  if (!checkSyncReady()) return;
  if (state.records.length === 0) {
    showToast('送信する記録がありません', 'error');
    return;
  }
  if (_isSyncing) return;
  _isSyncing = true;
  showSyncStatus(`全${state.records.length}件送信中…`);
  try {
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'bulk_add',
        records: state.records,
        deviceId: _deviceId
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    showSyncStatus(`送信完了: ${data.added}件追加 / ${data.skipped}件重複スキップ`);
    updateLastPullTime();
  } catch (err) {
    showSyncStatus('送信失敗: ' + err.message, true);
  } finally {
    _isSyncing = false;
  }
}

// ===== Pending Queue =====

function addToPendingQueue(op) {
  let queue = loadPendingQueue();
  queue.push({ ...op, queuedAt: new Date().toISOString() });
  // 最大200件まで
  if (queue.length > 200) queue = queue.slice(-200);
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
}

function loadPendingQueue() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_QUEUE_KEY) || '[]');
  } catch (_) { return []; }
}

async function flushPendingQueue() {
  if (!checkSyncReady() || !navigator.onLine) return;
  let queue = loadPendingQueue();
  if (queue.length === 0) return;
  const toSend = queue;
  // キューを先にクリア（楽観的）
  localStorage.removeItem(PENDING_QUEUE_KEY);
  let failed = [];
  for (const op of toSend) {
    try {
      const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...op, deviceId: _deviceId })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
    } catch (err) {
      failed.push(op);
    }
  }
  if (failed.length > 0) {
    // 失敗分は再キュー
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(failed));
    showSyncStatus(`${failed.length}件の送信に失敗（自動再試行）`, true);
  } else if (toSend.length > 0) {
    showSyncStatus(`${toSend.length}件の保留済みデータを送信しました`);
  }
}

// ===== 自動同期 =====

function startAutoSync() {
  stopAutoSync();
  _autoSyncTimer = setInterval(() => {
    if (syncConfig.enabled && navigator.onLine) {
      flushPendingQueue().then(() => pullFromGas()).catch(console.warn);
    }
  }, 5 * 60 * 1000); // 5分
}

function stopAutoSync() {
  if (_autoSyncTimer) { clearInterval(_autoSyncTimer); _autoSyncTimer = null; }
}

// ===== ヘルパー =====

function checkSyncReady() {
  if (!syncConfig.enabled) return false;
  if (!syncConfig.endpoint || !syncConfig.apiKey) {
    showToast('同期設定が未入力です（設定タブ > クラウド同期）', 'error');
    return false;
  }
  return true;
}

function escapeAttr(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;');
}

// ===== app.js の saveRecord をラップ =====
// DOMContentLoaded 後に既存関数を拡張する

function patchSaveRecordForSync() {
  const _orig = window.saveRecord;
  if (typeof _orig !== 'function') return;
  window.saveRecord = function() {
    const beforeLen = state.records.length;
    _orig.call(this);
    const afterLen = state.records.length;
    if (afterLen > beforeLen && syncConfig.enabled) {
      const newRec = state.records[state.records.length - 1];
      pushRecordToGas(newRec, 'add').catch(console.warn);
    }
  };
}

// ===== スタイル注入 =====

function injectSyncStyles() {
  if (document.getElementById('syncStyles')) return;
  const style = document.createElement('style');
  style.id = 'syncStyles';
  style.textContent = `
    .sync-row { display:flex; align-items:center; gap:8px; margin:8px 0; }
    .sync-row label:first-child { min-width:120px; font-size:13px; }
    .sync-row input[type="url"],
    .sync-row input[type="password"] { flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:6px; font-size:13px; }
    .sync-row-toggle { justify-content:space-between; }
    .sync-status-row { display:flex; align-items:center; justify-content:space-between; margin-top:8px; }
    .sync-log { margin-top:4px; min-height:18px; }
    .sync-badge { padding:2px 8px; border-radius:10px; font-size:11px; font-weight:bold; }
    .sync-badge-ok    { background:#d4edda; color:#155724; }
    .sync-badge-error { background:#f8d7da; color:#721c24; }
    .toggle-switch { position:relative; display:inline-block; width:40px; height:22px; }
    .toggle-switch input { opacity:0; width:0; height:0; }
    .toggle-slider { position:absolute; cursor:pointer; inset:0; background:#ccc; border-radius:22px; transition:.3s; }
    .toggle-slider:before { content:""; position:absolute; width:16px; height:16px; left:3px; bottom:3px; background:white; border-radius:50%; transition:.3s; }
    .toggle-switch input:checked + .toggle-slider { background:var(--primary,#4a90e2); }
    .toggle-switch input:checked + .toggle-slider:before { transform:translateX(18px); }
  `;
  document.head.appendChild(style);
}

// ===== Boot =====

document.addEventListener('DOMContentLoaded', () => {
  injectSyncStyles();
  patchSaveRecordForSync();
  initCloudSync();
});
