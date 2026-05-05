'use strict';
/* ==========================================================================
 * seating-correlation.js — 席替え × 観察 相関分析
 *
 * 「🪑 席」タブの末尾にカード追加:
 *  - 散布図: ペアの「同班だった累計回数」× 「共起観察回数」+ Pearson r
 *  - 席替え前後の関わり頻度変化（直前7日 vs 直後7日）
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

// ペアの「同班回数」マップを作成
function buildSeatPairMap(snapshots) {
  const m = new Map();
  for (const snap of (snapshots || [])) {
    if (!snap || !Array.isArray(snap.groups)) continue;
    for (const grp of snap.groups) {
      for (let i = 0; i < grp.length; i++) {
        for (let j = i + 1; j < grp.length; j++) {
          const a = Math.min(grp[i], grp[j]);
          const b = Math.max(grp[i], grp[j]);
          const k = a + '-' + b;
          m.set(k, (m.get(k) || 0) + 1);
        }
      }
    }
  }
  return m;
}

// ペアの「観察共起回数」マップを作成
function buildObservationPairMap(records) {
  const m = new Map();
  for (const r of (records || [])) {
    if (!r) continue;
    const all = Array.from(new Set([r.subject, ...(r.members || [])].filter(x => x != null)));
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = Math.min(all[i], all[j]);
        const b = Math.max(all[i], all[j]);
        const k = a + '-' + b;
        m.set(k, (m.get(k) || 0) + 1);
      }
    }
  }
  return m;
}

// Pearson 相関係数
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]; sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
    sumY2 += ys[i] * ys[i];
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den === 0 ? 0 : num / den;
}

// ===== UI 注入 =====
function injectUI() {
  const tab = document.getElementById('tab-seating');
  if (!tab || document.getElementById('scCorrSection')) return;
  const sec = document.createElement('div');
  sec.className = 'card';
  sec.id = 'scCorrSection';
  sec.innerHTML =
    '<h3>📊 席替え × 観察 相関分析</h3>' +
    '<p class="muted small">' +
    '同班回数が多いペアほど観察回数が多くなる傾向（=席替えが関わりに影響）が見えます。' +
    '</p>' +
    '<div id="scScatter" style="margin-top:8px;"></div>' +
    '<div id="scCorrSummary" class="muted small" style="margin-top:6px;"></div>' +
    '<h4 style="margin-top:14px;font-size:13px;">📈 席替え前後の関わり変化</h4>' +
    '<div id="scBeforeAfter"></div>';
  tab.appendChild(sec);
}

function refreshCorrelation() {
  const scatter = document.getElementById('scScatter');
  const summary = document.getElementById('scCorrSummary');
  const ba = document.getElementById('scBeforeAfter');
  if (!scatter || !summary) return;
  const snaps = window.state.seatingSnapshots || [];
  const recs = window.state.records || [];
  if (snaps.length === 0) {
    scatter.innerHTML = '<p class="muted">席替えスナップショットがありません。座席配置プランナで「💾 履歴に保存」してください。</p>';
    summary.textContent = '';
    if (ba) ba.innerHTML = '';
    return;
  }
  if (recs.length === 0) {
    scatter.innerHTML = '<p class="muted">観察記録がありません。</p>';
    return;
  }

  const seatMap = buildSeatPairMap(snaps);
  const obsMap = buildObservationPairMap(recs);

  // 共通のペアキーを集める
  const allKeys = new Set([...seatMap.keys(), ...obsMap.keys()]);
  const points = [];
  for (const k of allKeys) {
    const x = seatMap.get(k) || 0;
    const y = obsMap.get(k) || 0;
    if (x === 0 && y === 0) continue;
    const [a, b] = k.split('-').map(Number);
    points.push({ a, b, x, y });
  }

  if (points.length === 0) {
    scatter.innerHTML = '<p class="muted">分析対象のペアがありません。</p>';
    return;
  }

  // 散布図描画
  const W = 600, H = 320;
  const padL = 50, padR = 20, padT = 20, padB = 40;
  const maxX = Math.max(1, Math.max(...points.map(p => p.x)));
  const maxY = Math.max(1, Math.max(...points.map(p => p.y)));
  const sx = v => padL + (v / maxX) * (W - padL - padR);
  const sy = v => H - padB - (v / maxY) * (H - padT - padB);

  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;max-width:700px;background:#fafbfc;border:1px solid #eee;border-radius:6px;">`;
  // 軸
  svg += `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#888" />`;
  svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#888" />`;
  // 軸ラベル
  svg += `<text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#444">同班回数 → (max ${maxX})</text>`;
  svg += `<text x="14" y="${H / 2}" text-anchor="middle" font-size="11" fill="#444" transform="rotate(-90, 14, ${H / 2})">観察共起回数 → (max ${maxY})</text>`;
  // 補助グリッド
  for (let i = 1; i <= 5; i++) {
    const ty = padT + ((H - padT - padB) * i / 5);
    svg += `<line x1="${padL}" y1="${ty}" x2="${W - padR}" y2="${ty}" stroke="#eee" stroke-dasharray="2,3"/>`;
  }
  // 点描画（jitter少し）
  for (const p of points) {
    const cx = sx(p.x) + (Math.random() - 0.5) * 4;
    const cy = sy(p.y) + (Math.random() - 0.5) * 4;
    const opacity = 0.6;
    svg += `<circle cx="${cx}" cy="${cy}" r="4" fill="#1976d2" fill-opacity="${opacity}" stroke="#0d47a1" stroke-width="0.5">`
        +  `<title>${_esc(_name(p.a))} × ${_esc(_name(p.b))}: 同班${p.x}回 / 観察${p.y}回</title>`
        +  `</circle>`;
  }
  // 回帰線（簡易: 最小二乗）
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den > 0) {
    const slope = num / den;
    const intercept = meanY - slope * meanX;
    const x1 = 0, y1 = intercept;
    const x2 = maxX, y2 = slope * maxX + intercept;
    if (y2 >= 0 && y1 >= 0) {
      svg += `<line x1="${sx(x1)}" y1="${sy(y1)}" x2="${sx(x2)}" y2="${sy(Math.max(0, y2))}" stroke="#cc0066" stroke-width="2" stroke-dasharray="4,3"/>`;
    }
  }
  svg += `</svg>`;
  scatter.innerHTML = svg;

  const r = pearson(xs, ys);
  const sig = Math.abs(r) >= 0.5 ? '🔥 強い相関' : Math.abs(r) >= 0.3 ? '✓ 中程度の相関' : '〜 弱い相関';
  const sign = r > 0 ? '正' : r < 0 ? '負' : '無';
  summary.innerHTML = `Pearson相関係数 <b>r = ${r.toFixed(3)}</b> (${sign}の${sig}, n=${n}ペア) — ` +
    (r > 0.3 ? '同班になると関わりが増える傾向あり' : r < -0.3 ? '同班になると関わりが減る傾向?' : '席替えと関わりに明確な相関なし');

  // ===== 席替え前後の関わり変化 =====
  if (ba && snaps.length > 0) {
    let baHtml = '<table class="ap-table"><thead><tr><th>席替え日</th><th>ラベル</th><th>直前7日 ペア数</th><th>直後7日 ペア数</th><th>変化</th></tr></thead><tbody>';
    const sortedSnaps = snaps.slice().sort((a, b) => a.date.localeCompare(b.date));
    for (const snap of sortedSnaps) {
      const date = snap.date;
      const before = countObservedPairs(recs, addDays(date, -7), date);
      const after = countObservedPairs(recs, date, addDays(date, 7));
      const diff = after - before;
      const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
      const color = diff > 0 ? '#080' : diff < 0 ? '#c00' : '#888';
      baHtml += `<tr><td>${_esc(date)}</td><td>${_esc(snap.label || '')}</td>`
            + `<td>${before}</td><td>${after}</td>`
            + `<td style="color:${color};font-weight:bold">${arrow} ${Math.abs(diff)}</td></tr>`;
    }
    baHtml += '</tbody></table>';
    ba.innerHTML = baHtml;
  }
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function countObservedPairs(records, from, to) {
  const set = new Set();
  for (const r of records) {
    if (r.date < from || r.date >= to) continue;
    const all = Array.from(new Set([r.subject, ...(r.members || [])].filter(x => x != null)));
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = Math.min(all[i], all[j]);
        const b = Math.max(all[i], all[j]);
        set.add(a + '-' + b);
      }
    }
  }
  return set.size;
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn && btn.getAttribute('data-tab') === 'seating') {
      setTimeout(() => {
        injectUI();
        refreshCorrelation();
      }, 100);
    }
  });
});

window.SeatingCorrelation = { refresh: refreshCorrelation };

})();
