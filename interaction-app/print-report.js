'use strict';
/* ==========================================================================
 * print-report.js — 児童ごと A4 1 ページの印刷レポート
 *
 * 機能:
 *  - 個別児童 / 全員のレポート生成
 *  - 観察パターン、ほめ、評価サマリ、ABA、席履歴を 1 ページにまとめる
 *  - 別ウィンドウで開いて Ctrl+P → PDF or 紙印刷
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

function getSceneLabel(id) {
  const s = (window.state && window.state.scenes || []).find(x => x.id === id);
  return s ? s.label : (id || '');
}

function getSubjectLabel(id) {
  const s = (window.state && window.state.subjects || []).find(x => x.id === id);
  return s ? s.label : (id || '');
}

// ===== 児童1人分の HTML 生成 =====
function buildStudentSection(studentId, opts) {
  opts = opts || {};
  const s = (window.state.students || []).find(x => x.id === studentId);
  if (!s) return '';

  const recs = window.state.records || [];
  const praises = window.state.praises || [];
  const evals = window.state.evaluations || [];
  const abas = window.state.abaRecords || [];

  // 期間フィルタ（オプション）
  const since = opts.since || null;
  const filterDate = (d) => !since || (d >= since);

  // この児童に関する記録（subject or members に含まれる）
  const myRecs = recs.filter(r => filterDate(r.date) && (r.subject === studentId || (r.members || []).includes(studentId)));
  const myPraises = praises.filter(p => filterDate(p.date) && p.studentId === studentId);
  const myEvals = evals.filter(e => filterDate(e.date) && e.studentId === studentId);
  const myAbas = abas.filter(a => filterDate(a.date) && a.studentId === studentId);

  // === 観察パターン ===
  const sceneCounts = {};
  myRecs.forEach(r => { sceneCounts[r.scene] = (sceneCounts[r.scene] || 0) + 1; });
  const sceneRows = Object.entries(sceneCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sc, c]) => `<tr><td>${_esc(getSceneLabel(sc))}</td><td>${c}</td></tr>`)
    .join('') || '<tr><td colspan="2" class="pr-muted">記録なし</td></tr>';

  // === 主な相手 TOP5 ===
  const partnerCounts = new Map();
  myRecs.forEach(r => {
    const others = [r.subject, ...(r.members || [])].filter(id => id !== studentId);
    new Set(others).forEach(id => partnerCounts.set(id, (partnerCounts.get(id) || 0) + 1));
  });
  const partnerRows = Array.from(partnerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, c]) => `<tr><td>${_esc(_name(id))}</td><td>${c}</td></tr>`)
    .join('') || '<tr><td colspan="2" class="pr-muted">記録なし</td></tr>';

  // === ほめポイント ===
  const praiseRows = myPraises.slice(-8).reverse().map(p => {
    const tags = (p.tags && Array.isArray(p.tags)) ? p.tags.join(', ') : '';
    return `<tr><td class="pr-date">${_esc(p.date)}</td><td>${_esc(p.content || '')}${tags ? ` <span class="pr-tag">${_esc(tags)}</span>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="2" class="pr-muted">ほめ記録なし</td></tr>';

  // === 評価サマリ（教科×観点） ===
  const evalMap = {};   // subject -> viewpoint -> [grades]
  myEvals.forEach(e => {
    if (!evalMap[e.subjectId]) evalMap[e.subjectId] = {};
    if (!evalMap[e.subjectId][e.viewpoint]) evalMap[e.subjectId][e.viewpoint] = [];
    evalMap[e.subjectId][e.viewpoint].push(e.grade);
  });
  let evalHtml = '';
  if (Object.keys(evalMap).length === 0) {
    evalHtml = '<p class="pr-muted">評価記録なし</p>';
  } else {
    evalHtml = '<table class="pr-tbl"><thead><tr><th>教科</th><th>知</th><th>思</th><th>態</th></tr></thead><tbody>';
    Object.entries(evalMap).forEach(([subj, vps]) => {
      const sLabel = getSubjectLabel(subj);
      const k = (vps.knowledge || []).slice(-3).join(',');
      const t = (vps.thinking || []).slice(-3).join(',');
      const a = (vps.attitude || []).slice(-3).join(',');
      evalHtml += `<tr><td>${_esc(sLabel)}</td><td>${_esc(k)}</td><td>${_esc(t)}</td><td>${_esc(a)}</td></tr>`;
    });
    evalHtml += '</tbody></table>';
  }

  // === ABA ===
  let abaHtml = '';
  if (myAbas.length === 0) {
    abaHtml = '<p class="pr-muted">ABA記録なし</p>';
  } else {
    abaHtml = '<ul class="pr-aba">';
    myAbas.slice(-5).reverse().forEach(a => {
      const behaviors = Array.isArray(a.behaviors) ? a.behaviors.join('・') : '';
      abaHtml += `<li><span class="pr-date">${_esc(a.date)}</span> [${_esc(a.slot || '')}/${_esc(getSubjectLabel(a.subjectId) || '')}] ${_esc(behaviors)}`;
      if (a.antecedent) abaHtml += `<br><small>A: ${_esc(a.antecedent)}</small>`;
      if (a.consequence) abaHtml += `<br><small>C: ${_esc(a.consequence)}</small>`;
      if (a.response) abaHtml += `<br><small>対応: ${_esc(a.response)}</small>`;
      abaHtml += '</li>';
    });
    abaHtml += '</ul>';
  }

  // === ノート抜粋 ===
  const noteRecs = myRecs.filter(r => r.note).slice(-5).reverse();
  let noteHtml = '';
  if (noteRecs.length > 0) {
    noteHtml = '<ul class="pr-notes">';
    noteRecs.forEach(r => {
      noteHtml += `<li><span class="pr-date">${_esc(r.date)}</span> ${_esc(r.note)}</li>`;
    });
    noteHtml += '</ul>';
  }

  // === 席履歴 (push順ではなく日付降順で「直近3回」を保証) ===
  const seats = (window.state.seatingSnapshots || []).slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 3);
  let seatHtml = '';
  if (seats.length === 0) {
    seatHtml = '<p class="pr-muted">席替え履歴なし</p>';
  } else {
    seats.forEach(snap => {
      const myGroup = (snap.groups || []).find(g => g.includes(studentId));
      if (!myGroup) return;
      const others = myGroup.filter(id => id !== studentId).map(_name).join(', ');
      seatHtml += `<div class="pr-seat-row"><span class="pr-date">${_esc(snap.date)}</span> ${_esc(snap.label || '')} → 同班: ${_esc(others) || '(単独)'}</div>`;
    });
    if (!seatHtml) seatHtml = '<p class="pr-muted">直近の席替え班記録なし</p>';
  }

  return `
    <section class="pr-page">
      <header class="pr-header">
        <h1>${_esc(s.name)} <small>(出席番号 ${s.id})</small></h1>
        <div class="pr-meta">
          ${_esc(window.state.settings.classLabel || '')} ${since ? '/ ' + since + '〜' : '/ 全期間'}
          ${s.highlight ? '<span class="pr-flag-hi">●要配慮</span>' : ''}
          ${s.watch ? '<span class="pr-flag-wt">■観察優先</span>' : ''}
        </div>
        ${s.note ? `<div class="pr-note">📝 ${_esc(s.note)}</div>` : ''}
      </header>

      <div class="pr-grid">
        <div>
          <h2>📊 観察パターン (上位)</h2>
          <table class="pr-tbl"><thead><tr><th>シーン</th><th>回数</th></tr></thead><tbody>${sceneRows}</tbody></table>

          <h2>👥 主な相手 TOP5</h2>
          <table class="pr-tbl"><thead><tr><th>相手</th><th>共起</th></tr></thead><tbody>${partnerRows}</tbody></table>

          <h2>🪑 席履歴 (直近3回)</h2>
          ${seatHtml}
        </div>
        <div>
          <h2>🌟 ほめ (直近8件)</h2>
          <table class="pr-tbl pr-tbl-praise"><tbody>${praiseRows}</tbody></table>

          <h2>✅ 評価サマリ (直近3件/観点)</h2>
          ${evalHtml}
        </div>
      </div>

      ${noteRecs.length > 0 ? `<h2>📝 観察メモ抜粋</h2>${noteHtml}` : ''}
      ${myAbas.length > 0 ? `<h2>🚨 ABA記録抜粋</h2>${abaHtml}` : ''}

      <footer class="pr-footer">
        累計: 交友 ${myRecs.length} / ほめ ${myPraises.length} / 評価 ${myEvals.length} / ABA ${myAbas.length}
        — 印刷日 ${new Date().toLocaleDateString('ja-JP')}
      </footer>
    </section>
  `;
}

function buildFullHTML(studentIds, opts) {
  const sections = studentIds.map(id => buildStudentSection(id, opts)).join('');
  const cls = window.state.settings.classLabel || '';
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<title>${_esc(cls)} 印刷レポート</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif; color: #333; font-size: 11px; line-height: 1.4; margin: 0; padding: 0; }
  .pr-page { page-break-after: always; padding: 0; max-width: 210mm; box-sizing: border-box; }
  .pr-page:last-child { page-break-after: auto; }
  .pr-header { border-bottom: 2px solid #2c3e50; padding-bottom: 6px; margin-bottom: 10px; }
  .pr-header h1 { font-size: 22px; margin: 0; color: #2c3e50; }
  .pr-header h1 small { font-size: 12px; color: #888; font-weight: normal; }
  .pr-meta { color: #666; font-size: 11px; margin-top: 4px; }
  .pr-flag-hi { color: #d4a017; margin-left: 8px; }
  .pr-flag-wt { color: #6a3eaa; margin-left: 8px; }
  .pr-note { background: #fff8e1; padding: 4px 8px; margin-top: 4px; border-left: 3px solid #d4a017; font-size: 11px; }
  .pr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  h2 { font-size: 12px; margin: 10px 0 4px; padding: 2px 6px; background: #eef2f7; border-left: 4px solid #4a90e2; color: #2c3e50; }
  .pr-tbl { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .pr-tbl th, .pr-tbl td { padding: 3px 6px; border: 1px solid #ddd; text-align: left; }
  .pr-tbl th { background: #f5f7fa; }
  .pr-tbl-praise td:first-child { width: 65px; }
  .pr-muted { color: #aaa; font-size: 10px; padding: 4px; text-align: center; }
  .pr-tag { color: #d4a017; font-size: 9px; }
  .pr-date { color: #666; font-size: 10px; font-variant-numeric: tabular-nums; }
  .pr-aba { padding-left: 14px; font-size: 10.5px; }
  .pr-aba li { margin: 4px 0; }
  .pr-aba small { color: #555; }
  .pr-notes { padding-left: 14px; font-size: 10.5px; }
  .pr-notes li { margin: 3px 0; }
  .pr-seat-row { font-size: 10.5px; padding: 2px 0; border-bottom: 1px dotted #eee; }
  .pr-footer { border-top: 1px solid #ddd; padding-top: 4px; margin-top: 12px; color: #888; font-size: 9.5px; text-align: right; }
  @media screen {
    body { background: #f5f5f5; padding: 20px; }
    .pr-page { background: white; padding: 15mm; margin: 0 auto 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); min-height: 257mm; }
    .pr-no-print-bar { position: fixed; top: 0; left: 0; right: 0; background: #2c3e50; color: white; padding: 8px 16px; z-index: 999; display: flex; justify-content: space-between; align-items: center; }
    .pr-no-print-bar button { padding: 6px 16px; background: #4a90e2; border: none; color: white; border-radius: 4px; font-size: 13px; cursor: pointer; }
    body { padding-top: 50px; }
  }
  @media print { .pr-no-print-bar { display: none !important; } }
</style></head><body>
<div class="pr-no-print-bar">
  <span>${_esc(cls)} 印刷レポート（${studentIds.length}名）</span>
  <span><button onclick="window.print()">🖨 印刷 / PDF保存 (Ctrl+P)</button></span>
</div>
${sections}
</body></html>`;
}

function openReportWindow(studentIds, opts) {
  if (!studentIds || studentIds.length === 0) {
    alert('対象児童が選択されていません');
    return;
  }
  const html = buildFullHTML(studentIds, opts || {});
  const w = window.open('', '_blank');
  if (!w) {
    alert('ポップアップがブロックされました。ブラウザの設定で許可してください。');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ===== UI 統合: 設定タブのバックアップカードに印刷ボタン追加 =====
function injectPrintReportUI() {
  if (document.getElementById('prReportRow')) return;
  const cards = document.querySelectorAll('#tab-settings .card');
  let target = null;
  cards.forEach(card => {
    if (target) return;
    const h3 = card.querySelector('h3');
    if (h3 && h3.textContent.includes('バックアップ')) target = card;
  });
  if (!target) return;
  const div = document.createElement('div');
  div.id = 'prReportRow';
  div.className = 'btn-row';
  div.style.marginTop = '8px';
  div.innerHTML =
    '<button class="primary" id="prReportAllBtn">📄 全員レポート印刷</button>' +
    '<button class="ghost" id="prReportPickBtn">📄 個別レポート印刷</button>';
  target.appendChild(div);

  document.getElementById('prReportAllBtn').addEventListener('click', () => {
    const ids = (window.state.students || []).map(s => s.id);
    openReportWindow(ids);
  });
  document.getElementById('prReportPickBtn').addEventListener('click', openPickModal);
}

function openPickModal() {
  const studs = (window.state.students || []).slice().sort((a, b) => a.id - b.id);
  if (studs.length === 0) { alert('名簿が空です'); return; }
  let html = '<div class="pr-modal-bd"><div class="pr-modal">'
    + '<h2>印刷する児童を選択</h2>'
    + '<div style="margin:8px 0;"><button class="ghost" id="prModalAllBtn">全選択</button> '
    + '<button class="ghost" id="prModalNoneBtn">解除</button></div>'
    + '<div class="pr-pick-grid">';
  studs.forEach(s => {
    html += `<label class="pr-pick-item"><input type="checkbox" class="pr-pick-cb" value="${s.id}"> ${_esc(s.name)}</label>`;
  });
  html += '</div>'
    + '<div class="modal-actions" style="margin-top:12px;">'
    + ' <button class="ghost" id="prModalCancelBtn">キャンセル</button>'
    + ' <button class="primary" id="prModalGoBtn">印刷プレビュー</button>'
    + '</div></div></div>';
  const wrap = document.createElement('div');
  wrap.id = 'prModalWrap';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  document.getElementById('prModalAllBtn').addEventListener('click', () => {
    document.querySelectorAll('.pr-pick-cb').forEach(cb => cb.checked = true);
  });
  document.getElementById('prModalNoneBtn').addEventListener('click', () => {
    document.querySelectorAll('.pr-pick-cb').forEach(cb => cb.checked = false);
  });
  document.getElementById('prModalCancelBtn').addEventListener('click', () => wrap.remove());
  document.getElementById('prModalGoBtn').addEventListener('click', () => {
    const ids = Array.from(document.querySelectorAll('.pr-pick-cb:checked')).map(cb => parseInt(cb.value, 10));
    if (ids.length === 0) { alert('1名以上選択してください'); return; }
    wrap.remove();
    openReportWindow(ids);
  });
}

function injectStyles() {
  if (document.getElementById('prModalStyles')) return;
  const s = document.createElement('style');
  s.id = 'prModalStyles';
  s.textContent =
    '.pr-modal-bd { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center; }' +
    '.pr-modal { background:white; padding:20px; border-radius:10px; max-width:600px; max-height:80vh; overflow-y:auto; }' +
    '.pr-modal h2 { margin:0 0 8px; font-size:16px; }' +
    '.pr-pick-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:4px 12px; max-height:50vh; overflow-y:auto; padding:8px; background:#f5f7fa; border-radius:6px; }' +
    '.pr-pick-item { font-size:12px; cursor:pointer; padding:2px; }' +
    '.pr-pick-item:hover { background:#e8eef5; }';
  document.head.appendChild(s);
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  // 設定タブを開いた時に注入
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn && btn.getAttribute('data-tab') === 'settings') {
      setTimeout(injectPrintReportUI, 100);
    }
  });
});

window.PrintReport = {
  open: openReportWindow,
  openPick: openPickModal,
  buildHTML: buildFullHTML
};

})();
