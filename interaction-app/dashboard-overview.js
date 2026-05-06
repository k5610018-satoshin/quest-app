'use strict';
/* ==========================================================================
 * dashboard-overview.js — 学級概況タブ
 *
 * トップに今日の状況・気になる児童・累計などをウィジェット表示。
 * 起動直後に「今日のクラスの状況」を一目で把握できる。
 * ========================================================================== */

(function() {

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function daysSince(dateStr) {
  if (!dateStr) return 999;
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.floor((t - d) / 86400000);
}

function getISOWeek(dateStr) {
  // ISO 8601 週番号（月曜起点・木曜が含まれる週がその週）
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(0, 0, 0, 0);
  // 木曜にずらす（その日の属する週の木曜が、ISO週の年と週番号を決定）
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const wn = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return d.getFullYear() + '-W' + String(wn).padStart(2, '0');
}

function _esc(s) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function refreshOverview() {
  const target = document.getElementById('overviewContent');
  if (!target || !window.state) return;

  const recs = window.state.records || [];
  const praises = window.state.praises || [];
  const evals = window.state.evaluations || [];
  const abas = window.state.abaRecords || [];
  const studs = window.state.students || [];
  const today = todayISO();
  const thisWeek = getISOWeek(today);

  // 今日の記録数
  const todayRecs = recs.filter(r => r.date === today);
  const todayPraises = praises.filter(p => p.date === today);
  const todayEvals = evals.filter(e => e.date === today);
  const todayAbas = abas.filter(a => a.date === today);

  // 今週の記録数
  const weekRecs = recs.filter(r => getISOWeek(r.date) === thisWeek);
  const weekPraises = praises.filter(p => getISOWeek(p.date) === thisWeek);
  const weekEvals = evals.filter(e => getISOWeek(e.date) === thisWeek);

  // 今日まだ観察していない児童
  const observedToday = new Set();
  todayRecs.forEach(r => {
    observedToday.add(r.subject);
    (r.members || []).forEach(m => observedToday.add(m));
  });
  todayPraises.forEach(p => observedToday.add(p.studentId));
  todayEvals.forEach(e => observedToday.add(e.studentId));
  todayAbas.forEach(a => observedToday.add(a.studentId));
  const notObservedToday = studs.filter(s => !observedToday.has(s.id));

  // 今週ゼロの児童（観察＋ほめ＋評価＋ABAすべてゼロ）
  const observedThisWeek = new Set();
  weekRecs.forEach(r => {
    observedThisWeek.add(r.subject);
    (r.members || []).forEach(m => observedThisWeek.add(m));
  });
  weekPraises.forEach(p => observedThisWeek.add(p.studentId));
  weekEvals.forEach(e => observedThisWeek.add(e.studentId));
  abas.filter(a => getISOWeek(a.date) === thisWeek).forEach(a => observedThisWeek.add(a.studentId));
  const zeroThisWeek = studs.filter(s => !observedThisWeek.has(s.id));

  // 最終観察からの日数 → 5日以上未観察（全モード合算: 交友/ほめ/評価/ABA/けテぶれ）
  const lastSeenMap = new Map();
  const updateSeen = (id, date) => {
    if (!id || !date) return;
    const cur = lastSeenMap.get(id);
    if (!cur || date > cur) lastSeenMap.set(id, date);
  };
  for (const r of recs) {
    const ids = [r.subject, ...(r.members || [])];
    for (const id of ids) updateSeen(id, r.date);
  }
  for (const p of praises) updateSeen(p.studentId, p.date);
  for (const e of (state.evaluations || [])) updateSeen(e.studentId, e.date);
  for (const a of (abas || [])) {
    updateSeen(a.studentId, a.date);
    if (a.targetStudentId) updateSeen(a.targetStudentId, a.date);
  }
  for (const k of (state.ketebureRecords || [])) updateSeen(k.studentId, k.date);
  const longUnseen = studs
    .map(s => ({ ...s, daysAgo: daysSince(lastSeenMap.get(s.id)) }))
    .filter(s => s.daysAgo >= 5 && s.daysAgo < 999)
    .sort((a, b) => b.daysAgo - a.daysAgo)
    .slice(0, 8);

  // 累計記録（モード別）
  const accInteraction = recs.length;
  const accPraise = praises.length;
  const accEval = evals.length;
  const accAba = abas.length;

  // 今日のほめ TOP3 児童
  const todayPraiseByStudent = new Map();
  todayPraises.forEach(p => {
    todayPraiseByStudent.set(p.studentId, (todayPraiseByStudent.get(p.studentId) || 0) + 1);
  });
  const todayPraiseTop = Array.from(todayPraiseByStudent.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // 直近イベント
  const events = (window.state.events || []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  let html = '';

  // ===== ヘッダ =====
  const cls = window.state.settings?.classLabel || '';
  html += '<div class="ov-header">';
  html += '<h2>🏫 ' + _esc(cls || 'クラス') + ' — 今日の状況</h2>';
  html += '<span class="muted">' + today + '</span>';
  html += '</div>';

  // ===== 1段目: 今日のサマリ =====
  html += '<div class="ov-stat-row">';
  html += '<div class="ov-stat" data-target-tab="history"><div class="ov-num">' + todayRecs.length + '</div><div class="ov-lbl">今日の交友記録</div></div>';
  html += '<div class="ov-stat" data-target-tab="praise-list"><div class="ov-num">' + todayPraises.length + '</div><div class="ov-lbl">今日のほめ</div></div>';
  html += '<div class="ov-stat" data-target-tab="eval-list"><div class="ov-num">' + todayEvals.length + '</div><div class="ov-lbl">今日の評価</div></div>';
  html += '<div class="ov-stat" data-target-tab="aba-list"><div class="ov-num">' + todayAbas.length + '</div><div class="ov-lbl">今日のABA</div></div>';
  html += '<div class="ov-stat ov-acc"><div class="ov-num">' + observedToday.size + ' / ' + studs.length + '</div><div class="ov-lbl">今日観察した児童数</div></div>';
  html += '</div>';

  // ===== 2段目: 今週サマリ =====
  html += '<div class="ov-stat-row" style="margin-top:8px;">';
  html += '<div class="ov-stat ov-week"><div class="ov-num">' + weekRecs.length + '</div><div class="ov-lbl">今週の交友</div></div>';
  html += '<div class="ov-stat ov-week"><div class="ov-num">' + weekPraises.length + '</div><div class="ov-lbl">今週のほめ</div></div>';
  html += '<div class="ov-stat ov-week"><div class="ov-num">' + weekEvals.length + '</div><div class="ov-lbl">今週の評価</div></div>';
  html += '<div class="ov-stat ov-week"><div class="ov-num">' + observedThisWeek.size + ' / ' + studs.length + '</div><div class="ov-lbl">今週観察済</div></div>';
  html += '<div class="ov-stat ov-week ov-warn"><div class="ov-num" style="color:' + (zeroThisWeek.length > 0 ? '#c00' : '#080') + '">' + zeroThisWeek.length + '</div><div class="ov-lbl">今週ゼロの児童</div></div>';
  html += '</div>';

  // ===== 気になる児童 =====
  html += '<div class="ov-grid">';

  // 今日まだ観察していない
  html += '<div class="card"><h3>👀 今日まだ観察していない児童 (' + notObservedToday.length + '/' + studs.length + ')</h3>';
  if (notObservedToday.length === 0) {
    html += '<p class="muted">全員観察済み 👏</p>';
  } else {
    html += '<div class="ov-chip-list">';
    notObservedToday.slice(0, 30).forEach(s => {
      const cls2 = (s.highlight ? 'ov-chip-hi' : '') + (s.watch ? ' ov-chip-watch' : '');
      html += '<span class="ov-chip ' + cls2 + '" data-student-id="' + s.id + '">' + _esc(s.name) + '</span>';
    });
    if (notObservedToday.length > 30) html += '<span class="muted small">…他' + (notObservedToday.length - 30) + '名</span>';
    html += '</div>';
  }
  html += '</div>';

  // 今週ゼロ
  html += '<div class="card"><h3>⚠ 今週まだ何も記録がない児童 (' + zeroThisWeek.length + ')</h3>';
  if (zeroThisWeek.length === 0) {
    html += '<p class="muted">全員何かしら記録あり 👏</p>';
  } else {
    html += '<div class="ov-chip-list">';
    zeroThisWeek.forEach(s => {
      html += '<span class="ov-chip ov-chip-warn" data-student-id="' + s.id + '">' + _esc(s.name) + '</span>';
    });
    html += '</div>';
  }
  html += '</div>';

  // 5日以上未観察
  html += '<div class="card"><h3>🔴 5日以上未観察 (上位8名)</h3>';
  if (longUnseen.length === 0) {
    html += '<p class="muted">全員5日以内に観察済み</p>';
  } else {
    html += '<table class="ap-table"><thead><tr><th>児童</th><th>最終観察日</th><th>経過日数</th></tr></thead><tbody>';
    longUnseen.forEach(s => {
      const last = lastSeenMap.get(s.id) || '—';
      html += '<tr><td><span class="ov-link" data-student-id="' + s.id + '">' + _esc(s.name) + '</span></td>'
            + '<td>' + last + '</td>'
            + '<td style="color:#c00;font-weight:bold">' + s.daysAgo + '日</td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  // 今日のほめ TOP3
  html += '<div class="card"><h3>🌟 今日のほめ TOP3</h3>';
  if (todayPraiseTop.length === 0) {
    html += '<p class="muted">まだありません</p>';
  } else {
    html += '<ul style="list-style:none;padding:0;margin:0">';
    todayPraiseTop.forEach(([sid, c]) => {
      const s = studs.find(x => x.id === sid);
      html += '<li style="padding:4px 0;"><span class="ov-link" data-student-id="' + sid + '">' + _esc(s ? s.name : '?') + '</span> <b style="color:#d4a017;font-size:16px;">' + c + '回</b></li>';
    });
    html += '</ul>';
  }
  html += '</div>';

  // 累計
  html += '<div class="card"><h3>📚 累計</h3>';
  html += '<div class="ov-acc-row"><span>交友記録</span><b>' + accInteraction + '</b></div>';
  html += '<div class="ov-acc-row"><span>ほめ</span><b>' + accPraise + '</b></div>';
  html += '<div class="ov-acc-row"><span>評価</span><b>' + accEval + '</b></div>';
  html += '<div class="ov-acc-row"><span>ABA</span><b>' + accAba + '</b></div>';
  if (state.seatingSnapshots) html += '<div class="ov-acc-row"><span>席替え履歴</span><b>' + state.seatingSnapshots.length + '</b></div>';
  html += '</div>';

  // 直近イベント
  html += '<div class="card"><h3>📅 直近イベント</h3>';
  if (events.length === 0) {
    html += '<p class="muted">未登録（設定タブから追加可能）</p>';
  } else {
    html += '<ul style="list-style:none;padding:0;margin:0">';
    events.forEach(ev => {
      html += '<li style="padding:3px 0;border-bottom:1px solid #f0f0f0;"><span class="muted small">' + _esc(ev.date) + '</span> ' + _esc(ev.label) + '</li>';
    });
    html += '</ul>';
  }
  html += '</div>';

  html += '</div>';  // .ov-grid

  target.innerHTML = html;

  // クリック委任：児童名タップで個別ダッシュボード表示
  // 多重登録防止: removeEventListener で念のため外してから付け直す
  target.removeEventListener('click', overviewClickHandler);
  target.addEventListener('click', overviewClickHandler);
}

function overviewClickHandler(e) {
  const chip = e.target.closest('.ov-chip, .ov-link');
  if (chip) {
    const id = parseInt(chip.dataset.studentId, 10);
    if (!id) return;
    if (typeof window.openStudentDashboard === 'function') {
      window.openStudentDashboard(id);
    } else if (typeof openStudentDashboard === 'function') {
      openStudentDashboard(id);
    }
    return;
  }
  const stat = e.target.closest('.ov-stat[data-target-tab]');
  if (stat) {
    const tab = stat.dataset.targetTab;
    const btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
    if (btn) btn.click();
  }
}

// スタイル注入
function injectOverviewStyles() {
  if (document.getElementById('ovStyles')) return;
  const s = document.createElement('style');
  s.id = 'ovStyles';
  s.textContent =
    '.ov-header { display:flex; justify-content:space-between; align-items:baseline; padding:0 4px 12px; }' +
    '.ov-header h2 { margin:0; font-size:18px; }' +
    '.ov-stat-row { display:flex; gap:8px; flex-wrap:wrap; }' +
    '.ov-stat { flex:1; min-width:120px; background:white; border-radius:8px; padding:14px 12px; text-align:center; cursor:pointer; transition:transform .1s; box-shadow:0 1px 3px rgba(0,0,0,0.06); }' +
    '.ov-stat:hover { transform:translateY(-2px); box-shadow:0 3px 8px rgba(0,0,0,0.12); }' +
    '.ov-stat .ov-num { font-size:28px; font-weight:700; color:#2c3e50; line-height:1.1; }' +
    '.ov-stat .ov-lbl { font-size:11px; color:#666; margin-top:4px; }' +
    '.ov-stat.ov-week .ov-num { color:#1976d2; }' +
    '.ov-stat.ov-warn .ov-num { color:#c00; }' +
    '.ov-stat.ov-acc { background:#f8f9fa; }' +
    '.ov-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px; margin-top:16px; }' +
    '.ov-grid .card { padding:12px; }' +
    '.ov-grid .card h3 { font-size:13px; margin:0 0 8px; color:#444; }' +
    '.ov-chip-list { display:flex; flex-wrap:wrap; gap:4px; }' +
    '.ov-chip { display:inline-block; padding:2px 8px; background:#eef2f7; border-radius:11px; font-size:12px; cursor:pointer; transition:background .1s; }' +
    '.ov-chip:hover { background:#dde6f0; }' +
    '.ov-chip-hi { background:#fff4d4; }' +
    '.ov-chip-watch { background:#f0e4f5; }' +
    '.ov-chip-warn { background:#fde0e0; color:#a00; font-weight:600; }' +
    '.ov-link { color:#1976d2; cursor:pointer; text-decoration:underline; }' +
    '.ov-link:hover { color:#0d47a1; }' +
    '.ov-acc-row { display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid #f0f0f0; font-size:13px; }' +
    '.ov-acc-row b { font-variant-numeric:tabular-nums; }';
  document.head.appendChild(s);
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  injectOverviewStyles();
  // タブ切替時に再描画
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn && btn.getAttribute('data-tab') === 'overview') {
      setTimeout(refreshOverview, 50);
    }
  });
});

window.refreshOverview = refreshOverview;

})();
