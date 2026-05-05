'use strict';
/* ==========================================================================
 * centrality-extra.js — 中心性タブの追加指標
 *
 * 既存の Degree/Strength/Betweenness/Louvain に加えて:
 *  - Closeness（近接中心性）— BFS最短経路の逆数和
 *  - Eigenvector（固有ベクトル中心性）— power iteration
 * ========================================================================== */

(function() {

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

// ===== 隣接リスト構築（無向ネットワーク） =====
function buildAdjacency(records, students) {
  const ids = students.map(s => s.id);
  const adj = new Map(ids.map(id => [id, new Map()]));
  for (const r of records) {
    if (!r) continue;
    const all = new Set([r.subject, ...(Array.isArray(r.members) ? r.members : [])].filter(x => x != null));
    const arr = Array.from(all);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (!adj.has(a) || !adj.has(b)) continue;
        adj.get(a).set(b, (adj.get(a).get(b) || 0) + 1);
        adj.get(b).set(a, (adj.get(b).get(a) || 0) + 1);
      }
    }
  }
  return adj;
}

// ===== Closeness Centrality（BFS） =====
function computeCloseness(records, students) {
  const adj = buildAdjacency(records, students);
  const ids = students.map(s => s.id);
  const N = ids.length;
  const result = [];
  for (const src of ids) {
    // BFS で最短距離
    const dist = new Map(ids.map(id => [id, Infinity]));
    dist.set(src, 0);
    const queue = [src];
    while (queue.length > 0) {
      const u = queue.shift();
      const neighbors = adj.get(u);
      if (!neighbors) continue;
      for (const v of neighbors.keys()) {
        if (dist.get(v) === Infinity) {
          dist.set(v, dist.get(u) + 1);
          queue.push(v);
        }
      }
    }
    let sum = 0, reachable = 0;
    for (const [id, d] of dist.entries()) {
      if (id !== src && d !== Infinity) { sum += d; reachable++; }
    }
    // Wasserman & Faust normalized closeness
    const closeness = (reachable > 0 && sum > 0)
      ? (reachable / sum) * (reachable / (N - 1))
      : 0;
    result.push({ id: src, closeness, reachable });
  }
  result.sort((a, b) => b.closeness - a.closeness);
  return result;
}

// ===== Eigenvector Centrality（power iteration） =====
function computeEigenvector(records, students, maxIter) {
  maxIter = maxIter || 100;
  const adj = buildAdjacency(records, students);
  const ids = students.map(s => s.id);
  const N = ids.length;
  if (N === 0) return [];
  // 隣接行列を疎で保持
  const idx = new Map(ids.map((id, i) => [id, i]));
  const v = new Array(N).fill(1 / Math.sqrt(N));

  for (let iter = 0; iter < maxIter; iter++) {
    const newV = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      const neighbors = adj.get(ids[i]);
      if (!neighbors) continue;
      for (const [nid, w] of neighbors.entries()) {
        const j = idx.get(nid);
        if (j !== undefined) newV[i] += w * v[j];
      }
    }
    // L2 正規化
    let norm = 0;
    for (let i = 0; i < N; i++) norm += newV[i] * newV[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-12) break;
    let diff = 0;
    for (let i = 0; i < N; i++) {
      const next = newV[i] / norm;
      diff += Math.abs(next - v[i]);
      v[i] = next;
    }
    if (diff < 1e-6) break;
  }
  const result = ids.map((id, i) => ({ id, eigen: v[i] }));
  result.sort((a, b) => b.eigen - a.eigen);
  return result;
}

// ===== UI 注入 =====
function injectExtraCentralityUI() {
  const tab = document.getElementById('tab-centrality');
  if (!tab || document.getElementById('cxExtraSection')) return;
  const sec = document.createElement('div');
  sec.className = 'card';
  sec.id = 'cxExtraSection';
  sec.style.margin = '12px';
  sec.innerHTML =
    '<h3>🌐 追加指標: Closeness / Eigenvector</h3>' +
    '<p class="muted small">' +
    'Closeness（近接中心性）= 他の児童に到達する最短経路の短さ（情報伝達の速さ）。<br>' +
    'Eigenvector（固有ベクトル中心性）= 影響力の高い児童とつながる児童ほど高い（影響度）。' +
    '</p>' +
    '<div class="cx-grid"><div><h4>Closeness Top10</h4><div id="cxCloseTable"></div></div>' +
    '<div><h4>Eigenvector Top10</h4><div id="cxEigenTable"></div></div></div>';
  tab.appendChild(sec);
}

function refreshExtra() {
  if (!window.state || !Array.isArray(window.state.records)) return;
  const closeT = document.getElementById('cxCloseTable');
  const eigenT = document.getElementById('cxEigenTable');
  if (!closeT || !eigenT) return;
  const recs = window.state.records;
  const studs = window.state.students || [];
  if (recs.length === 0 || studs.length === 0) {
    closeT.innerHTML = eigenT.innerHTML = '<p class="muted">記録または名簿が不足しています</p>';
    return;
  }

  const close = computeCloseness(recs, studs).slice(0, 10);
  const eigen = computeEigenvector(recs, studs).slice(0, 10);

  let cHtml = '<table class="ap-table"><thead><tr><th>順</th><th>児童</th><th>到達数</th><th>Closeness</th></tr></thead><tbody>';
  close.forEach((row, i) => {
    cHtml += '<tr><td>' + (i + 1) + '</td><td>' + _esc(_name(row.id)) + '</td>'
          + '<td>' + row.reachable + '</td>'
          + '<td><b>' + row.closeness.toFixed(3) + '</b></td></tr>';
  });
  cHtml += '</tbody></table>';

  let eHtml = '<table class="ap-table"><thead><tr><th>順</th><th>児童</th><th>Eigenvector</th></tr></thead><tbody>';
  eigen.forEach((row, i) => {
    eHtml += '<tr><td>' + (i + 1) + '</td><td>' + _esc(_name(row.id)) + '</td>'
          + '<td><b>' + row.eigen.toFixed(3) + '</b></td></tr>';
  });
  eHtml += '</tbody></table>';

  closeT.innerHTML = cHtml;
  eigenT.innerHTML = eHtml;
}

function injectStyles() {
  if (document.getElementById('cxStyles')) return;
  const s = document.createElement('style');
  s.id = 'cxStyles';
  s.textContent =
    '.cx-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }' +
    '.cx-grid h4 { margin:8px 0 4px; font-size:12px; color:#444; padding-bottom:2px; border-bottom:1px solid #ddd; }';
  document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn && btn.getAttribute('data-tab') === 'centrality') {
      setTimeout(() => {
        injectExtraCentralityUI();
        refreshExtra();
      }, 80);
    }
  });
});

window.CentralityExtra = {
  computeCloseness, computeEigenvector, refresh: refreshExtra
};

})();
