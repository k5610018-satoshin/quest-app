'use strict';
/* ==========================================================================
 * cloud-sync.js — 観点別評価記録アプリ クラウド同期モジュール
 *
 * 依存: app.js の state, saveState, showToast, normalizeRecord が定義済みであること
 * ロード順: <script src="cloud-sync.js"> は app.js の後に置くこと
 * ========================================================================== */

// ===== 設定キー =====
const SYNC_STORAGE_KEY  = 'evaluationApp_gasSync';
const PENDING_QUEUE_KEY = 'evaluationApp_pendingQueue';
const LAST_PULL_KEY     = 'evaluationApp_lastPull';

// ===== 同期設定 (デフォルト値・初回起動時に自動適用) =====
// 注意: ユーザー本人専用前提でGAS URL/APIキーをハードコード
const DEFAULT_SYNC = {
  enabled:  true,
  endpoint: 'https://script.google.com/macros/s/AKfycbxKGW6OnwnXBHsPL4I0lvDF1_7vllud3J9_AoMMeQbQIildu2GMSlBAO3LXv-Qki4xT/exec',
  apiKey:   '6vn-n4nMAU_RYRd5',
  autoSync: true
};
const syncConfig = { ...DEFAULT_SYNC };

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
    pullFromGas().catch(err => console.warn('[sync] 起動時pull失敗:', err.message));
  }
  if (syncConfig.autoSync) startAutoSync();

  window.addEventListener('online', () => {
    showSyncStatus('オンライン復帰');
    flushPendingQueue();
  });
}

// ===== デバイスID =====

function getOrCreateDeviceId() {
  let id = localStorage.getItem('evaluationApp_deviceId');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('evaluationApp_deviceId', id);
  }
  return id;
}

// ===== 設定の読み書き =====

function loadSyncConfig() {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.endpoint) syncConfig.endpoint = data.endpoint;
      if (data.apiKey)   syncConfig.apiKey   = data.apiKey;
      if (typeof data.enabled  === 'boolean') syncConfig.enabled  = data.enabled;
      if (typeof data.autoSync === 'boolean') syncConfig.autoSync = data.autoSync;
    }
  } catch (_) {}
}

function saveSyncConfig() {
  localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(syncConfig));
}

// ===== UI =====

function renderSyncUI() {
  const container = document.getElementById('syncSettingsCard');
  if (!container) return;

  const lastPull = localStorage.getItem(LAST_PULL_KEY);
  const lastPullText = lastPull ? new Date(lastPull).toLocaleString('ja-JP') : '未実行';

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
      <button class="ghost" id="syncPushAllBtn" title="ローカルの全記録と単元をGASへ送る（初回移行用）">全件アップロード</button>
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
      pushAllData();
    }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'syncEnabledToggle') {
      saveSyncInputs();
      if (syncConfig.enabled) pullFromGas().catch(console.warn);
    } else if (e.target.id === 'syncAutoToggle') {
      saveSyncInputs();
      syncConfig.autoSync ? startAutoSync() : stopAutoSync();
    }
  });
}

function saveSyncInputs() {
  const e = id => document.getElementById(id);
  if (e('syncEndpointInput')) syncConfig.endpoint = e('syncEndpointInput').value.trim();
  if (e('syncApiKeyInput'))   syncConfig.apiKey   = e('syncApiKeyInput').value.trim();
  if (e('syncEnabledToggle')) syncConfig.enabled  = e('syncEnabledToggle').checked;
  if (e('syncAutoToggle'))    syncConfig.autoSync = e('syncAutoToggle').checked;
  saveSyncConfig();
}

// ===== ステータス =====

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

// ===== 同期ロジック =====

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
  const url = `${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}&since=${encodeURIComponent(since)}&dataType=all&deviceId=${encodeURIComponent(_deviceId)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'GAS error');

  let mergedRecords = 0, mergedUnits = 0;

  // 評価レコードのマージ
  const existingRecIds = new Set(state.records.map(r => r.id));
  for (const r of (data.records || [])) {
    if (String(r.deleted) === '1') continue;
    if (existingRecIds.has(r.id)) {
      // superseded フラグの更新（他PCでの上書き）
      const local = state.records.find(lr => lr.id === r.id);
      if (local && String(r.superseded) !== String(local.superseded)) {
        local.superseded = r.superseded === true || r.superseded === 'true';
      }
      continue;
    }
    const normalized = normalizeRecord(r);
    if (normalized) { state.records.push(normalized); mergedRecords++; }
  }

  // 単元のマージ
  const existingUnitIds = new Set(state.units.map(u => u.id));
  for (const u of (data.units || [])) {
    if (existingUnitIds.has(u.id)) continue;
    const nu = normalizeUnit(u);
    if (nu) { state.units.push(nu); mergedUnits++; }
  }

  if (mergedRecords + mergedUnits > 0) {
    saveState();
    if (typeof refreshAll === 'function') refreshAll();
  }
  updateLastPullTime();
  if (mergedRecords + mergedUnits > 0) {
    showSyncStatus(`記録${mergedRecords}件・単元${mergedUnits}件を取得`);
  }
}

async function pushRecordToGas(record, action) {
  if (!checkSyncReady()) return false;
  if (!navigator.onLine) {
    addToPendingQueue({ action: action || 'add', dataType: 'record', records: [record] });
    return false;
  }
  try {
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action || 'add', dataType: 'record',
        records: [record], deviceId: _deviceId
      })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return true;
  } catch (err) {
    console.warn('[sync] push失敗:', err.message);
    addToPendingQueue({ action: action || 'add', dataType: 'record', records: [record] });
    showSyncStatus('オフライン中(自動再試行します)', true);
    return false;
  }
}

async function pushUnitToGas(unit) {
  if (!checkSyncReady() || !navigator.onLine) {
    addToPendingQueue({ action: 'add', dataType: 'unit', units: [unit] });
    return false;
  }
  try {
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', dataType: 'unit', units: [unit], deviceId: _deviceId })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return true;
  } catch (err) {
    addToPendingQueue({ action: 'add', dataType: 'unit', units: [unit] });
    return false;
  }
}

async function pushAllData() {
  if (!checkSyncReady()) return;
  if (_isSyncing) return;
  _isSyncing = true;
  showSyncStatus('全件送信中…');
  try {
    // 評価レコード
    const recRes = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync', dataType: 'record', records: state.records, deviceId: _deviceId })
    });
    const recData = await recRes.json();
    if (!recData.ok) throw new Error(recData.error);

    // 単元
    const unitRes = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync', dataType: 'unit', units: state.units, deviceId: _deviceId })
    });
    const unitData = await unitRes.json();
    if (!unitData.ok) throw new Error(unitData.error);

    showSyncStatus(`記録: +${recData.added}件追加 / 単元: +${unitData.added}件追加`);
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
  if (queue.length > 200) queue = queue.slice(-200);
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
}

function loadPendingQueue() {
  try { return JSON.parse(localStorage.getItem(PENDING_QUEUE_KEY) || '[]'); }
  catch (_) { return []; }
}

async function flushPendingQueue() {
  if (!checkSyncReady() || !navigator.onLine) return;
  let queue = loadPendingQueue();
  if (queue.length === 0) return;
  localStorage.removeItem(PENDING_QUEUE_KEY);
  let failed = [];
  for (const op of queue) {
    try {
      const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...op, deviceId: _deviceId })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
    } catch (err) { failed.push(op); }
  }
  if (failed.length > 0) {
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(failed));
    showSyncStatus(`${failed.length}件送信失敗（再試行予定）`, true);
  } else if (queue.length > 0) {
    showSyncStatus(`${queue.length}件の保留データを送信`);
  }
}

// ===== 自動同期 =====

function startAutoSync() {
  stopAutoSync();
  _autoSyncTimer = setInterval(() => {
    if (syncConfig.enabled && navigator.onLine) {
      flushPendingQueue().then(() => pullFromGas()).catch(console.warn);
    }
  }, 5 * 60 * 1000);
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

// ===== app.js の setGrade / addUnit 等をラップ =====

function patchEvaluationFunctionsForSync() {
  // setGrade のラップ
  const _origSetGrade = window.setGrade;
  if (typeof _origSetGrade === 'function') {
    window.setGrade = function(studentId, viewpoint, grade) {
      const beforeIds = new Set(state.records.map(r => r.id));
      // superseded変更前のレコードも記録しておく
      const supersededBefore = state.records.filter(r =>
        r.subject === state.ui.currentSubject &&
        r.unitId === state.ui.currentUnitId &&
        r.viewpoint === viewpoint &&
        r.studentId === studentId &&
        !r.superseded
      ).map(r => r.id);
      _origSetGrade.call(this, studentId, viewpoint, grade);
      if (!syncConfig.enabled) return;
      // 新しく追加されたレコードを取得
      const newRecs = state.records.filter(r => !beforeIds.has(r.id));
      for (const rec of newRecs) {
        pushRecordToGas(rec, 'add').catch(console.warn);
      }
      // superseded になったレコードも更新
      for (const id of supersededBefore) {
        const rec = state.records.find(r => r.id === id);
        if (rec && rec.superseded) {
          pushRecordToGas(rec, 'edit').catch(console.warn);
        }
      }
    };
  }

  // addUnit のラップ (evaluation-app では saveUnit 等に相当する関数)
  // saveOrUpdateUnit が存在する場合にラップ
  const _origSaveUnit = window.saveOrUpdateUnit;
  if (typeof _origSaveUnit === 'function') {
    window.saveOrUpdateUnit = function() {
      const beforeIds = new Set(state.units.map(u => u.id));
      _origSaveUnit.call(this);
      if (!syncConfig.enabled) return;
      const newUnits = state.units.filter(u => !beforeIds.has(u.id));
      for (const unit of newUnits) {
        pushUnitToGas(unit).catch(console.warn);
      }
    };
  }
}

// ===== スタイル =====

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
  patchEvaluationFunctionsForSync();
  initCloudSync();
});
