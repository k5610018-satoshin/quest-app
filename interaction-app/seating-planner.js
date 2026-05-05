'use strict';
/* ==========================================================================
 * seating-planner.js — 座席配置プランナ（NG/性別/希望列対応）
 *
 * 戸田小席替えアプリ（gas-sekigae-v2）のアルゴリズムを移植:
 *  - calculateConflicts: NG/性別/希望列/同班NGを統一的に評価
 *  - リトライ式シャッフル（最大80回）
 *  - 焼きなまし法（Simulated Annealing）で局所最適脱出
 *
 * 既存「🪑 席」タブの末尾にUIを注入（既存班分け機能はそのまま残す）
 * ========================================================================== */

(function() {

// ===== ヘルパー =====
function _esc(s) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _name(id) {
  const s = (window.state && window.state.students || []).find(x => x.id === id);
  return s ? s.name : '?';
}

function _gender(id) {
  const s = (window.state && window.state.students || []).find(x => x.id === id);
  if (s && (s.gender === 'M' || s.gender === 'F')) return s.gender;
  // attributes フォールバック
  const attr = window.state && window.state.attributes && window.state.attributes[id];
  if (attr && (attr.gender === 'M' || attr.gender === 'F')) return attr.gender;
  return null;
}

// 過去の隣ペア集合を構築（席替えスナップショットから）
function buildPastNeighborSet(snapshots, rows, cols) {
  const set = new Map();  // 'a-b' -> count
  for (const snap of (snapshots || [])) {
    if (!snap || !Array.isArray(snap.groups)) continue;
    // groups は班単位 [[ids],[ids],...] なので、班内全員を「隣同士」とみなす
    for (const grp of snap.groups) {
      for (let i = 0; i < grp.length; i++) {
        for (let j = i + 1; j < grp.length; j++) {
          const a = Math.min(grp[i], grp[j]);
          const b = Math.max(grp[i], grp[j]);
          const k = a + '-' + b;
          set.set(k, (set.get(k) || 0) + 1);
        }
      }
    }
  }
  return set;
}

// ===== NG設定の保存場所 =====
function getNgConfig() {
  if (!window.state.settings.seatingConfig) {
    window.state.settings.seatingConfig = {
      rows: 5, cols: 6,
      ngLists: {},          // {studentId: [ngStudentId, ...]}
      preferredRows: {},    // {studentId: [行番号]} (1始まり)
      genderAlternate: false,  // 男女交互
      avoidPastPairs: true     // 過去ペア回避
    };
  }
  return window.state.settings.seatingConfig;
}

// ===== 制約評価 =====
function calculateConflicts(grid, rows, cols, options) {
  const cfg = options || getNgConfig();
  const pastSet = options.pastSet || new Map();
  let conflicts = 0;

  // 4方向隣接チェック（前後左右）
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = grid[r * cols + c];
      if (!id) continue;
      // 右隣
      if (c + 1 < cols) {
        const right = grid[r * cols + (c + 1)];
        if (right) {
          conflicts += _pairConflict(id, right, cfg, pastSet);
        }
      }
      // 下隣
      if (r + 1 < rows) {
        const below = grid[(r + 1) * cols + c];
        if (below) {
          conflicts += _pairConflict(id, below, cfg, pastSet);
        }
      }
    }
  }
  // 座席希望違反
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = grid[r * cols + c];
      if (!id) continue;
      const pref = cfg.preferredRows && cfg.preferredRows[id];
      if (Array.isArray(pref) && pref.length > 0) {
        // 行番号は 1 始まりで保存される想定
        if (pref.indexOf(r + 1) < 0) conflicts += 5;  // 重めペナルティ
      }
    }
  }
  return conflicts;
}

function _pairConflict(a, b, cfg, pastSet) {
  let cost = 0;
  // NG リスト（双方向）
  const ngA = cfg.ngLists && cfg.ngLists[a];
  const ngB = cfg.ngLists && cfg.ngLists[b];
  if (Array.isArray(ngA) && ngA.indexOf(b) >= 0) cost += 10;
  if (Array.isArray(ngB) && ngB.indexOf(a) >= 0) cost += 10;
  // 男女交互
  if (cfg.genderAlternate) {
    const ga = _gender(a), gb = _gender(b);
    if (ga && gb && ga === gb) cost += 1;
  }
  // 過去ペア回避
  if (cfg.avoidPastPairs && pastSet) {
    const key = Math.min(a, b) + '-' + Math.max(a, b);
    if (pastSet.has(key)) cost += pastSet.get(key) * 2;  // 過去回数に比例
  }
  return cost;
}

// ===== シャッフル（リトライ式） =====
function shuffleSeatsRetry(students, rows, cols, options, maxRetry) {
  maxRetry = maxRetry || 80;
  const ids = students.slice();
  let bestGrid = null;
  let bestCost = Infinity;

  for (let attempt = 0; attempt < maxRetry; attempt++) {
    const shuffled = ids.slice();
    // Fisher-Yates
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // grid に詰める
    const grid = new Array(rows * cols).fill(null);
    for (let i = 0; i < shuffled.length && i < rows * cols; i++) {
      grid[i] = shuffled[i];
    }
    const cost = calculateConflicts(grid, rows, cols, options);
    if (cost < bestCost) {
      bestCost = cost;
      bestGrid = grid.slice();
      if (cost === 0) break;
    }
  }
  return { grid: bestGrid, cost: bestCost };
}

// ===== 焼きなまし法 =====
function simulatedAnnealing(students, rows, cols, options, maxIter) {
  maxIter = maxIter || 2000;
  const ids = students.slice();
  // 初期解（Fisher-Yatesでランダム）
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  let grid = new Array(rows * cols).fill(null);
  for (let i = 0; i < ids.length && i < rows * cols; i++) grid[i] = ids[i];
  let cost = calculateConflicts(grid, rows, cols, options);
  let bestGrid = grid.slice();
  let bestCost = cost;

  let T = 10.0;
  const cooling = 0.995;
  const total = rows * cols;

  for (let iter = 0; iter < maxIter; iter++) {
    // ランダムに2席を swap
    const i = Math.floor(Math.random() * total);
    let j = Math.floor(Math.random() * total);
    while (j === i) j = Math.floor(Math.random() * total);
    [grid[i], grid[j]] = [grid[j], grid[i]];
    const newCost = calculateConflicts(grid, rows, cols, options);
    const delta = newCost - cost;
    if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
      cost = newCost;
      if (cost < bestCost) {
        bestCost = cost;
        bestGrid = grid.slice();
        if (bestCost === 0) break;
      }
    } else {
      // 元に戻す
      [grid[i], grid[j]] = [grid[j], grid[i]];
    }
    T *= cooling;
  }
  return { grid: bestGrid, cost: bestCost };
}

// ===== UI 注入 =====
function injectPlannerUI() {
  const tab = document.getElementById('tab-seating');
  if (!tab || document.getElementById('spPlannerSection')) return;
  const sec = document.createElement('div');
  sec.className = 'card';
  sec.id = 'spPlannerSection';
  sec.innerHTML =
    '<h3>🪑 座席配置プランナ（NG/性別/希望列）</h3>' +
    '<p class="muted small">机を行×列で配置し、自動で座席を割り当てます。NG設定や過去ペア回避が考慮されます。</p>' +
    '<div class="filter-bar">' +
    ' <label>行: <input type="number" id="spRows" min="2" max="8" value="5" style="width:50px;"></label>' +
    ' <label>列: <input type="number" id="spCols" min="2" max="8" value="6" style="width:50px;"></label>' +
    ' <label><input type="checkbox" id="spAvoidPast" checked> 過去ペア回避</label>' +
    ' <label><input type="checkbox" id="spGenderAlt"> 隣に同性が並ばないようにする</label>' +
    ' <button class="ghost" id="spNgEditBtn">⚙ NG設定を編集</button>' +
    ' <button class="primary" id="spGenerateBtn">🎲 自動配置（リトライ式）</button>' +
    ' <button class="primary" id="spSaBtn">🔥 焼きなまし最適化</button>' +
    ' <button class="ghost" id="spSaveSnapshotBtn">💾 履歴に保存</button>' +
    '</div>' +
    '<div id="spStatus" class="muted small" style="margin:6px 0;"></div>' +
    '<div id="spGridArea"></div>' +
    '<div id="spNgEditor" style="display:none;margin-top:12px;"></div>';
  tab.appendChild(sec);
}

let _lastGrid = null;
let _lastRows = 5;
let _lastCols = 6;

function generateRetry() {
  const cfg = getNgConfig();
  cfg.rows = parseInt(document.getElementById('spRows').value, 10) || 5;
  cfg.cols = parseInt(document.getElementById('spCols').value, 10) || 6;
  cfg.avoidPastPairs = document.getElementById('spAvoidPast').checked;
  cfg.genderAlternate = document.getElementById('spGenderAlt').checked;
  saveCfg();

  const ids = (window.state.students || []).map(s => s.id);
  if (ids.length === 0) {
    document.getElementById('spStatus').textContent = '名簿が空です。設定タブから児童を登録してください。';
    return;
  }
  const pastSet = buildPastNeighborSet(window.state.seatingSnapshots, cfg.rows, cfg.cols);
  const result = shuffleSeatsRetry(ids, cfg.rows, cfg.cols, { ...cfg, pastSet }, 80);
  _lastGrid = result.grid;
  _lastRows = cfg.rows; _lastCols = cfg.cols;
  document.getElementById('spStatus').textContent = `✓ コスト: ${result.cost}（NG×10, 男女同性×1, 過去ペア×回数×2, 希望違反×5）`;
  renderGrid(result.grid, cfg.rows, cfg.cols);
}

function generateSA() {
  const cfg = getNgConfig();
  cfg.rows = parseInt(document.getElementById('spRows').value, 10) || 5;
  cfg.cols = parseInt(document.getElementById('spCols').value, 10) || 6;
  cfg.avoidPastPairs = document.getElementById('spAvoidPast').checked;
  cfg.genderAlternate = document.getElementById('spGenderAlt').checked;
  saveCfg();

  const ids = (window.state.students || []).map(s => s.id);
  if (ids.length === 0) {
    document.getElementById('spStatus').textContent = '名簿が空です。';
    return;
  }
  const pastSet = buildPastNeighborSet(window.state.seatingSnapshots, cfg.rows, cfg.cols);
  document.getElementById('spStatus').textContent = '🔥 焼きなまし中...';
  setTimeout(() => {
    const result = simulatedAnnealing(ids, cfg.rows, cfg.cols, { ...cfg, pastSet }, 3000);
    _lastGrid = result.grid;
    _lastRows = cfg.rows; _lastCols = cfg.cols;
    document.getElementById('spStatus').textContent = `🔥 焼きなまし完了 / コスト: ${result.cost}`;
    renderGrid(result.grid, cfg.rows, cfg.cols);
  }, 50);
}

function renderGrid(grid, rows, cols) {
  const area = document.getElementById('spGridArea');
  if (!area) return;
  const cellW = 110, cellH = 50, pad = 8;
  let html = '<div style="overflow-x:auto;"><table class="sp-grid"><tbody>';
  html += '<tr><th></th>';
  for (let c = 0; c < cols; c++) html += '<th>' + (c + 1) + '列</th>';
  html += '</tr>';
  // 教卓
  html += '<tr><td colspan="' + (cols + 1) + '" class="sp-podium">📋 教卓</td></tr>';
  for (let r = 0; r < rows; r++) {
    html += '<tr><th>' + (r + 1) + '行</th>';
    for (let c = 0; c < cols; c++) {
      const id = grid[r * cols + c];
      if (id) {
        const s = (window.state.students || []).find(x => x.id === id);
        const g = _gender(id);
        const colorClass = g === 'M' ? 'sp-male' : g === 'F' ? 'sp-female' : '';
        html += '<td class="sp-cell ' + colorClass + '">'
              + '<div class="sp-num">' + id + '</div>'
              + '<div class="sp-name">' + _esc(s ? s.name : '?') + '</div>'
              + '</td>';
      } else {
        html += '<td class="sp-cell sp-empty">空席</td>';
      }
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  area.innerHTML = html;
}

function saveSnapshot() {
  if (!_lastGrid) {
    alert('配置がまだ生成されていません');
    return;
  }
  const label = prompt('スナップショットのラベルを入力（例: 5月席替え）', '席替え-' + new Date().toISOString().slice(0,10));
  if (!label) return;
  // 各行を「班」として保存（隣同士=同班とみなす近似。本来は班分けと違うが互換のため）
  // より正確には、4人ずつ同班にまとめる
  const groups = [];
  // 4列×N行構成では「2行×2列」を1班とする。それ以外は1行を1班に簡易化
  for (let r = 0; r < _lastRows; r++) {
    const row = [];
    for (let c = 0; c < _lastCols; c++) {
      const id = _lastGrid[r * _lastCols + c];
      if (id) row.push(id);
    }
    if (row.length > 0) groups.push(row);
  }
  const snap = {
    id: 'seat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    date: new Date().toISOString().slice(0, 10),
    label: label,
    groups: groups,
    grid: _lastGrid.slice(),
    rows: _lastRows,
    cols: _lastCols,
    timestamp: new Date().toISOString()
  };
  window.state.seatingSnapshots.push(snap);
  if (typeof window.saveState === 'function') window.saveState();
  document.getElementById('spStatus').textContent = '💾 履歴に保存しました: ' + label;
}

// ===== NG設定エディタ =====
function openNgEditor() {
  const editor = document.getElementById('spNgEditor');
  if (!editor) return;
  if (editor.style.display !== 'none') {
    editor.style.display = 'none';
    return;
  }
  const cfg = getNgConfig();
  const studs = (window.state.students || []).slice().sort((a, b) => a.id - b.id);
  let html = '<div class="card" style="background:#f9fafb;">' +
    '<h3>NG設定 / 座席希望</h3>' +
    '<p class="muted small">NG出席番号: 半角カンマ区切り（例: 5,12,20）／ 希望列: 1〜' + cfg.cols + '（複数指定OK）</p>' +
    '<table class="settings-table"><tr><th>番号</th><th>名前</th><th>NG</th><th>希望行</th></tr>';
  for (const s of studs) {
    const ngs = (cfg.ngLists[s.id] || []).join(',');
    const prefs = (cfg.preferredRows[s.id] || []).join(',');
    html += '<tr data-sid="' + s.id + '">'
          + '<td>' + s.id + '</td>'
          + '<td>' + _esc(s.name) + '</td>'
          + '<td><input type="text" class="sp-ng-input" value="' + _esc(ngs) + '" placeholder="例: 5,12" style="width:120px;"></td>'
          + '<td><input type="text" class="sp-pref-input" value="' + _esc(prefs) + '" placeholder="例: 1" style="width:80px;"></td>'
          + '</tr>';
  }
  html += '</table>'
        + '<div class="btn-row" style="margin-top:8px;">'
        + ' <button class="primary" id="spNgSaveBtn">保存</button>'
        + ' <button class="ghost" id="spNgCloseBtn">閉じる</button>'
        + '</div></div>';
  editor.innerHTML = html;
  editor.style.display = 'block';

  document.getElementById('spNgSaveBtn').addEventListener('click', () => {
    const newNg = {};
    const newPref = {};
    document.querySelectorAll('#spNgEditor tr[data-sid]').forEach(tr => {
      const sid = parseInt(tr.dataset.sid, 10);
      const ngStr = tr.querySelector('.sp-ng-input').value.trim();
      const prefStr = tr.querySelector('.sp-pref-input').value.trim();
      if (ngStr) {
        const arr = ngStr.split(/[,，\s]+/).map(s => parseInt(s, 10)).filter(n => n > 0);
        if (arr.length > 0) newNg[sid] = arr;
      }
      if (prefStr) {
        const arr = prefStr.split(/[,，\s]+/).map(s => parseInt(s, 10)).filter(n => n > 0);
        if (arr.length > 0) newPref[sid] = arr;
      }
    });
    cfg.ngLists = newNg;
    cfg.preferredRows = newPref;
    saveCfg();
    editor.style.display = 'none';
    document.getElementById('spStatus').textContent = '✓ NG設定を保存しました';
  });
  document.getElementById('spNgCloseBtn').addEventListener('click', () => {
    editor.style.display = 'none';
  });
}

function saveCfg() {
  if (typeof window.saveState === 'function') window.saveState();
}

// ===== スタイル =====
function injectStyles() {
  if (document.getElementById('spStyles')) return;
  const s = document.createElement('style');
  s.id = 'spStyles';
  s.textContent =
    '.sp-grid { border-collapse: collapse; margin: 8px auto; }' +
    '.sp-grid th { background: #f5f7fa; padding: 4px 8px; font-size: 11px; color: #666; }' +
    '.sp-grid td.sp-podium { background: #fff5e6; text-align: center; padding: 4px; font-size: 12px; color: #a06a00; border: 1px dashed #d4a017; }' +
    '.sp-cell { width: 110px; height: 56px; border: 1px solid #ccc; vertical-align: middle; text-align: center; padding: 4px; }' +
    '.sp-cell.sp-empty { background: #f5f5f5; color: #aaa; font-size: 10px; }' +
    '.sp-cell.sp-male { background: #e3f2fd; }' +
    '.sp-cell.sp-female { background: #fce4ec; }' +
    '.sp-num { font-size: 10px; color: #777; }' +
    '.sp-name { font-size: 13px; font-weight: 600; color: #2c3e50; line-height: 1.1; }';
  document.head.appendChild(s);
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  // 席タブ表示時に注入
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn && btn.getAttribute('data-tab') === 'seating') {
      setTimeout(() => {
        injectPlannerUI();
        // ボタンに登録（重複防止）
        const gen = document.getElementById('spGenerateBtn');
        if (gen && !gen._bound) {
          gen._bound = true;
          gen.addEventListener('click', generateRetry);
          document.getElementById('spSaBtn').addEventListener('click', generateSA);
          document.getElementById('spSaveSnapshotBtn').addEventListener('click', saveSnapshot);
          document.getElementById('spNgEditBtn').addEventListener('click', openNgEditor);
          // 設定の値を反映
          const cfg = getNgConfig();
          document.getElementById('spRows').value = cfg.rows || 5;
          document.getElementById('spCols').value = cfg.cols || 6;
          document.getElementById('spAvoidPast').checked = cfg.avoidPastPairs !== false;
          document.getElementById('spGenderAlt').checked = !!cfg.genderAlternate;
        }
      }, 80);
    }
  });
});

window.SeatingPlanner = {
  calculateConflicts: calculateConflicts,
  shuffleSeatsRetry: shuffleSeatsRetry,
  simulatedAnnealing: simulatedAnnealing,
  buildPastNeighborSet: buildPastNeighborSet
};

})();
