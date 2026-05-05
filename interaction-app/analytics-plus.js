'use strict';
/* ==========================================================================
 * analytics-plus.js — 分析タブの拡張
 *
 * 追加機能:
 *  - PMI / NPMI（点ごとの相互情報量）— 集計タブ末尾
 *  - Bootstrap信頼区間（Jaccard係数）— 比較タブ末尾
 *  - 7日移動平均グラフ — 時系列タブ末尾
 *  - 児童×日マトリクス（直近30日）— 分布タブ末尾
 *
 * 既存 app.js は触らない。タブ切替時に DOM 末尾へ自動注入する。
 * ========================================================================== */

(function() {

// ===== ペア共起の集計 =====
function buildPairCoOccurrence(records) {
  const pairs = new Map();   // 'a-b' (a<b) -> count
  const single = new Map();  // id -> count
  const total = records.length;
  for (const r of records) {
    if (!r) continue;
    const all = [r.subject, ...(Array.isArray(r.members) ? r.members : [])].filter(x => x != null);
    const uniq = Array.from(new Set(all));
    for (const id of uniq) single.set(id, (single.get(id) || 0) + 1);
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const a = Math.min(uniq[i], uniq[j]);
        const b = Math.max(uniq[i], uniq[j]);
        const k = `${a}-${b}`;
        pairs.set(k, (pairs.get(k) || 0) + 1);
      }
    }
  }
  return { pairs, single, total };
}

// ===== PMI 計算 =====
function computePMI(records) {
  const { pairs, single, total } = buildPairCoOccurrence(records);
  const result = [];
  for (const [k, count] of pairs.entries()) {
    const [a, b] = k.split('-').map(Number);
    const ca = single.get(a) || 0;
    const cb = single.get(b) || 0;
    if (ca === 0 || cb === 0 || total === 0) continue;
    const pxy = count / total;
    const px = ca / total;
    const py = cb / total;
    const pmi = Math.log2(pxy / (px * py));
    const npmi = pxy === 1 ? pmi : pmi / -Math.log2(pxy);
    result.push({ a, b, count, pmi, npmi });
  }
  result.sort((x, y) => y.npmi - x.npmi);
  return result;
}

// ===== Jaccard信頼区間 (Bootstrap) =====
function bootstrapJaccardCI(records, a, b, nResamples) {
  nResamples = nResamples || 300;
  const n = records.length;
  if (n === 0) return null;
  const samples = [];
  for (let r = 0; r < nResamples; r++) {
    let aCount = 0, bCount = 0, both = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      const rec = records[idx];
      const all = new Set([rec.subject, ...(Array.isArray(rec.members) ? rec.members : [])]);
      const ha = all.has(a);
      const hb = all.has(b);
      if (ha) aCount++;
      if (hb) bCount++;
      if (ha && hb) both++;
    }
    const union = aCount + bCount - both;
    if (union > 0) samples.push(both / union);
  }
  if (samples.length === 0) return null;
  samples.sort((x, y) => x - y);
  const lo = samples[Math.floor(samples.length * 0.025)];
  const hi = samples[Math.floor(samples.length * 0.975)];
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  return { lo, hi, mean };
}

// ===== 移動平均 =====
function computeRollingMean(values, win) {
  win = win || 7;
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - win + 1);
    const slice = values.slice(start, i + 1);
    out[i] = slice.reduce((s, v) => s + v, 0) / slice.length;
  }
  return out;
}

// ===== 児童×日マトリクス =====
function _localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _collectAllObservations() {
  // 全モード（交友/ほめ/評価/けテぶれ/ABA）の観察イベントを集約
  const events = [];
  const st = window.state || {};
  for (const r of (st.records || [])) {
    if (!r || !r.date) continue;
    if (r.subject != null) events.push({ date: r.date, studentId: r.subject });
    for (const m of (r.members || [])) events.push({ date: r.date, studentId: m });
  }
  for (const p of (st.praises || [])) {
    if (p && p.date && p.studentId != null) events.push({ date: p.date, studentId: p.studentId });
  }
  for (const e of (st.evaluations || [])) {
    if (e && e.date && e.studentId != null) events.push({ date: e.date, studentId: e.studentId });
  }
  for (const k of (st.ketebureRecords || [])) {
    if (k && k.date && k.studentId != null) events.push({ date: k.date, studentId: k.studentId });
  }
  for (const a of (st.abaRecords || [])) {
    if (a && a.date && a.studentId != null) events.push({ date: a.date, studentId: a.studentId });
    if (a && a.date && a.targetStudentId != null) events.push({ date: a.date, studentId: a.targetStudentId });
  }
  return events;
}

function computeStudentDayMatrix(records, students, days) {
  // records 引数は互換のため残すが、実際には全モード合算で算出
  days = days || 30;
  const today = new Date();
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(_localDate(d));
  }
  const dateIdx = new Map(dates.map((d, i) => [d, i]));
  const matrix = students.map(s => ({ id: s.id, name: s.name, counts: new Array(days).fill(0) }));
  const idIdx = new Map(students.map((s, i) => [s.id, i]));
  const events = _collectAllObservations();
  for (const ev of events) {
    const di = dateIdx.get(ev.date);
    if (di === undefined) continue;
    const si = idIdx.get(ev.studentId);
    if (si !== undefined) matrix[si].counts[di]++;
  }
  return { dates, matrix };
}

// ===== UI 注入 =====
function injectAnalyticsUI() {
  const summaryTab = document.getElementById('tab-summary');
  if (summaryTab && !document.getElementById('apPmiSection')) {
    const sec = document.createElement('div');
    sec.className = 'card';
    sec.id = 'apPmiSection';
    sec.style.margin = '12px';
    sec.innerHTML =
      '<h3>📊 PMI（点ごとの相互情報量）— 偶然以上に共起しているペア</h3>' +
      '<p class="muted small">PMI &gt; 0: 偶然より多く共起、PMI &lt; 0: 避けてる傾向。NPMI(-1〜+1)はPMIの正規化版。</p>' +
      '<div id="apPmiTable"></div>';
    summaryTab.appendChild(sec);
  }
  const compareTab = document.getElementById('tab-compare');
  if (compareTab && !document.getElementById('apCiSection')) {
    const sec = document.createElement('div');
    sec.className = 'card';
    sec.id = 'apCiSection';
    sec.style.margin = '12px';
    sec.innerHTML =
      '<h3>📐 Jaccard 95%信頼区間（Bootstrap, n=300）</h3>' +
      '<p class="muted small">記録数が少ないペア（5未満）は信頼区間が広く、結果は参考程度。</p>' +
      '<div id="apCiTable"></div>';
    compareTab.appendChild(sec);
  }
  const timelineTab = document.getElementById('tab-timeline');
  if (timelineTab && !document.getElementById('apRollingSection')) {
    const sec = document.createElement('div');
    sec.className = 'card';
    sec.id = 'apRollingSection';
    sec.style.margin = '12px';
    sec.innerHTML =
      '<h3>📈 記録数の推移（直近60日 + 7日移動平均）</h3>' +
      '<div id="apRollingChart" style="position:relative;height:170px;"></div>' +
      '<p class="muted small">薄い棒=その日の記録数、赤線=7日移動平均（短期ノイズ除去）</p>';
    timelineTab.appendChild(sec);
  }
  const heatmapTab = document.getElementById('tab-heatmap');
  if (heatmapTab && !document.getElementById('apMatrixSection')) {
    const sec = document.createElement('div');
    sec.className = 'card';
    sec.id = 'apMatrixSection';
    sec.style.margin = '12px';
    sec.innerHTML =
      '<h3>🟦 児童 × 日 マトリクス（直近30日・全モード合算）</h3>' +
      '<p class="muted small">行=児童、列=日付、セル色=その日に観察された回数（交友/ほめ/評価/けテぶれ/ABA合算）。空欄が続く児童 = 観察漏れ候補。「計0」の児童は赤字で警告。</p>' +
      '<div id="apMatrix" style="overflow-x:auto;max-height:480px;overflow-y:auto;"></div>';
    heatmapTab.appendChild(sec);
  }
}

// ===== ヘルパー =====
function _esc(s) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _name(id) {
  if (typeof window.getStudentName === 'function') return window.getStudentName(id);
  if (window.state && Array.isArray(window.state.students)) {
    const s = window.state.students.find(x => x.id === id);
    if (s) return s.name;
  }
  return '(ID:' + id + ')';
}

// ===== タブ別レンダリング =====
function refreshPmiTable() {
  const target = document.getElementById('apPmiTable');
  if (!target) return;
  const recs = (window.state && window.state.records) || [];
  if (recs.length === 0) { target.innerHTML = '<p class="muted">記録がありません</p>'; return; }
  const pmis = computePMI(recs);
  const top = pmis.slice(0, 30);
  const bottom = pmis.slice(-10).reverse();
  let html = '<table class="ap-table"><thead><tr><th>児童A</th><th>児童B</th><th>共起数</th><th>PMI</th><th>NPMI</th></tr></thead><tbody>';
  for (const p of top) {
    html += '<tr><td>' + _esc(_name(p.a)) + '</td><td>' + _esc(_name(p.b)) + '</td>'
          + '<td>' + p.count + '</td><td>' + p.pmi.toFixed(2) + '</td>'
          + '<td style="color:' + (p.npmi > 0 ? '#0066cc' : '#cc0000') + ';font-weight:bold">'
          + p.npmi.toFixed(2) + '</td></tr>';
  }
  if (bottom.length > 0) {
    html += '<tr><td colspan="5" style="background:#fafafa;text-align:center;font-size:11px;color:#888">— 下位ペア（避けてる傾向） —</td></tr>';
    for (const p of bottom) {
      html += '<tr><td>' + _esc(_name(p.a)) + '</td><td>' + _esc(_name(p.b)) + '</td>'
            + '<td>' + p.count + '</td><td>' + p.pmi.toFixed(2) + '</td>'
            + '<td style="color:#cc0000;font-weight:bold">' + p.npmi.toFixed(2) + '</td></tr>';
    }
  }
  html += '</tbody></table>';
  target.innerHTML = html;
}

function refreshCiTable() {
  const target = document.getElementById('apCiTable');
  if (!target) return;
  const recs = (window.state && window.state.records) || [];
  if (recs.length === 0) { target.innerHTML = '<p class="muted">記録がありません</p>'; return; }
  const pmis = computePMI(recs).slice(0, 10);
  let html = '<table class="ap-table"><thead><tr><th>児童A</th><th>児童B</th><th>共起</th><th>Jaccard 95%CI</th></tr></thead><tbody>';
  for (const p of pmis) {
    const ci = bootstrapJaccardCI(recs, p.a, p.b, 300);
    if (!ci) continue;
    const warn = p.count < 5 ? ' ⚠' : '';
    html += '<tr><td>' + _esc(_name(p.a)) + '</td><td>' + _esc(_name(p.b)) + '</td>'
          + '<td>' + p.count + warn + '</td>'
          + '<td><b>' + ci.mean.toFixed(2) + '</b> [' + ci.lo.toFixed(2) + '–' + ci.hi.toFixed(2) + ']</td></tr>';
  }
  html += '</tbody></table><p class="muted small">⚠ = 記録数 5 未満（参考程度）。</p>';
  target.innerHTML = html;
}

function refreshRollingChart() {
  const target = document.getElementById('apRollingChart');
  if (!target) return;
  const recs = (window.state && window.state.records) || [];
  if (recs.length === 0) { target.innerHTML = '<p class="muted">記録がありません</p>'; return; }
  const today = new Date();
  const N = 60;
  const dates = [];
  for (let i = N - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const dateMap = new Map(dates.map(d => [d, 0]));
  for (const r of recs) {
    if (dateMap.has(r.date)) dateMap.set(r.date, dateMap.get(r.date) + 1);
  }
  const values = dates.map(d => dateMap.get(d) || 0);
  const rolling = computeRollingMean(values, 7);
  const max = Math.max(1, Math.max.apply(null, values));
  const W = 600, H = 150;
  const sw = W / N;
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:170px;background:#fafbfc;">';
  values.forEach((v, i) => {
    const h = (v / max) * (H - 30);
    svg += '<rect x="' + (i * sw) + '" y="' + (H - h - 15) + '" width="' + (sw * 0.85) + '" height="' + h + '" fill="#cdd9e8" />';
  });
  let path = '';
  rolling.forEach((v, i) => {
    const x = i * sw + sw / 2;
    const y = H - (v / max) * (H - 30) - 15;
    path += (i === 0 ? 'M' : 'L') + x + ',' + y + ' ';
  });
  svg += '<path d="' + path + '" stroke="#cc0066" stroke-width="2" fill="none" />';
  svg += '<text x="' + (W - 100) + '" y="14" font-size="11" fill="#666">— 7日移動平均</text>';
  // 日付ラベル（10日おき）
  for (let i = 0; i < N; i += 10) {
    svg += '<text x="' + (i * sw) + '" y="' + (H - 2) + '" font-size="9" fill="#999">' + dates[i].slice(5) + '</text>';
  }
  svg += '</svg>';
  target.innerHTML = svg;
}

function refreshDayMatrix() {
  const target = document.getElementById('apMatrix');
  if (!target) return;
  const studs = (window.state && window.state.students) || [];
  if (studs.length === 0) {
    target.innerHTML = '<p class="muted">名簿がありません</p>';
    return;
  }
  const r = computeStudentDayMatrix(null, studs, 30);
  // 観察少ない順（合計昇順）でソート → 「観察漏れ」候補を上に
  const sortedRows = r.matrix.slice().sort((a, b) => {
    const sa = a.counts.reduce((s, v) => s + v, 0);
    const sb = b.counts.reduce((s, v) => s + v, 0);
    if (sa !== sb) return sa - sb;
    return a.id - b.id;
  });
  const today = _localDate(new Date());
  let html = '<table class="ap-matrix"><thead><tr><th class="ap-fixed">児童 (観察少順)</th>';
  for (const d of r.dates) {
    const day = d.slice(8);
    const dow = new Date(d + 'T00:00:00').getDay();
    const isToday = d === today;
    const sty = (dow === 0 || dow === 6)
      ? ' style="color:#c66;' + (isToday ? 'background:#fff3c4;' : '') + '"'
      : (isToday ? ' style="background:#fff3c4;"' : '');
    html += '<th' + sty + '>' + day + '</th>';
  }
  html += '<th>計</th></tr></thead><tbody>';
  for (const row of sortedRows) {
    const sum = row.counts.reduce((s, v) => s + v, 0);
    const lowAlert = sum === 0 ? ' style="color:#c00;font-weight:bold"' : (sum <= 2 ? ' style="color:#d68000;"' : '');
    html += '<tr><td class="ap-fixed"' + lowAlert + '>' + _esc(row.name) + '</td>';
    for (const c of row.counts) {
      const lvl = c === 0 ? 0 : c === 1 ? 1 : c === 2 ? 2 : 3;
      html += '<td class="ap-cell ap-l' + lvl + '">' + (c || '') + '</td>';
    }
    html += '<td class="ap-fixed-r">' + sum + '</td></tr>';
  }
  html += '</tbody></table>';
  target.innerHTML = html;
}

function refreshAnalyticsPlus() {
  if (!window.state || !Array.isArray(window.state.records)) return;
  refreshPmiTable();
  refreshCiTable();
  refreshRollingChart();
  refreshDayMatrix();
}

// ===== スタイル注入 =====
function injectAnalyticsStyles() {
  if (document.getElementById('apStyles')) return;
  const s = document.createElement('style');
  s.id = 'apStyles';
  s.textContent =
    '.ap-table { width: 100%; border-collapse: collapse; font-size: 12px; }' +
    '.ap-table th { background: #f5f7fa; padding: 4px 8px; border-bottom: 1px solid #ddd; text-align: left; }' +
    '.ap-table td { padding: 3px 8px; border-bottom: 1px solid #f0f0f0; }' +
    '.ap-table tbody tr:hover { background: #fafbfc; }' +
    '.ap-matrix { border-collapse: collapse; font-size: 10px; }' +
    '.ap-matrix th { background: #f5f7fa; padding: 2px 4px; border: 1px solid #eee; min-width: 18px; text-align: center; font-size: 9px; }' +
    '.ap-matrix th.ap-fixed { position: sticky; left: 0; background: #e8eef5; z-index: 2; min-width: 90px; max-width: 110px; text-align: left; padding: 2px 6px; font-size: 11px; }' +
    '.ap-matrix td { padding: 2px; border: 1px solid #eee; text-align: center; min-width: 18px; }' +
    '.ap-matrix td.ap-fixed { position: sticky; left: 0; background: #fff; z-index: 1; text-align: left; padding: 2px 6px; font-size: 11px; max-width: 110px; }' +
    '.ap-matrix td.ap-fixed-r { background: #f5f7fa; font-weight: bold; padding: 2px 6px; font-size: 11px; }' +
    '.ap-matrix .ap-l0 { background: #fff; color: #ccc; }' +
    '.ap-matrix .ap-l1 { background: #d6e7f5; color: #2c3e50; }' +
    '.ap-matrix .ap-l2 { background: #6ba3d8; color: white; }' +
    '.ap-matrix .ap-l3 { background: #1f5b9c; color: white; }';
  document.head.appendChild(s);
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
  injectAnalyticsStyles();
  injectAnalyticsUI();
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tab = btn.getAttribute('data-tab');
    if (['summary', 'compare', 'timeline', 'heatmap'].indexOf(tab) >= 0) {
      setTimeout(refreshAnalyticsPlus, 80);
    }
  });
});

// 公開
window.AnalyticsPlus = {
  computePMI: computePMI,
  bootstrapJaccardCI: bootstrapJaccardCI,
  computeRollingMean: computeRollingMean,
  computeStudentDayMatrix: computeStudentDayMatrix,
  refresh: refreshAnalyticsPlus
};

})();
