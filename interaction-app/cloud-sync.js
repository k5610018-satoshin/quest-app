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
  installStorageWatcher();

  if (syncConfig.enabled && syncConfig.endpoint) {
    // 起動時pull: ローカルが空なら全件取得モードで取りに行く（pullFromGas内で自動判定）
    const beforeTotal = sumLocalRecords();
    pullFromGas().then(() => {
      const afterTotal = sumLocalRecords();
      // ローカル0件から復元できた場合 → 強い通知（データ消失からの自動復旧シナリオ）
      if (beforeTotal === 0 && afterTotal > 0) {
        showSyncStatus(`☁️ クラウドから ${afterTotal}件 を自動復元`);
        if (typeof showToast === 'function') {
          showToast(`☁️ クラウドから ${afterTotal}件 を自動復元しました`, 'success');
        }
      }
      // 件数差が出た or 削除/更新があった可能性 → どちらにせよ refresh して画面に反映
      // (件数増 / 件数減 / 件数同じだが内容更新 のいずれもUI更新が必要)
      if (afterTotal !== beforeTotal || (typeof window._needsRefreshAfterPull === 'function' && window._needsRefreshAfterPull())) {
        if (typeof refreshAll === 'function') refreshAll();
      }
    }).catch(err => console.warn('[sync] 起動時pull失敗:', err.message));
    // 起動時に名簿をpush（ビューシートが児童名解決に使う）
    setTimeout(() => pushRosterToGas().catch(() => {}), 3000);
  }

  if (syncConfig.autoSync) {
    startAutoSync();
  }

  // オンライン復帰時にpending送信
  window.addEventListener('online', () => {
    showSyncStatus('オンライン復帰');
    flushPendingQueue();
  });

  // タブ復帰時に自動pull (別作業から戻った時に最新化)
  // 連発を防ぐため最低60秒の間隔をあける
  // 順序: 未送信を先にflushしてからpull（自タブの編集がpullで戻されないよう）
  let _lastVisibilityPull = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    if (!syncConfig.enabled || !navigator.onLine) return;
    if (Date.now() - _lastVisibilityPull < 60 * 1000) return;
    _lastVisibilityPull = Date.now();
    try {
      await flushPendingQueue();
    } catch (err) {
      console.warn('[sync] visibility flush失敗:', err.message);
    }
    try {
      await pullFromGas();
    } catch (err) {
      console.warn('[sync] visibility pull失敗:', err.message);
    }
  });
}

// ===== ローカル状態ヘルパー =====

function sumLocalRecords() {
  if (!window.state) return 0;
  return ((state.records && state.records.length) || 0) +
         ((state.praises && state.praises.length) || 0) +
         ((state.evaluations && state.evaluations.length) || 0) +
         ((state.abaRecords && state.abaRecords.length) || 0) +
         ((state.ketebureRecords && state.ketebureRecords.length) || 0);
}

function getOldestLocalTimestamp() {
  if (!window.state) return null;
  const arrs = [state.records, state.praises, state.evaluations, state.abaRecords, state.ketebureRecords];
  let oldest = null;
  for (const arr of arrs) {
    if (!Array.isArray(arr)) continue;
    for (const x of arr) {
      const ts = x && (x.timestamp || x.edited_at || x.date);
      if (ts && (!oldest || String(ts) < String(oldest))) oldest = String(ts);
    }
  }
  return oldest;
}

// since 計算を安全側に倒す
//  - opts.fullPull → 強制全取得
//  - ローカル全件0件 → 2000-01-01から全取得
//  - 日が変わってからの初回起動 → 全件取得 (別端末で日中に編集された分の取りこぼし防止)
//  - LAST_PULL_KEY が ローカル最古より新しい(矛盾) → 1日広く巻き戻す
function computePullSince(opts) {
  const FALLBACK = '2000-01-01T00:00:00.000Z';
  if (opts && opts.fullPull) {
    console.log('[sync] 全件取得モード (force)');
    return FALLBACK;
  }
  if (sumLocalRecords() === 0) {
    console.log('[sync] ローカル空 → 全件取得');
    return FALLBACK;
  }
  const lastPull = localStorage.getItem(LAST_PULL_KEY);
  if (!lastPull) {
    console.log('[sync] lastPull未設定 → 全件取得');
    return FALLBACK;
  }
  // 日が変わったら必ず全件取得（別端末の今日分を確実に拾う）
  try {
    const today = new Date().toISOString().slice(0, 10);
    const lastDay = String(lastPull).slice(0, 10);
    if (today !== lastDay) {
      console.log('[sync] 日付変更を検出 → 全件取得:', { today, lastDay });
      return FALLBACK;
    }
  } catch (_) {}
  const oldest = getOldestLocalTimestamp();
  if (oldest && lastPull > oldest) {
    // ローカルにlastPullより古いレコードがある = lastPullが何らかの理由で進みすぎている
    // 1日巻き戻して安全側で再取得
    try {
      const d = new Date(oldest);
      d.setUTCDate(d.getUTCDate() - 1);
      const safe = d.toISOString();
      console.warn('[sync] lastPull矛盾を検出 → 安全側に巻き戻し:', { lastPull, oldest, safe });
      return safe;
    } catch (_) {
      return FALLBACK;
    }
  }
  return lastPull;
}

// マルチタブ防衛: 別タブが少ない件数でlocalStorageを上書きしようとしたら自タブで再保存
// 件数だけでなく ID集合 と 最大timestamp も照合し、「同件数だが内容が古い」ケースも検出
function _collectIds(stateLike) {
  const arrs = [
    stateLike.records, stateLike.praises, stateLike.evaluations,
    stateLike.abaRecords, stateLike.ketebureRecords
  ];
  const ids = new Set();
  let maxTs = '';
  let total = 0;
  for (const arr of arrs) {
    if (!Array.isArray(arr)) continue;
    total += arr.length;
    for (const x of arr) {
      if (x && x.id) ids.add(x.id);
      const ts = x && (x.edited_at || x.timestamp);
      if (ts && String(ts) > maxTs) maxTs = String(ts);
    }
  }
  return { ids, maxTs, total };
}

function installStorageWatcher() {
  const KEY = 'interactionApp_v1';
  let _lastDefenseTime = 0;
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    if (!e.newValue) {
      console.warn('[multi-tab] 別タブが localStorage を削除');
      if (window.state && typeof saveState === 'function') {
        if (sumLocalRecords() > 0) {
          saveState();
          if (typeof showToast === 'function') {
            showToast('⚠ 別タブがデータを削除 → このタブから再保存しました', 'error');
          }
        }
      }
      return;
    }
    try {
      const other = JSON.parse(e.newValue);
      if (!window.state) return;
      const mine = _collectIds(window.state);
      const theirs = _collectIds(other);

      // 防衛発動条件:
      //  (a) 自タブの方が件数が5件以上多い (従来ロジック)
      //  (b) 自タブのID集合に「相手に無いID」が3件以上ある（同件数で内容差し替えを検出）
      //  (c) 自タブの最大timestamp が相手より新しい AND 自タブにしか無いIDがある
      let missingFromOther = 0;
      for (const id of mine.ids) if (!theirs.ids.has(id)) missingFromOther++;
      const myTsNewer = mine.maxTs && mine.maxTs > theirs.maxTs;
      const reasonA = mine.total > theirs.total + 5;
      const reasonB = missingFromOther >= 3;
      const reasonC = myTsNewer && missingFromOther > 0;

      if (!reasonA && !reasonB && !reasonC) return;

      // 連続発火を防ぐ（3秒以内なら無視）
      if (Date.now() - _lastDefenseTime < 3000) return;
      _lastDefenseTime = Date.now();
      console.warn('[multi-tab] 防衛発動', {
        reason: reasonA ? 'count' : (reasonB ? 'idDiff' : 'tsNewer'),
        myTotal: mine.total, otherTotal: theirs.total,
        myMaxTs: mine.maxTs, otherMaxTs: theirs.maxTs,
        missingFromOther
      });
      if (typeof saveState === 'function') {
        saveState();
        if (typeof showToast === 'function') {
          const detail = reasonA ? `件数差(${mine.total}→${theirs.total})`
                       : reasonB ? `${missingFromOther}件のIDが消えそう`
                       : '内容が古い';
          showToast(`⚠ 他タブが古いデータで上書き(${detail}) → ${mine.total}件を保護`, 'error');
        }
      }
    } catch (e) {
      console.warn('[multi-tab] storage event 処理エラー:', e.message);
    }
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
    <div class="sync-row" style="margin-top:12px; padding:10px; background:#fff8e6; border:1px solid #f5b042; border-radius:6px;">
      <div style="flex:1">
        <button id="syncEmergencyRestoreBtn" style="background:#d9534f;color:white;border:1px solid #d9534f;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:bold;">🆘 クラウドから緊急復元</button>
        <button id="syncOpenDiagModalBtn" style="margin-left:8px;background:#6c757d;color:white;border:1px solid #6c757d;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:bold;">📊 診断レポート (アプリ内)</button>
        <button id="syncRunChromeDiagBtn" style="margin-left:8px;background:#5a9fd4;color:white;border:1px solid #5a9fd4;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:bold;">🔍 同期診断＆コピー</button>
        <a href="diagnostic.html" target="_blank" style="margin-left:8px;display:inline-block;padding:8px 14px;background:#fff;color:#6c757d;text-decoration:none;border:1px solid #6c757d;border-radius:6px;">📄 詳細ページ</a>
        <a href="recovery.html" target="_blank" style="margin-left:8px;display:inline-block;padding:8px 14px;background:#fff;color:#d9534f;text-decoration:none;border:1px solid #d9534f;border-radius:6px;">🆘 復旧ツール</a>
        <div class="muted small" style="margin-top:4px">緊急復元: 記録が消えた時にクラウドから全件取り直し / 診断レポート: 3層件数を1画面集約 / 同期診断: 設定値+pull試行結果をクリップボードにコピー</div>
      </div>
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
    } else if (e.target.id === 'syncEmergencyRestoreBtn') {
      saveSyncInputs();
      emergencyRestoreFromGas();
    } else if (e.target.id === 'syncOpenDiagModalBtn') {
      if (typeof window.openDiagnosticModal === 'function') {
        window.openDiagnosticModal();
      } else {
        showToast?.('診断モジュール読み込み中', 'error');
      }
    } else if (e.target.id === 'syncRunChromeDiagBtn') {
      if (typeof window.runChromeDiagnostic === 'function') {
        window.runChromeDiagnostic();
      } else {
        showToast?.('診断モジュール読み込み中', 'error');
      }
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

// 緊急復元: ローカル記録が消失したケース向け。
// LAST_PULL_KEYをクリアしてクラウドから全件取得 → mergeArray()で
// 既存ローカルレコードは保持されるので非破壊（同IDはtimestamp比較で更新のみ）。
// 編集モード中チェック・syncConfig.enabled は緊急時なのでバイパス。
async function emergencyRestoreFromGas() {
  // checkSyncReady を簡易版で再実装（緊急時、設定が壊れていても endpoint/apiKey があれば実行）
  if (!syncConfig.endpoint || !syncConfig.apiKey) {
    if (typeof showToast === 'function') showToast('GAS接続情報が未入力。設定タブで入力してください', 'error');
    return;
  }
  const before = sumLocalRecords();
  if (!confirm(
      `クラウド(GAS)から全件取得してローカルに復元します。\n\n` +
      `現在のローカル件数: ${before}件\n` +
      `（既存ローカルは保持、クラウドにあって不足している分のみ追加します）\n\n` +
      `続行しますか？`)) return;

  // 編集モードフラグを強制クリア（緊急復元優先）
  if (window.state && window.state.ui && window.state.ui.editingRecordId) {
    console.log('[emergency] 編集モードフラグを解除');
    window.state.ui.editingRecordId = null;
  }
  // 同期が無効化されていても緊急時は強制有効化
  if (!syncConfig.enabled) {
    console.log('[emergency] 同期無効を強制有効化');
    syncConfig.enabled = true;
    saveSyncConfig();
  }

  showSyncStatus('クラウドから緊急復元中…');
  try {
    // 直接fetchして検証（pullFromGasが失敗するケースに備える）
    const url = `${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}&since=2000-01-01T00:00:00.000Z&deviceId=${encodeURIComponent(_deviceId || 'emergency')}&dataType=all`;
    console.log('[emergency] verifying GAS endpoint:', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' (GASに到達できないか、エンドポイントが間違っている可能性)');
    const cloudData = await res.json();
    if (!cloudData.ok) throw new Error('GAS応答エラー: ' + (cloudData.error || 'unknown'));
    console.log('[emergency] cloud counts:', {
      records: (cloudData.records || []).length,
      praises: (cloudData.praises || []).length,
      evaluations: (cloudData.evaluations || []).length,
      abaRecords: (cloudData.abaRecords || []).length,
      ketebureRecords: (cloudData.ketebureRecords || []).length
    });

    // LAST_PULL_KEY をリセット → since=2000-01-01 で全件取得
    localStorage.removeItem(LAST_PULL_KEY);
    await pullFromGas({ fullPull: true });

    const after = sumLocalRecords();
    const diff = after - before;
    showSyncStatus(`緊急復元完了: ${before} → ${after}件 (+${diff})`);
    if (typeof refreshAll === 'function') refreshAll();
    if (typeof showToast === 'function') {
      if (diff > 0) {
        showToast(`☁️ クラウドから ${diff}件 を復元しました（合計 ${after}件）`, 'success');
      } else if (after === 0) {
        showToast(`⚠ クラウドにも記録がありません。GAS設定の確認が必要です`, 'error');
      } else {
        showToast(`クラウドとローカルは既に一致しています（${after}件）`, 'success');
      }
    }
  } catch (err) {
    console.error('[emergency] failed:', err);
    showSyncStatus('緊急復元失敗: ' + err.message, true);
    if (typeof showToast === 'function') {
      showToast('緊急復元失敗: ' + err.message, 'error');
    }
    alert('緊急復元失敗:\n\n' + err.message + '\n\n詳細はF12 → Console を確認してください。');
  }
}

async function pullFromGas(opts) {
  // 緊急/全件モード(opts.fullPull)はsyncConfig無効でも実行する
  if (opts && opts.fullPull) {
    if (!syncConfig.endpoint || !syncConfig.apiKey) return;
  } else {
    if (!checkSyncReady()) return;
  }
  // 編集モード中はpullを延期（編集中レコードがpull先で上書きされるリスク回避）
  // ただし opts.fullPull (緊急復元) は編集中でも実行
  if (!(opts && opts.fullPull)) {
    if (window.state && window.state.ui && window.state.ui.editingRecordId) {
      console.warn('[sync] 編集モード中のためpullを延期');
      return;
    }
  }
  // since計算を安全側に倒す（computePullSinceがローカル状態を見て決定）
  const since = computePullSince(opts);
  // dataType=all で records, praises, evaluations, aba を一括取得
  const url = `${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}&since=${encodeURIComponent(since)}&deviceId=${encodeURIComponent(_deviceId)}&dataType=all`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'GAS error');

  // ===== マージヘルパー: 削除反映 + timestamp比較で上書き =====
  // GAS側で deleted='1' なら local からも削除、既存IDは timestamp 比較で新しい方を採用
  function mergeArray(localArr, pulled, normalize, kind) {
    if (!Array.isArray(localArr) || !Array.isArray(pulled)) return { added: 0, updated: 0, deleted: 0 };
    const idx = new Map(localArr.map((x, i) => [x.id, i]));
    let added = 0, updated = 0, deleted = 0;
    for (const item of pulled) {
      if (!item || !item.id) continue;
      const localPos = idx.get(item.id);
      // 削除反映
      if (String(item.deleted) === '1') {
        if (localPos !== undefined) {
          localArr.splice(localPos, 1);
          // インデックスを再計算
          idx.clear();
          localArr.forEach((x, i) => idx.set(x.id, i));
          deleted++;
        }
        continue;
      }
      const n = normalize ? normalize(item) : item;
      if (!n) continue;
      if (localPos === undefined) {
        // 新規
        localArr.push(n);
        idx.set(n.id, localArr.length - 1);
        added++;
      } else {
        // 既存: timestamp 比較で新しい方を採用 (>= で同秒編集の取りこぼし防止)
        // edited_at があればそちらを優先
        const localTs = localArr[localPos].edited_at || localArr[localPos].timestamp || '';
        const pulledTs = n.edited_at || n.timestamp || '';
        if (pulledTs && pulledTs >= localTs && pulledTs !== localTs) {
          localArr[localPos] = n;
          updated++;
        } else if (pulledTs && pulledTs === localTs) {
          // 同時刻: deviceId で tie-break (現端末優先で no-op)
          const localDev = localArr[localPos].deviceId || '';
          const pulledDev = n.deviceId || '';
          if (pulledDev && pulledDev !== localDev && pulledDev > localDev) {
            localArr[localPos] = n;
            updated++;
          }
        }
      }
    }
    return { added, updated, deleted };
  }

  // ===== 交友関係レコード =====
  const pulledRecs = data.records || [];
  const recRes = mergeArray(state.records, pulledRecs, normalizeRecord, 'records');
  const mergedRecs = recRes.added + recRes.updated + recRes.deleted;

  // ===== ほめたい =====
  const pulledPraises = data.praises || [];
  const prRes = mergeArray(state.praises, pulledPraises,
    (typeof normalizePraise === 'function') ? normalizePraise : null, 'praises');
  const mergedPraises = prRes.added + prRes.updated + prRes.deleted;

  // ===== 評価 =====
  const pulledEvals = data.evaluations || [];
  // evidences_json を配列にパース（GAS側でしているが念のため二重防御）
  for (const e of pulledEvals) {
    if (typeof e.evidences === 'string' && e.evidences) {
      try { e.evidences = JSON.parse(e.evidences); } catch (_) { e.evidences = []; }
    }
    if (!Array.isArray(e.evidences)) e.evidences = [];
  }
  const evRes = mergeArray(state.evaluations, pulledEvals,
    (typeof normalizeEvaluation === 'function') ? normalizeEvaluation : null, 'evaluations');
  const mergedEvals = evRes.added + evRes.updated + evRes.deleted;

  // ===== ABA =====
  const pulledAba = data.abaRecords || [];
  for (const r of pulledAba) {
    if (typeof r.behaviors === 'string' && r.behaviors) {
      try { r.behaviors = JSON.parse(r.behaviors); } catch(_) { r.behaviors = [r.behaviors]; }
    }
  }
  const abaRes = mergeArray(state.abaRecords, pulledAba,
    (typeof normalizeAba === 'function') ? normalizeAba : null, 'aba');
  const mergedAba = abaRes.added + abaRes.updated + abaRes.deleted;

  // ===== けテぶれ =====
  if (!Array.isArray(state.ketebureRecords)) state.ketebureRecords = [];
  const pulledKete = data.ketebureRecords || [];
  for (const k of pulledKete) {
    if (typeof k.aspects === 'string' && k.aspects) {
      try { k.aspects = JSON.parse(k.aspects); } catch(_) { k.aspects = []; }
    }
    if (!Array.isArray(k.aspects)) k.aspects = [];
  }
  const ketRes = mergeArray(state.ketebureRecords, pulledKete,
    (typeof normalizeKetebure === 'function') ? normalizeKetebure : null, 'ketebure');
  const mergedKete = ketRes.added + ketRes.updated + ketRes.deleted;

  // ===== 座席履歴 =====
  const pulledSeats = data.seatingSnapshots || data.seating || [];
  let mergedSeats = 0;
  if (Array.isArray(pulledSeats)) {
    if (!Array.isArray(state.seatingSnapshots)) state.seatingSnapshots = [];
    const existingSeatIds = new Set(state.seatingSnapshots.map(s => s.id));
    for (const s of pulledSeats) {
      if (String(s.deleted) === '1') continue;
      if (existingSeatIds.has(s.id)) continue;
      // groups は JSON 文字列の場合パース
      if (typeof s.groups === 'string') {
        try { s.groups = JSON.parse(s.groups); } catch (_) { s.groups = []; }
      } else if (typeof s.groups_json === 'string') {
        try { s.groups = JSON.parse(s.groups_json); } catch (_) { s.groups = []; }
      }
      if (!Array.isArray(s.groups)) continue;
      state.seatingSnapshots.push({
        id: s.id,
        date: s.date || '',
        label: s.label || '',
        groups: s.groups,
        deviceId: s.deviceId || ''
      });
      mergedSeats++;
    }
  }

  const totalChanged = mergedRecs + mergedPraises + mergedEvals + mergedAba + mergedSeats + mergedKete;
  if (totalChanged > 0) {
    saveState();
    if (typeof refreshAll === 'function') refreshAll();
  }
  updateLastPullTime();
  if (totalChanged > 0) {
    const parts = [];
    if (mergedRecs > 0) parts.push(`記録 ${mergedRecs}件`);
    if (mergedPraises > 0) parts.push(`ほめ ${mergedPraises}件`);
    if (mergedEvals > 0) parts.push(`評価 ${mergedEvals}件`);
    if (mergedAba > 0) parts.push(`ABA ${mergedAba}件`);
    if (mergedKete > 0) parts.push(`けテぶれ ${mergedKete}件`);
    if (mergedSeats > 0) parts.push(`座席 ${mergedSeats}件`);
    showSyncStatus(`同期 ${parts.join(' / ')}`);
  }
  return { mergedSeats };
}

// 座席履歴のみ取得（席替えタブの「同期」ボタンから呼ぶ）
async function pullSeatingFromGas() {
  if (!checkSyncReady()) throw new Error('クラウド同期未設定');
  // dataType=seating のみリクエスト（GAS側がseating endpoint対応済み前提）
  const url = `${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}&deviceId=${encodeURIComponent(_deviceId)}&dataType=seating&since=2000-01-01T00:00:00.000Z`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'GAS error');
  const pulledSeats = data.seatingSnapshots || data.seating || [];
  if (!Array.isArray(state.seatingSnapshots)) state.seatingSnapshots = [];
  const existingSeatIds = new Set(state.seatingSnapshots.map(s => s.id));
  let count = 0;
  let latestDate = '';
  for (const s of pulledSeats) {
    if (String(s.deleted) === '1') continue;
    if (typeof s.groups === 'string') { try { s.groups = JSON.parse(s.groups); } catch (_) { s.groups = []; } }
    else if (typeof s.groups_json === 'string') { try { s.groups = JSON.parse(s.groups_json); } catch (_) { s.groups = []; } }
    if (!Array.isArray(s.groups)) continue;
    if (s.date && s.date > latestDate) latestDate = s.date;
    if (existingSeatIds.has(s.id)) continue;
    state.seatingSnapshots.push({
      id: s.id,
      date: s.date || '',
      label: s.label || '',
      groups: s.groups,
      deviceId: s.deviceId || ''
    });
    count++;
  }
  if (count > 0) saveState();
  return { count, latestDate };
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
  const wrapped = _ensureQid({ ...op, queuedAt: new Date().toISOString() });
  queue.push(wrapped);
  // 最大200件まで
  if (queue.length > 200) queue = queue.slice(-200);
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
}

function loadPendingQueue() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_QUEUE_KEY) || '[]');
  } catch (_) { return []; }
}

// 各 op に一意な _qid を付与（キュー内での識別子）
function _ensureQid(op) {
  if (!op._qid) op._qid = 'q-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  return op;
}

// 成功した op を queue から1件だけ取り除く（クラッシュ耐性）
function _removeFromQueue(qid) {
  try {
    const q = loadPendingQueue();
    const filtered = q.filter(x => x._qid !== qid);
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(filtered));
  } catch (_) {}
}

async function flushPendingQueue() {
  if (!checkSyncReady() || !navigator.onLine) return;
  let queue = loadPendingQueue();
  if (queue.length === 0) return;
  // 全 op に _qid を付与（既存にも付ける）して書き戻す → クラッシュしてもキューは保持される
  let needRewrite = false;
  for (const op of queue) {
    if (!op._qid) { _ensureQid(op); needRewrite = true; }
  }
  if (needRewrite) {
    try { localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue)); } catch (_) {}
  }

  let succeeded = 0;
  let failed = 0;
  for (const op of queue) {
    // _qid と内部キー以外を送信
    const payload = { ...op, deviceId: _deviceId };
    delete payload._qid;
    try {
      const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      // 成功したら即座にキューから削除（途中クラッシュしても残りは次回再試行）
      _removeFromQueue(op._qid);
      succeeded++;
    } catch (err) {
      failed++;
      console.warn('[flush] op失敗:', op._qid, err.message);
      // 失敗時はそのままキューに残す（_removeFromQueue を呼ばない）
    }
  }
  if (failed > 0) {
    showSyncStatus(`${failed}件の送信に失敗（自動再試行・キューに保持）`, true);
  } else if (succeeded > 0) {
    showSyncStatus(`${succeeded}件の保留済みデータを送信しました`);
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

// ===== 名簿(roster) を GAS に push（人間用ビューシートが児童名解決に使う） =====

let _lastRosterPush = 0;
async function pushRosterToGas(force) {
  if (!checkSyncReady()) return false;
  if (!Array.isArray(state.students) || state.students.length === 0) return false;
  // 連続push防止: 5分以内なら再送しない（force=trueで強制）
  if (!force && Date.now() - _lastRosterPush < 5 * 60 * 1000) return false;
  try {
    const students = state.students.map(s => ({
      id: s.id,
      name: s.name || '',
      kana: s.kana || '',
      watch: s.watch || false,
      highlight: s.highlight || false
    }));
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'set',
        dataType: 'roster',
        students: students,
        deviceId: _deviceId
      })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'GAS error');
    _lastRosterPush = Date.now();
    return true;
  } catch (err) {
    console.warn('[sync] roster push失敗:', err.message);
    return false;
  }
}

// ===== ビュー再生成リクエスト（GAS側で view_* シートを再構築） =====
// type 指定なし: 5種類を順次実行（GAS 6分タイムアウト対策）
// type 指定あり: 1種類だけ実行
const VIEW_TYPES = ['records', 'praises', 'evaluations', 'aba', 'ketebure'];

async function _requestRebuildOne(type, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 90000);
  try {
    const res = await fetch(`${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'rebuild',
        dataType: 'views',
        type: type,
        deviceId: _deviceId
      }),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('HTTP ' + res.status + ' - ' + txt.slice(0, 200));
    }
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'GAS error');
    return data.stats || { type: type, count: '?' };
  } finally {
    clearTimeout(timer);
  }
}

async function requestViewRebuild(opts) {
  if (!checkSyncReady()) return { ok: false, error: 'クラウド同期未設定' };
  opts = opts || {};
  // 単一タイプ指定モード
  if (opts.type) {
    try {
      const stats = await _requestRebuildOne(opts.type, 90000);
      return { ok: true, stats: { [opts.type]: stats.count } };
    } catch (err) {
      const msg = err.name === 'AbortError'
        ? `タイムアウト(90秒): ${opts.type}のデータが多い可能性。GASエディタから手動実行してください`
        : err.message;
      console.warn(`[sync] view rebuild(${opts.type})失敗:`, msg);
      return { ok: false, error: msg };
    }
  }
  // 全タイプ順次実行モード
  const stats = {};
  const errors = [];
  for (const t of VIEW_TYPES) {
    try {
      const r = await _requestRebuildOne(t, 90000);
      stats[t] = r.count != null ? r.count : (r.error || '?');
      if (typeof opts.onProgress === 'function') opts.onProgress(t, stats[t]);
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'timeout' : err.message;
      stats[t] = 'error: ' + msg;
      errors.push(`${t}: ${msg}`);
    }
  }
  if (errors.length === VIEW_TYPES.length) {
    return { ok: false, error: '全ビュー失敗: ' + errors.join(' / '), stats: stats };
  }
  return { ok: true, stats: stats, partialErrors: errors.length ? errors : null };
}

// ===== スプレッドシート情報取得 =====
async function getSheetInfo() {
  if (!checkSyncReady()) return null;
  try {
    const url = `${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}&action=info`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'GAS error');
    return data;
  } catch (err) {
    console.warn('[sync] sheet info失敗:', err.message);
    return null;
  }
}

// ===== スプレッドシート名変更 =====
async function renameSheet(newName) {
  if (!checkSyncReady()) return { ok: false, error: 'クラウド同期未設定' };
  try {
    const url = `${syncConfig.endpoint}?key=${encodeURIComponent(syncConfig.apiKey)}&action=rename&name=${encodeURIComponent(newName)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('HTTP ' + res.status + ' - ' + txt.slice(0, 200));
    }
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'GAS error');
    return { ok: true, oldName: data.old_name, newName: data.new_name };
  } catch (err) {
    console.warn('[sync] rename失敗:', err.message);
    return { ok: false, error: err.message };
  }
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
