'use strict';
/* ==========================================================================
 * search-bar.js — 4モード横断 全文検索
 *
 * 起動: ヘッダーの 🔍 ボタン または Ctrl+K
 * 検索対象:
 *  - records.note, scene, activity
 *  - praises.content, tags
 *  - evaluations.unitName/criteria
 *  - abaRecords.behaviors/antecedent/consequence/response
 *  - 児童名（部分一致）
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

function _highlight(text, query) {
  if (!query || !text) return _esc(text);
  const escText = _esc(text);
  const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return escText.replace(re, '<mark>$1</mark>');
}

function search(query, opts) {
  opts = opts || {};
  const q = (query || '').trim();
  if (q.length < 1) return { records: [], praises: [], evaluations: [], abas: [], total: 0 };
  const lower = q.toLowerCase();

  const matches = (s) => s && String(s).toLowerCase().includes(lower);

  const recs = (window.state.records || []).filter(r =>
    matches(r.note) || matches(r.activity) || matches(r.scene) ||
    matches(_name(r.subject)) || (r.members || []).some(id => matches(_name(id)))
  ).slice(-30).reverse();

  const praises = (window.state.praises || []).filter(p =>
    matches(p.content) || matches(_name(p.studentId)) ||
    (Array.isArray(p.tags) && p.tags.some(t => matches(t)))
  ).slice(-30).reverse();

  const evals = (window.state.evaluations || []).filter(e =>
    matches(e.unitName) || matches(_name(e.studentId)) || matches(e.subjectId) || matches(e.viewpoint)
  ).slice(-30).reverse();

  const abas = (window.state.abaRecords || []).filter(a =>
    matches(_name(a.studentId)) || matches(a.antecedent) || matches(a.consequence) ||
    matches(a.response) || matches(a.subjectId) || matches(a.slot) ||
    (Array.isArray(a.behaviors) && a.behaviors.some(b => matches(b))) ||
    matches(a.otherText)
  ).slice(-30).reverse();

  const total = recs.length + praises.length + evals.length + abas.length;
  return { records: recs, praises, evaluations: evals, abas, total };
}

function renderResult(query) {
  const r = search(query);
  if (r.total === 0) {
    return '<p class="sr-empty">該当する記録がありません</p>';
  }
  let html = '<div class="sr-summary">' + r.total + ' 件ヒット ' +
    '(交友 ' + r.records.length + ' / ほめ ' + r.praises.length +
    ' / 評価 ' + r.evaluations.length + ' / ABA ' + r.abas.length + ')</div>';

  if (r.records.length > 0) {
    html += '<h3 class="sr-h">📝 交友記録</h3>';
    r.records.forEach(rec => {
      const others = [_name(rec.subject)].concat((rec.members || []).map(_name)).join(' × ');
      html += '<div class="sr-item" data-tab="history">' +
        '<span class="sr-date">' + _esc(rec.date) + '</span> ' +
        '<span class="sr-tag-blue">' + _esc(rec.scene) + '</span> ' +
        _highlight(others, query) +
        (rec.note ? '<br><small>' + _highlight(rec.note, query) + '</small>' : '') +
        '</div>';
    });
  }
  if (r.praises.length > 0) {
    html += '<h3 class="sr-h">🌟 ほめ</h3>';
    r.praises.forEach(p => {
      html += '<div class="sr-item" data-tab="praise-list" data-id="' + _esc(p.id) + '">' +
        '<span class="sr-date">' + _esc(p.date) + '</span> ' +
        _highlight(_name(p.studentId), query) +
        ' — ' + _highlight(p.content || '', query) +
        '</div>';
    });
  }
  if (r.evaluations.length > 0) {
    html += '<h3 class="sr-h">✅ 評価</h3>';
    r.evaluations.forEach(e => {
      html += '<div class="sr-item" data-tab="eval-list">' +
        '<span class="sr-date">' + _esc(e.date) + '</span> ' +
        _highlight(_name(e.studentId), query) + ' ' +
        '<span class="sr-tag-green">' + _esc(e.subjectId) + '/' + _esc(e.viewpoint) + '</span> ' +
        '<b>' + _esc(e.grade) + '</b> — ' + _highlight(e.unitName || '', query) +
        '</div>';
    });
  }
  if (r.abas.length > 0) {
    html += '<h3 class="sr-h">🚨 ABA</h3>';
    r.abas.forEach(a => {
      const beh = Array.isArray(a.behaviors) ? a.behaviors.join('・') : '';
      html += '<div class="sr-item" data-tab="aba-list">' +
        '<span class="sr-date">' + _esc(a.date) + '</span> ' +
        _highlight(_name(a.studentId), query) +
        ' [' + _esc(a.slot || '') + ' / ' + _esc(a.subjectId || '') + '] ' +
        _highlight(beh, query) +
        (a.antecedent ? '<br><small>A: ' + _highlight(a.antecedent, query) + '</small>' : '') +
        '</div>';
    });
  }
  return html;
}

let _debounceTimer = null;

function openSearchModal() {
  let modal = document.getElementById('srModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'srModal';
    modal.className = 'sr-modal-bd';
    modal.innerHTML =
      '<div class="sr-modal">' +
      '<div class="sr-bar">' +
      '  <input type="text" id="srInput" placeholder="🔍 全モード横断で検索（児童名・メモ・ほめ・評価単元など）" autocomplete="off">' +
      '  <button class="ghost" id="srCloseBtn">✕</button>' +
      '</div>' +
      '<div id="srBody" class="sr-body"><p class="sr-empty">検索キーワードを入力してください</p></div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('srCloseBtn').addEventListener('click', closeSearchModal);
    modal.addEventListener('click', e => {
      if (e.target === modal) closeSearchModal();
    });
    document.getElementById('srInput').addEventListener('input', e => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        document.getElementById('srBody').innerHTML = renderResult(e.target.value);
      }, 200);
    });
    // 結果クリックで該当タブへジャンプ
    document.getElementById('srBody').addEventListener('click', e => {
      const item = e.target.closest('.sr-item');
      if (!item) return;
      const tab = item.dataset.tab;
      if (tab) {
        const btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
        if (btn) btn.click();
        closeSearchModal();
      }
    });
  }
  modal.style.display = 'flex';
  setTimeout(() => {
    const inp = document.getElementById('srInput');
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
}

function closeSearchModal() {
  const m = document.getElementById('srModal');
  if (m) m.style.display = 'none';
}

function injectStyles() {
  if (document.getElementById('srStyles')) return;
  const s = document.createElement('style');
  s.id = 'srStyles';
  s.textContent =
    '.sr-modal-bd { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:flex-start; justify-content:center; padding-top:60px; }' +
    '.sr-modal { background:white; border-radius:10px; width:720px; max-width:90vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.3); }' +
    '.sr-bar { display:flex; padding:14px; border-bottom:1px solid #eee; gap:8px; }' +
    '.sr-bar input { flex:1; padding:10px 14px; font-size:15px; border:1px solid #ddd; border-radius:6px; }' +
    '.sr-bar input:focus { outline:none; border-color:#4a90e2; }' +
    '.sr-bar button { padding:6px 12px; font-size:16px; }' +
    '.sr-body { flex:1; overflow-y:auto; padding:14px; }' +
    '.sr-summary { color:#666; font-size:12px; margin-bottom:8px; padding:6px 10px; background:#f5f7fa; border-radius:4px; }' +
    '.sr-empty { color:#999; text-align:center; padding:40px; }' +
    '.sr-h { margin:14px 0 6px; font-size:13px; color:#444; padding-bottom:2px; border-bottom:1px solid #eee; }' +
    '.sr-item { padding:8px 10px; border:1px solid #eef; border-radius:5px; margin-bottom:4px; font-size:12px; cursor:pointer; transition:background .1s; }' +
    '.sr-item:hover { background:#f0f7ff; border-color:#4a90e2; }' +
    '.sr-date { color:#888; font-size:10.5px; font-variant-numeric:tabular-nums; }' +
    '.sr-tag-blue { background:#e3f2fd; color:#1976d2; padding:1px 6px; border-radius:8px; font-size:10.5px; margin:0 4px; }' +
    '.sr-tag-green { background:#e8f5e9; color:#2e7d32; padding:1px 6px; border-radius:8px; font-size:10.5px; }' +
    '.sr-item mark { background:#fff59d; padding:0 1px; border-radius:2px; }';
  document.head.appendChild(s);
}

function injectSearchButton() {
  if (document.getElementById('srOpenBtn')) return;
  const helpBtn = document.getElementById('helpBtn');
  if (!helpBtn || !helpBtn.parentNode) return;
  const btn = document.createElement('button');
  btn.id = 'srOpenBtn';
  btn.className = 'help-btn';
  btn.title = '全モード横断検索 (Ctrl+K)';
  btn.textContent = '🔍';
  btn.style.marginRight = '4px';
  btn.addEventListener('click', openSearchModal);
  helpBtn.parentNode.insertBefore(btn, helpBtn);
}

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  injectSearchButton();
  // Ctrl+K で検索起動
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearchModal();
    }
    if (e.key === 'Escape') {
      const m = document.getElementById('srModal');
      if (m && m.style.display !== 'none') closeSearchModal();
    }
  });
});

window.SearchBar = { open: openSearchModal, close: closeSearchModal, search: search };

})();
