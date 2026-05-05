'use strict';
/* ==========================================================================
 * templates.js — 記録テンプレート機能
 *
 * よく使う記録（メモ・ほめ内容）をテンプレートとして保存・呼び出し。
 * 4モード共通: 記録/ほめ/評価/ABA に対応
 *
 * 起動: 各モードに「📌 テンプレ」ボタンを注入
 * 保存先: localStorage (interactionApp_templates)
 * ========================================================================== */

(function() {

const STORAGE_KEY = 'interactionApp_templates';

function _esc(s) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function loadTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultTemplates();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : getDefaultTemplates();
  } catch (_) {
    return getDefaultTemplates();
  }
}

function saveTemplates(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function getDefaultTemplates() {
  return [
    { id: 't-1', mode: 'praise', label: '📦 配り物を手伝う', text: '配り物を進んで手伝ってくれた' },
    { id: 't-2', mode: 'praise', label: '🤝 友達を助ける', text: '困っている友達に声をかけて助けていた' },
    { id: 't-3', mode: 'praise', label: '🙋 進んで挙手', text: '授業で進んで意見を発表していた' },
    { id: 't-4', mode: 'praise', label: '🧹 掃除を頑張る', text: '時間いっぱい黙々と掃除に取り組んでいた' },
    { id: 't-5', mode: 'praise', label: '💪 苦手に挑戦', text: '苦手なことにも諦めずに取り組んでいた' },
    { id: 't-6', mode: 'interaction', label: '🎮 休み時間遊び', text: '休み時間に楽しそうに遊んでいた' },
    { id: 't-7', mode: 'aba', label: '🚪 離席（普段なし）', text: '突然席を立って教室を出ていった' },
    { id: 't-8', mode: 'aba', label: '😡 暴言（友達へ）', text: '友達に対して強い口調で批判した' }
  ];
}

function addTemplate(tpl) {
  const list = loadTemplates();
  tpl.id = 't-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  list.push(tpl);
  saveTemplates(list);
  return tpl;
}

function deleteTemplate(id) {
  const list = loadTemplates().filter(t => t.id !== id);
  saveTemplates(list);
}

// ===== UI: 各モードに「📌 テンプレ」ボタン挿入 =====
function injectTemplateButtons() {
  // ほめ記録モード（textarea 周辺）
  const praiseBox = document.getElementById('praiseContentInput');
  if (praiseBox && !praiseBox.dataset.tplBound) {
    praiseBox.dataset.tplBound = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost tpl-btn';
    btn.textContent = '📌 テンプレから挿入';
    btn.style.cssText = 'margin: 4px 0; padding: 3px 10px; font-size: 11px;';
    btn.addEventListener('click', () => openPicker('praise', praiseBox));
    praiseBox.parentNode.insertBefore(btn, praiseBox.nextSibling);
  }
  // ABA Antecedent
  const abaA = document.getElementById('abaAntecedentInput');
  if (abaA && !abaA.dataset.tplBound) {
    abaA.dataset.tplBound = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost tpl-btn';
    btn.textContent = '📌';
    btn.title = 'テンプレから挿入';
    btn.style.cssText = 'margin-left: 4px; padding: 3px 8px; font-size: 11px;';
    btn.addEventListener('click', () => openPicker('aba', abaA));
    if (abaA.parentNode) abaA.parentNode.appendChild(btn);
  }
  // 交友 note
  const noteInput = document.querySelector('#tab-record textarea[id*="note"], #tab-record textarea[id*="Note"]');
  if (noteInput && !noteInput.dataset.tplBound) {
    noteInput.dataset.tplBound = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost tpl-btn';
    btn.textContent = '📌 テンプレ';
    btn.style.cssText = 'margin: 4px 0; padding: 3px 10px; font-size: 11px;';
    btn.addEventListener('click', () => openPicker('interaction', noteInput));
    noteInput.parentNode.insertBefore(btn, noteInput.nextSibling);
  }
}

function openPicker(mode, targetInput) {
  const list = loadTemplates().filter(t => t.mode === mode || t.mode === 'all');
  let html = '<div class="tpl-modal-bd"><div class="tpl-modal">'
    + '<h2>📌 テンプレートを選択 (' + _esc(modeLabel(mode)) + ')</h2>'
    + '<div class="tpl-list">';
  if (list.length === 0) {
    html += '<p class="muted">テンプレートがありません。下のフォームから追加してください。</p>';
  } else {
    list.forEach(t => {
      html += '<div class="tpl-item" data-id="' + _esc(t.id) + '">'
        + '<div class="tpl-label">' + _esc(t.label) + '</div>'
        + '<div class="tpl-text">' + _esc(t.text) + '</div>'
        + '<button class="ghost tpl-del" title="削除" data-del-id="' + _esc(t.id) + '">🗑</button>'
        + '</div>';
    });
  }
  html += '</div>'
    + '<div class="tpl-add">'
    + '<h3>新規テンプレ追加</h3>'
    + '<input type="text" id="tplNewLabel" placeholder="ラベル (例: 🙋 挙手した)" style="width:200px;">'
    + '<input type="text" id="tplNewText" placeholder="本文 (記録に挿入される文章)" style="width:300px;">'
    + '<button class="primary" id="tplAddBtn">＋ 追加</button>'
    + '</div>'
    + '<div class="modal-actions" style="margin-top:8px;">'
    + ' <button class="ghost" id="tplCloseBtn">キャンセル</button>'
    + '</div></div></div>';
  const wrap = document.createElement('div');
  wrap.id = 'tplModalWrap';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  // イベント
  wrap.querySelector('.tpl-list')?.addEventListener('click', e => {
    const delBtn = e.target.closest('.tpl-del');
    if (delBtn) {
      e.stopPropagation();
      if (confirm('このテンプレを削除しますか？')) {
        deleteTemplate(delBtn.dataset.delId);
        wrap.remove();
        openPicker(mode, targetInput);
      }
      return;
    }
    const item = e.target.closest('.tpl-item');
    if (item) {
      const id = item.dataset.id;
      const tpl = loadTemplates().find(t => t.id === id);
      if (tpl && targetInput) {
        const cur = targetInput.value || '';
        targetInput.value = cur ? (cur + '\n' + tpl.text) : tpl.text;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.focus();
      }
      wrap.remove();
    }
  });
  document.getElementById('tplAddBtn').addEventListener('click', () => {
    const label = document.getElementById('tplNewLabel').value.trim();
    const text = document.getElementById('tplNewText').value.trim();
    if (!label || !text) { alert('ラベルと本文を入力してください'); return; }
    addTemplate({ mode, label, text });
    wrap.remove();
    openPicker(mode, targetInput);
  });
  document.getElementById('tplCloseBtn').addEventListener('click', () => wrap.remove());
  wrap.addEventListener('click', e => {
    if (e.target.classList.contains('tpl-modal-bd')) wrap.remove();
  });
}

function modeLabel(mode) {
  return ({ praise: 'ほめ', interaction: '交友', evaluation: '評価', aba: 'ABA' })[mode] || mode;
}

function injectStyles() {
  if (document.getElementById('tplStyles')) return;
  const s = document.createElement('style');
  s.id = 'tplStyles';
  s.textContent =
    '.tpl-modal-bd { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9998; display:flex; align-items:center; justify-content:center; }' +
    '.tpl-modal { background:white; border-radius:10px; padding:20px; max-width:600px; max-height:80vh; overflow-y:auto; }' +
    '.tpl-modal h2 { margin:0 0 10px; font-size:16px; }' +
    '.tpl-modal h3 { margin:14px 0 6px; font-size:13px; color:#444; }' +
    '.tpl-list { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:6px; }' +
    '.tpl-item { padding:8px 10px; border:1px solid #e8eef5; border-radius:6px; cursor:pointer; transition:all .1s; position:relative; }' +
    '.tpl-item:hover { border-color:#4a90e2; background:#f0f7ff; }' +
    '.tpl-label { font-size:13px; font-weight:600; color:#2c3e50; }' +
    '.tpl-text { font-size:11.5px; color:#666; margin-top:2px; line-height:1.4; }' +
    '.tpl-del { position:absolute; top:2px; right:2px; padding:2px 5px !important; font-size:10px !important; opacity:0.4; }' +
    '.tpl-del:hover { opacity:1; }' +
    '.tpl-add { margin-top:14px; padding:10px; background:#f5f7fa; border-radius:6px; }' +
    '.tpl-add input { padding:5px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px; margin-right:6px; }' +
    '.tpl-add button { padding:5px 12px; }';
  document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  // モード切替時・タブ切替時に再注入
  document.addEventListener('click', e => {
    if (e.target.closest('.record-mode-btn, .tab-btn')) {
      setTimeout(injectTemplateButtons, 100);
    }
  });
  setTimeout(injectTemplateButtons, 500);
});

window.RecordTemplates = {
  load: loadTemplates,
  save: saveTemplates,
  add: addTemplate,
  delete: deleteTemplate,
  openPicker
};

})();
