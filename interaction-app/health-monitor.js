'use strict';
/* ==========================================================================
 * health-monitor.js — A1〜A4: 健全性ダッシュボード + アラート + 診断 + 起動診断
 *
 * 役割:
 *   A1: ヘッダ右に L1(localStorage) / L2(IndexedDB) / L3(Cloud) 件数バッジを常時表示
 *   A2: 件数20%減・3層乖離・pendingQueue滞留 を能動警告(toast)
 *   A3: 設定タブ「📊 診断レポート」モーダル（診断画面へのリンク + 1画面ダイジェスト）
 *   A4: 起動時 syncConfig が壊れていたら setup-gas.html へ誘導
 *   A5: 個人Chrome診断ヘルパー（DevTools出力をクリップボードへコピー）
 *
 * 依存:
 *   app.js: state, saveState, showToast
 *   cloud-sync.js: syncConfig, sumLocalRecords, pullFromGas, getSheetInfo
 *   idb-storage.js: window.idbGetCounts (任意)
 * ========================================================================== */

(function() {

const PENDING_KEY = 'interactionApp_pendingQueue';
const LAST_PULL_KEY = 'interactionApp_lastPull';

// 1分ごとに健全性を更新（バックグラウンドでも動く軽量処理）
const REFRESH_INTERVAL_MS = 60 * 1000;
const ALERT_THROTTLE_MS = 5 * 60 * 1000; // 同種アラートは5分以内に再表示しない

let _lastSnapshot = null;
let _lastAlertAt = {};   // {key: timestamp}
let _ticker = null;

// ===== 件数集計 =====

function localCounts() {
  const s = window.state;
  if (!s) return null;
  return {
    records: (s.records || []).length,
    praises: (s.praises || []).length,
    evaluations: (s.evaluations || []).length,
    aba: (s.abaRecords || []).length,
    ketebure: (s.ketebureRecords || []).length,
  };
}

function totalOf(c) {
  if (!c) return 0;
  return (c.records || 0) + (c.praises || 0) + (c.evaluations || 0) + (c.aba || 0) + (c.ketebure || 0);
}

async function idbCounts() {
  try {
    if (typeof window.idbGetCounts === 'function') {
      return await window.idbGetCounts();
    }
  } catch (e) { console.debug('[health] idbCounts:', e.message); }
  return null;
}

// クラウド件数: 設定タブの info レスポンスを使う（軽量）
// GAS info レスポンスのフィールド名: total_rows / praise_rows / eval_rows / aba_rows / ketebure_rows
//
// マルチタブ抑制方針:
//  1) インスタンス内で 60秒 メモリキャッシュ
//  2) localStorage 共有キャッシュ (interactionApp_cloudCountsCache) で全タブが共有 (TTL 60秒)
//  3) 進行中の Promise を保持して同タブ内重複呼び出しを抑制
//  4) タブ復帰直後 (visibilitychange→true から3秒以内) はキャッシュのみ返す
const CLOUD_CACHE_KEY = 'interactionApp_cloudCountsCache';
const CLOUD_CACHE_TTL_MS = 60 * 1000;
let _cloudInflight = null;
let _lastVisibilityChange = 0;
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) _lastVisibilityChange = Date.now();
});

function _readCloudCache() {
  try {
    const raw = localStorage.getItem(CLOUD_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts || !obj.data) return null;
    if (Date.now() - obj.ts > CLOUD_CACHE_TTL_MS) return null;
    return obj.data;
  } catch (e) { console.debug('[health] cloudCache read:', e.message); return null; }
}

function _writeCloudCache(data) {
  try {
    localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) { console.debug('[health] cloudCache write:', e.message); }
}

async function cloudCounts(opts) {
  const force = opts && opts.force;
  // (1) localStorage 共有キャッシュ（マルチタブで共有）
  if (!force) {
    const cached = _readCloudCache();
    if (cached) return cached;
    // (4) タブ復帰直後3秒はネット呼び出し回避（複数タブ復帰時のバースト防止）
    if (Date.now() - _lastVisibilityChange < 3000) {
      return cached || null;
    }
  }
  // (3) 進行中 Promise を返す
  if (_cloudInflight) return _cloudInflight;

  _cloudInflight = (async () => {
    try {
      if (typeof window.getSheetInfo !== 'function') return null;
      const info = await window.getSheetInfo();
      if (!info) return null;
      const result = {
        records: info.total_rows || 0,
        praises: info.praise_rows || 0,
        evaluations: info.eval_rows || 0,
        aba: info.aba_rows || 0,
        ketebure: info.ketebure_rows || 0,
      };
      _writeCloudCache(result);
      return result;
    } catch (e) {
      console.debug('[health] cloudCounts fetch:', e.message);
      return null;
    } finally {
      _cloudInflight = null;
    }
  })();
  return _cloudInflight;
}

function pendingCount() {
  try {
    const arr = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    return Array.isArray(arr) ? arr.length : 0;
  } catch (_) { return 0; }
}

function pendingOldestAgeMin() {
  try {
    const arr = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    const oldestTs = arr.reduce((min, x) => {
      const t = (x && (x.queued_at || x.timestamp)) ? new Date(x.queued_at || x.timestamp).getTime() : Date.now();
      return Math.min(min, t);
    }, Date.now());
    return Math.floor((Date.now() - oldestTs) / 60000);
  } catch (_) { return 0; }
}

// ===== A1: 3層バッジ更新 =====

function setPill(id, label, level) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = label;
  el.classList.remove('warn', 'danger');
  if (level === 'warn') el.classList.add('warn');
  else if (level === 'danger') el.classList.add('danger');
}

async function refreshHealthBar() {
  const bar = document.getElementById('storageHealthBar');
  if (!bar) return;
  bar.style.display = 'inline-flex';

  const local = localCounts();
  const lT = totalOf(local);
  setPill('shL1', `L1:${lT}`, lT === 0 ? 'danger' : null);

  const idb = await idbCounts();
  if (idb) {
    const iT = totalOf(idb);
    let level = null;
    const diff = lT - iT; // 正: L1 > L2（IDB書き込み未追従）/ 負: L1 < L2（ローカル消失でIDBから復元待ち）
    if (Math.abs(diff) > Math.max(5, lT * 0.1)) level = 'warn';
    // L1 > L2 大乖離 = IDB書き込み失敗中の可能性 → danger
    if (diff > Math.max(10, lT * 0.2)) level = 'danger';
    // L2 > L1 大乖離 = ローカル消失中、起動直後のidbCheckAndRestore待ち
    if (diff < -Math.max(10, iT * 0.2)) level = 'danger';
    setPill('shL2', `L2:${iT}`, level);
  } else {
    setPill('shL2', 'L2:?', null);
  }

  // クラウド件数は1分ごとに更新（重いので頻度を抑制）
  const cl = await cloudCounts();
  if (cl) {
    const cT = totalOf(cl);
    let level = null;
    const diff = lT - cT;
    // L1がL3より多い = まだ未送信 → warn
    // L1がL3より大幅に少ない = ローカル消失の可能性 → danger
    if (diff > Math.max(5, cT * 0.1)) level = 'warn';
    if (diff < -Math.max(10, lT * 0.2)) level = 'danger';
    setPill('shL3', `L3:${cT}`, level);
  } else {
    setPill('shL3', 'L3:?', null);
  }

  const pq = pendingCount();
  const pqEl = document.getElementById('shPending');
  if (pqEl) {
    if (pq > 0) {
      const ageMin = pendingOldestAgeMin();
      const labelText = ageMin > 0 ? `⏳${pq}件 (${ageMin}分滞留)` : `⏳${pq}件`;
      pqEl.style.display = '';
      pqEl.textContent = labelText;
      pqEl.classList.remove('warn', 'danger');
      if (pq > 10 || ageMin > 5) pqEl.classList.add('warn');
      if (pq > 50 || ageMin > 30) {
        pqEl.classList.remove('warn');
        pqEl.classList.add('danger');
      }
    } else {
      pqEl.style.display = 'none';
    }
  }

  // A2: アラート判定
  evaluateAndAlert({ local: lT, idb: idb ? totalOf(idb) : null, cloud: cl ? totalOf(cl) : null, pending: pq });
}

// ===== A2: 能動アラート =====

function shouldAlert(key) {
  const last = _lastAlertAt[key] || 0;
  if (Date.now() - last < ALERT_THROTTLE_MS) return false;
  _lastAlertAt[key] = Date.now();
  return true;
}

function evaluateAndAlert(snap) {
  if (typeof showToast !== 'function') return;
  // 件数20%減検知（ローカル件数前回比較）
  if (_lastSnapshot && _lastSnapshot.local > 10) {
    const drop = _lastSnapshot.local - snap.local;
    if (drop >= Math.max(5, _lastSnapshot.local * 0.2) && shouldAlert('drop')) {
      showToast(`⚠ ローカル記録が ${drop} 件減少しました（${_lastSnapshot.local}→${snap.local}）。診断レポートを確認してください`, 'error');
    }
  }
  // 3層乖離（L1とL3の差が大きすぎる）
  if (snap.cloud != null) {
    const diff = snap.cloud - snap.local;
    if (diff >= Math.max(20, snap.cloud * 0.2) && shouldAlert('cloud-diverge')) {
      showToast(`⚠ クラウドにローカルより ${diff}件多くあります（L1=${snap.local}/L3=${snap.cloud}）。クラウドから取得を推奨`, 'error');
    }
  }
  // L2 (IDB) 乖離
  if (snap.idb != null) {
    const diff = snap.idb - snap.local;
    if (diff >= Math.max(10, snap.idb * 0.2) && shouldAlert('idb-diverge')) {
      showToast(`⚠ IndexedDB にローカルより ${diff}件多くあります（L1=${snap.local}/L2=${snap.idb}）。再起動で復元される可能性`, 'error');
    }
  }
  // pendingQueue 滞留
  if (snap.pending > 10 && shouldAlert('pending-many')) {
    showToast(`⚠ 未送信キューが ${snap.pending}件 滞留中。同期を確認してください`, 'error');
  }
  const ageMin = pendingOldestAgeMin();
  if (ageMin > 30 && shouldAlert('pending-old')) {
    showToast(`⚠ 未送信キューが ${ageMin}分以上滞留しています。ネットワーク・GAS設定を確認してください`, 'error');
  }
  _lastSnapshot = snap;
  // 永続化（再起動後も20%減検知が動くように）
  try { localStorage.setItem('interactionApp_healthSnapshot', JSON.stringify(snap)); } catch (_) {}
}

// ===== A3: 診断レポートモーダル =====

async function openDiagnosticModal() {
  // 既存モーダルがあれば閉じる
  const existing = document.getElementById('diagnosticModal');
  if (existing) existing.remove();

  const local = localCounts();
  const idb = await idbCounts();
  const cl = await cloudCounts();
  const pq = pendingCount();
  const pqAge = pendingOldestAgeMin();
  const lastPull = localStorage.getItem(LAST_PULL_KEY) || '(なし)';
  const cfg = (() => {
    try { return JSON.parse(localStorage.getItem('interactionApp_gasSync') || '{}'); }
    catch { return {}; }
  })();
  const swReg = await ('serviceWorker' in navigator
    ? navigator.serviceWorker.getRegistration().catch(() => null)
    : Promise.resolve(null));
  const cacheVer = (window.APP_CONFIG && window.APP_CONFIG.cacheVersion) || '?';

  const tot = (c) => c ? totalOf(c) : '?';
  const cellRow = (label, c) => c
    ? `<tr><td>${label}</td><td>${c.records ?? '?'}</td><td>${c.praises ?? '?'}</td><td>${c.evaluations ?? '?'}</td><td>${c.aba ?? '?'}</td><td>${c.ketebure ?? '?'}</td><td><b>${tot(c)}</b></td></tr>`
    : `<tr><td>${label}</td><td colspan="6" style="color:#999;">取得不可</td></tr>`;

  const html = `
    <div class="modal-backdrop" id="diagnosticModal" style="display:flex;">
      <div class="modal" style="width:780px;max-width:95vw;max-height:90vh;overflow-y:auto;">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #ddd;">
          <h3 style="margin:0;font-size:16px;">📊 診断レポート</h3>
          <button id="diagCloseBtn" class="ghost" style="padding:4px 10px;">✕ 閉じる</button>
        </div>
        <div class="modal-body" style="padding:12px 14px;font-size:13px;">
          <div style="margin-bottom:10px;color:#777;font-size:11.5px;">SW cache: <b>${cacheVer}</b> / lastPull: ${lastPull}</div>
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:14px;">
            <thead><tr style="background:#f7f7fa;"><th style="text-align:left;padding:5px;">層</th><th>交友</th><th>ほめ</th><th>評価</th><th>ABA</th><th>けテ</th><th>合計</th></tr></thead>
            <tbody>
              ${cellRow('L1 ローカル', local)}
              ${cellRow('L2 IDB', idb)}
              ${cellRow('L3 クラウド', cl)}
            </tbody>
          </table>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
            <button class="primary" id="diagFullPullBtn">☁ クラウドから全件取得</button>
            <button class="ghost" id="diagFlushBtn">⏳ 未送信を再送 (${pq}件${pqAge ? ' / 最古' + pqAge + '分' : ''})</button>
            <button class="ghost" id="diagCopyBtn">📋 診断ログをコピー</button>
            <a href="diagnostic.html" target="_blank" class="ghost" style="padding:5px 10px;border:1px solid #ddd;border-radius:4px;text-decoration:none;color:#333;background:#fff;">🔗 詳細診断ページ</a>
            <a href="recovery.html" target="_blank" class="ghost" style="padding:5px 10px;border:1px solid #ddd;border-radius:4px;text-decoration:none;color:#333;background:#fff;">🆘 緊急復旧ツール</a>
          </div>
          <div style="background:#f9fafb;border:1px solid #eee;border-radius:4px;padding:8px;font-size:11.5px;font-family:ui-monospace,monospace;white-space:pre-wrap;" id="diagOutput">準備中…</div>
        </div>
      </div>
    </div>
  `;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstElementChild);

  const close = () => document.getElementById('diagnosticModal')?.remove();
  document.getElementById('diagCloseBtn')?.addEventListener('click', close);

  document.getElementById('diagFullPullBtn')?.addEventListener('click', async () => {
    if (typeof window.pullFromGas !== 'function') return;
    showToast?.('クラウドから全件取得中…');
    try {
      await window.pullFromGas({ fullPull: true });
      if (typeof window.refreshAll === 'function') window.refreshAll();
      showToast?.('✓ 全件取得完了', 'success');
      close();
    } catch (e) {
      showToast?.('全件取得失敗: ' + e.message, 'error');
    }
  });

  document.getElementById('diagFlushBtn')?.addEventListener('click', async () => {
    if (typeof window.flushPendingQueue !== 'function') return;
    showToast?.('未送信を再送中…');
    try {
      await window.flushPendingQueue();
      showToast?.('✓ 再送試行完了', 'success');
      refreshHealthBar();
    } catch (e) {
      showToast?.('再送失敗: ' + e.message, 'error');
    }
  });

  document.getElementById('diagCopyBtn')?.addEventListener('click', async () => {
    const report = await buildDiagnosticReportText({ local, idb, cl, pq, pqAge, lastPull, cfg, swReg, cacheVer });
    try {
      await navigator.clipboard.writeText(report);
      showToast?.('✓ 診断ログをコピーしました（管理者へ貼り付け可能）', 'success');
    } catch {
      // フォールバック
      const out = document.getElementById('diagOutput');
      if (out) out.textContent = report;
      showToast?.('クリップボード不可。下部に表示しました', 'error');
    }
  });

  // 初期表示としても診断ログを出しておく
  buildDiagnosticReportText({ local, idb, cl, pq, pqAge, lastPull, cfg, swReg, cacheVer })
    .then(text => {
      const out = document.getElementById('diagOutput');
      if (out) out.textContent = text;
    });
}

async function buildDiagnosticReportText(ctx) {
  const ua = navigator.userAgent;
  const lines = [];
  lines.push('=== 担任記録アプリ 診断レポート ===');
  lines.push('生成: ' + new Date().toISOString());
  lines.push('UA: ' + ua);
  lines.push('cache: ' + ctx.cacheVer);
  lines.push('SW: ' + (ctx.swReg ? (ctx.swReg.active ? 'active' : 'registered') : 'なし'));
  lines.push('lastPull: ' + ctx.lastPull);
  lines.push('');
  lines.push('--- 同期設定 ---');
  lines.push('enabled: ' + ctx.cfg.enabled + ' / autoSync: ' + ctx.cfg.autoSync);
  lines.push('endpoint: ' + ((ctx.cfg.endpoint || '').slice(0, 80)));
  lines.push('apiKey: ' + (ctx.cfg.apiKey ? '(設定済 ' + ctx.cfg.apiKey.length + '字)' : '(未設定)'));
  lines.push('');
  lines.push('--- 件数 ---');
  const fmt = (label, c) => label + ' = ' + (c ? JSON.stringify(c) + ' total=' + totalOf(c) : '取得不可');
  lines.push(fmt('L1', ctx.local));
  lines.push(fmt('L2', ctx.idb));
  lines.push(fmt('L3', ctx.cl));
  lines.push('pendingQueue = ' + ctx.pq + (ctx.pqAge ? ' (最古 ' + ctx.pqAge + '分)' : ''));
  lines.push('');
  lines.push('--- スナップショット数 ---');
  let snapCount = 0;
  for (let i = 0; i < 10; i++) {
    if (localStorage.getItem('interaction-snap-' + i)) snapCount++;
  }
  lines.push('snapshots = ' + snapCount + '/10');
  lines.push('shrink-log = ' + Object.keys(localStorage).filter(k => k.startsWith('interaction-shrink-log')).length);
  return lines.join('\n');
}

// ===== A4: 起動時自動診断（配布版で設定壊れを検出） =====

function startupAutoDiagnose() {
  try {
    const isDistribution = !!(window.APP_CONFIG && window.APP_CONFIG.mode === 'distribution');
    if (!isDistribution) return;
    const cfg = JSON.parse(localStorage.getItem('interactionApp_gasSync') || '{}');
    if (!cfg.endpoint || !cfg.apiKey) {
      // 初回起動 or 未設定 → setup-gas.html へ誘導
      setTimeout(() => {
        if (confirm('クラウド同期がまだ設定されていません。\n\nセットアップウィザードを開きますか？\n（記録はローカル保存だけでも使えますが、クラウド同期で他端末との共有・バックアップが可能になります）')) {
          // ポップアップブロック検出: window.open が null を返したら直接遷移
          let win = null;
          try { win = window.open('setup-gas.html', '_blank'); } catch (e) { console.warn('[startup] window.open error:', e); }
          if (!win || win.closed || typeof win.closed === 'undefined') {
            // ポップアップブロック → 案内表示 + 1クリックで遷移
            showToast?.('⚠ ポップアップがブロックされました。同タブでセットアップを開きます', 'error');
            setTimeout(() => {
              if (confirm('ブラウザのポップアップ設定を確認するか、同じタブでセットアップを開きますか？\n（OK = 同タブで開く / キャンセル = 設定タブへ）')) {
                location.href = 'setup-gas.html';
              } else {
                // 設定タブへ
                document.querySelector('.tab-btn[data-tab="settings"]')?.click();
              }
            }, 1500);
          }
        }
      }, 2000);
    } else if (cfg.endpoint && !/^https:\/\/script\.google\.com\//.test(cfg.endpoint)) {
      showToast?.('⚠ 同期URLの形式が不正です。設定タブで修正してください', 'error');
    }
  } catch (e) {
    console.warn('[startupAutoDiagnose]', e);
  }
}

// ===== A5: 個人Chrome診断ヘルパー =====
// HANDOVER の DevTools 貼付スクリプト相当を関数化、ボタン1クリックで実行
async function runChromeDiagnostic() {
  const lines = [];
  const log = (...args) => {
    const text = args.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ');
    lines.push(text);
    console.log(text);
  };
  try {
    const cfg = JSON.parse(localStorage.getItem('interactionApp_gasSync') || '{}');
    const lp = localStorage.getItem(LAST_PULL_KEY);
    const data = JSON.parse(localStorage.getItem('interactionApp_v1') || '{}');
    log('sync enabled:', cfg.enabled, 'autoSync:', cfg.autoSync);
    log('endpoint:', (cfg.endpoint || '').slice(0, 80));
    log('apiKey:', cfg.apiKey ? '(' + cfg.apiKey.length + '字)' : '(未設定)');
    log('lastPull:', lp);
    const total = (data.evaluations || []).length + (data.praises || []).length +
                  (data.records || []).length + (data.abaRecords || []).length +
                  (data.ketebureRecords || []).length;
    log('local total:', total);
    log('--- 強制全件pullを試行 ---');
    if (window.state && window.state.ui) window.state.ui.editingRecordId = null;
    localStorage.removeItem(LAST_PULL_KEY);
    if (typeof window.pullFromGas === 'function') {
      try {
        await window.pullFromGas({ fullPull: true });
        log('pullFromGas: success');
      } catch (e) {
        log('pullFromGas error:', e.message);
      }
      if (typeof window.refreshAll === 'function') window.refreshAll();
      const after = (window.state.evaluations || []).length + (window.state.praises || []).length +
                    (window.state.records || []).length + (window.state.abaRecords || []).length +
                    (window.state.ketebureRecords || []).length;
      log('after pull total:', after, '(diff', after - total, ')');
    } else {
      log('pullFromGas 未定義');
    }
  } catch (e) {
    log('診断エラー:', e.message);
  }
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showToast?.('✓ 診断結果をコピーしました（コンソールにも出力済）', 'success');
  } catch {
    showToast?.('診断完了。コンソールに出力しました', 'success');
  }
  return text;
}

// ===== 自動バックアップ有効化（リモートPOSTで GAS trigger 作成を試行） =====
// 既に有効化済かをチェックし、未有効なら install_auto_backups を試みる。
// scope 不足エラーなら GAS Editor を開く誘導モーダルを表示。
const AUTO_BACKUP_FLAG_KEY = 'interactionApp_autoBackupSetup';
const GAS_SCRIPT_EDITOR_URL = 'https://script.google.com/d/1ThCRpKVirUsUxOtsgN0CKLxijqeUNVzmT5SQm6j2hvl2y-sCfYgXpkK-/edit';

async function _gasAdminPost(action, extra) {
  const cfg = (() => {
    try { return JSON.parse(localStorage.getItem('interactionApp_gasSync') || '{}'); }
    catch { return {}; }
  })();
  if (!cfg.endpoint || !cfg.apiKey) throw new Error('GAS未設定');
  const body = Object.assign({ action: action, dataType: 'admin', key: cfg.apiKey }, extra || {});
  const res = await fetch(`${cfg.endpoint}?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow'
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'GAS error');
  return data;
}

async function setupAutoBackupsRemote(opts) {
  opts = opts || {};
  // すでに有効化済ならスキップ
  if (!opts.force && localStorage.getItem(AUTO_BACKUP_FLAG_KEY)) return { ok: true, skipped: true };
  try {
    const r = await _gasAdminPost('install_auto_backups');
    localStorage.setItem(AUTO_BACKUP_FLAG_KEY, new Date().toISOString());
    if (typeof showToast === 'function') {
      showToast('✅ 自動バックアップ(日次snapshot+週次Drive BU)を有効化しました', 'success');
    }
    return r;
  } catch (e) {
    const isPermErr = /権限|Authorization|script\.scriptapp|drive|send_mail|permission/i.test(e.message);
    if (isPermErr && !opts.silent) {
      _showOAuthGuideModal();
    }
    return { ok: false, error: e.message, needsAuth: isPermErr };
  }
}

async function listAutoBackupTriggers() {
  return _gasAdminPost('list_triggers');
}

function _showOAuthGuideModal() {
  if (document.getElementById('oauthGuideModal')) return;
  const html = `
    <div class="modal-backdrop" id="oauthGuideModal" style="display:flex;">
      <div class="modal" style="width:560px;max-width:95vw;">
        <div class="modal-header" style="padding:10px 14px;border-bottom:1px solid #ddd;">
          <h3 style="margin:0;font-size:16px;">🛡 自動バックアップ有効化（30秒・1度だけ）</h3>
        </div>
        <div class="modal-body" style="padding:14px;font-size:13px;line-height:1.6;">
          <p>毎日のsnapshot+毎週のDriveバックアップを有効化するには、Googleの認証が1回だけ必要です。</p>
          <ol style="margin:8px 0 12px 18px;padding:0;">
            <li>下のボタンで <b>GASエディタ</b> を開く（新しいタブ）</li>
            <li>関数選択ドロップダウン（上部）で <b>setupAllAutoBackups</b> を選ぶ</li>
            <li><b>「実行」</b>ボタンを押す → OAuth ダイアログで <b>「許可」</b></li>
            <li>「OK」アラートが出たらこのタブに戻り、<b>下の「再試行」</b>を押す</li>
          </ol>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="${GAS_SCRIPT_EDITOR_URL}" target="_blank" class="primary" style="padding:8px 14px;background:#1976d2;color:white;text-decoration:none;border-radius:4px;">📝 GASエディタを開く</a>
            <button class="ghost" id="oauthRetryBtn" style="padding:8px 14px;">🔁 再試行（戻ってから）</button>
            <button class="ghost" id="oauthSkipBtn" style="padding:8px 14px;">後で</button>
          </div>
          <div id="oauthGuideMsg" class="muted small" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstElementChild);

  const close = () => document.getElementById('oauthGuideModal')?.remove();
  document.getElementById('oauthSkipBtn').onclick = close;
  document.getElementById('oauthRetryBtn').onclick = async () => {
    const msgEl = document.getElementById('oauthGuideMsg');
    if (msgEl) msgEl.textContent = '⏳ 再試行中…';
    const r = await setupAutoBackupsRemote({ force: true, silent: true });
    if (r && r.ok) {
      if (msgEl) msgEl.innerHTML = '<b style="color:#2e7d32;">✓ 有効化成功！</b>';
      setTimeout(close, 1500);
    } else {
      if (msgEl) msgEl.innerHTML = '<b style="color:#c62828;">まだ承認されていません: ' + (r && r.error || '?') + '</b>';
    }
  };
}

// 起動時1度だけ試行（成功すれば flag が立って次回はスキップ）
async function tryAutoBackupSetupAtStartup() {
  // 個人版・syncConfig.enabled・未セットアップ の3条件がそろった時のみ
  try {
    const cfg = JSON.parse(localStorage.getItem('interactionApp_gasSync') || '{}');
    if (!cfg.enabled || !cfg.endpoint || !cfg.apiKey) return;
    if (localStorage.getItem(AUTO_BACKUP_FLAG_KEY)) return;
    // silent試行（失敗してもモーダル出さない・ボタンクリックを待つ）
    const r = await setupAutoBackupsRemote({ silent: true });
    if (r && r.ok) {
      console.log('[health] 自動バックアップが起動時に有効化されました');
    } else if (r && r.needsAuth) {
      console.log('[health] 自動バックアップ未有効化（OAuth承認必要）。設定タブから手動で有効化可');
    }
  } catch (e) {
    console.debug('[health] auto backup startup attempt:', e.message);
  }
}

// 公開
window.openDiagnosticModal = openDiagnosticModal;
window.refreshHealthBar = refreshHealthBar;
window.runChromeDiagnostic = runChromeDiagnostic;
window.setupAutoBackupsRemote = setupAutoBackupsRemote;
window.listAutoBackupTriggers = listAutoBackupTriggers;
window.showAutoBackupGuide = _showOAuthGuideModal;

// ===== 初期化 =====
function startMonitoring() {
  // 起動前回のsnapshotを復元（A2改良: 再起動後も20%減検知）
  if (!_lastSnapshot) {
    try {
      const raw = localStorage.getItem('interactionApp_healthSnapshot');
      if (raw) _lastSnapshot = JSON.parse(raw);
    } catch (_) {}
  }

  refreshHealthBar();
  // グローバルに ticker を保持（モジュール再ロード時の clearInterval 漏れ防止）
  if (window._healthMonitorTicker) clearInterval(window._healthMonitorTicker);
  window._healthMonitorTicker = setInterval(() => {
    if (document.hidden) return;
    refreshHealthBar();
  }, REFRESH_INTERVAL_MS);
  _ticker = window._healthMonitorTicker;

  // ヘッダクリックで診断モーダル
  const bar = document.getElementById('storageHealthBar');
  if (bar && !bar._wired) {
    bar._wired = true;
    bar.addEventListener('click', openDiagnosticModal);
  }

  // 起動時自動診断
  startupAutoDiagnose();

  // 起動時に自動バックアップ有効化を試行（既に有効ならスキップ・失敗ならモーダル出さない）
  setTimeout(() => tryAutoBackupSetupAtStartup(), 5000);
}

// app.js の init() の後に呼ぶ。DOMContentLoaded を待たないと state 未定義
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(startMonitoring, 1500));
} else {
  setTimeout(startMonitoring, 1500);
}

})();
