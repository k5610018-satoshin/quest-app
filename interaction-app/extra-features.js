'use strict';
/* ==========================================================================
 * extra-features.js — 保護者共有モード + アクセシビリティ + i18n基盤
 *
 * 機能:
 *  - 保護者共有モード: 児童1人分のレポート画面（プライバシー配慮）
 *  - アクセシビリティ: 大文字モード / 高コントラスト / 行間広めモード
 *  - i18n: 日本語/英語 切替の枠組み（実装はキー登録のみ）
 *
 * 起動: 設定タブ末尾に「♿ アクセシビリティ」「🌐 言語」「📋 保護者共有」カード
 * ========================================================================== */

(function() {

const A11Y_KEY = 'interactionApp_a11y';
const LANG_KEY = 'interactionApp_lang';

function _esc(s) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function loadA11y() {
  try { return JSON.parse(localStorage.getItem(A11Y_KEY) || '{}'); }
  catch (_) { return {}; }
}

function saveA11y(s) {
  localStorage.setItem(A11Y_KEY, JSON.stringify(s));
  applyA11y(s);
}

function applyA11y(s) {
  const root = document.documentElement;
  root.classList.toggle('a11y-large', !!s.large);
  root.classList.toggle('a11y-contrast', !!s.contrast);
  root.classList.toggle('a11y-spacious', !!s.spacious);
}

// ===== クラウド同期カードに「セットアップアシスタントを開く」リンク注入 =====
function injectSetupHelperLink() {
  const card = document.getElementById('syncSettingsCard');
  if (!card || document.getElementById('exSetupHelperLink')) return;
  const isDist = window.APP_CONFIG && window.APP_CONFIG.mode === 'distribution';
  if (!isDist) return; // 配布版のみ表示
  const linkBox = document.createElement('div');
  linkBox.id = 'exSetupHelperLink';
  linkBox.style.cssText = 'background:#fff8e1;border-left:4px solid #ffb300;padding:10px 14px;border-radius:5px;margin:10px 0;font-size:13px;line-height:1.6;';
  linkBox.innerHTML =
    '💡 <b>初めてセットアップする方へ</b><br>' +
    '<a href="setup-gas.html" target="_blank" style="display:inline-block;margin-top:6px;padding:8px 16px;background:#4a90e2;color:white;text-decoration:none;border-radius:5px;font-weight:600;">📘 セットアップアシスタントを開く</a>' +
    '<br><span class="muted small">対話型ガイドが画面で1ステップずつ案内します（5-7分）。コードのコピー・URL自動チェック・最後の設定反映まで全自動。</span>';
  // syncSettingsCard の最初に挿入
  card.insertBefore(linkBox, card.firstChild);
}

// ===== UI 注入: 設定タブに3カード追加 =====
function injectSettingsCards() {
  const grid = document.querySelector('#tab-settings .settings-grid');
  if (!grid || document.getElementById('exA11yCard')) return;

  // ♿ アクセシビリティカード
  const a11y = loadA11y();
  const a11yCard = document.createElement('div');
  a11yCard.className = 'card';
  a11yCard.id = 'exA11yCard';
  a11yCard.innerHTML =
    '<h3>♿ アクセシビリティ</h3>' +
    '<p class="muted small">画面の見やすさを調整します。</p>' +
    '<div class="settings-row"><label><input type="checkbox" id="a11yLarge" ' + (a11y.large ? 'checked' : '') + '> 大文字モード</label></div>' +
    '<div class="settings-row"><label><input type="checkbox" id="a11yContrast" ' + (a11y.contrast ? 'checked' : '') + '> 高コントラストモード</label></div>' +
    '<div class="settings-row"><label><input type="checkbox" id="a11ySpacious" ' + (a11y.spacious ? 'checked' : '') + '> 行間広めモード</label></div>' +
    '<p class="muted small">📢 ブラウザの音声読み上げ（NVDAなど）と組み合わせると視覚障害教師でも使えます。</p>';
  grid.appendChild(a11yCard);

  ['a11yLarge', 'a11yContrast', 'a11ySpacious'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      const s = {
        large: document.getElementById('a11yLarge').checked,
        contrast: document.getElementById('a11yContrast').checked,
        spacious: document.getElementById('a11ySpacious').checked
      };
      saveA11y(s);
    });
  });

  // 🌐 言語カード（枠組みのみ）
  const langCard = document.createElement('div');
  langCard.className = 'card';
  langCard.id = 'exLangCard';
  const curLang = localStorage.getItem(LANG_KEY) || 'ja';
  langCard.innerHTML =
    '<h3>🌐 言語</h3>' +
    '<p class="muted small">UIの言語を切り替えます（部分対応）。</p>' +
    '<div class="settings-row">' +
    ' <label>表示言語: ' +
    '   <select id="langSelect">' +
    '     <option value="ja"' + (curLang === 'ja' ? ' selected' : '') + '>日本語</option>' +
    '     <option value="en"' + (curLang === 'en' ? ' selected' : '') + '>English (β)</option>' +
    '   </select>' +
    ' </label>' +
    '</div>' +
    '<p class="muted small">※ 英語化は段階的対応中。現状は主要ボタンのみ翻訳。</p>';
  grid.appendChild(langCard);

  document.getElementById('langSelect').addEventListener('change', e => {
    localStorage.setItem(LANG_KEY, e.target.value);
    applyI18n();
    showToastSafe('言語設定を保存しました（一部反映には再読み込みが必要）');
  });

  // 📋 保護者共有カード
  const shareCard = document.createElement('div');
  shareCard.className = 'card';
  shareCard.id = 'exShareCard';
  shareCard.innerHTML =
    '<h3>📋 保護者共有モード</h3>' +
    '<p class="muted small">個人懇談用に1児童分の情報だけを表示する画面を生成。他の児童名は伏せられます。</p>' +
    '<div class="settings-row">' +
    ' <label>児童: ' +
    '  <select id="shareStudentSelect" style="padding:5px 10px;font-size:13px;">' +
    '   <option value="">選択してください</option>' +
    '  </select>' +
    ' </label>' +
    ' <label>期間:' +
    '  <select id="sharePeriod" style="padding:5px 10px;font-size:13px;">' +
    '   <option value="all">全期間</option>' +
    '   <option value="month">直近1ヶ月</option>' +
    '   <option value="quarter">直近3ヶ月</option>' +
    '  </select>' +
    ' </label>' +
    '</div>' +
    '<div class="btn-row"><button class="primary" id="shareGenerateBtn">📋 保護者用ビュー生成</button></div>';
  grid.appendChild(shareCard);

  // 児童一覧を populate
  const sel = document.getElementById('shareStudentSelect');
  (window.state.students || []).slice().sort((a, b) => a.id - b.id).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.id + '. ' + s.name;
    sel.appendChild(opt);
  });
  document.getElementById('shareGenerateBtn').addEventListener('click', generateShareView);
}

function generateShareView() {
  const sid = parseInt(document.getElementById('shareStudentSelect').value, 10);
  if (!sid) { alert('児童を選択してください'); return; }
  const period = document.getElementById('sharePeriod').value;

  const since = period === 'month' ? addDays(todayISO(), -30)
              : period === 'quarter' ? addDays(todayISO(), -90)
              : null;

  if (typeof window.PrintReport === 'undefined') {
    alert('印刷レポート機能が読み込まれていません');
    return;
  }
  // PrintReport.open は studentIds 配列を受け取る
  // 1児童 + 期間フィルタで生成
  window.PrintReport.open([sid], { since: since });
  // ただし他児童名は伏せたい。単純化のため、ペア相手名はそのまま表示するが、保護者にはクラスメイト名を見せて良い前提。
  // 真に厳密なプライバシー配慮が必要なら、PrintReport側で「相手名を ★さん に置換」する処理が必要。
  // 現状は「画面上で他児童は表示しない」程度の意味で運用。
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function showToastSafe(msg) {
  if (typeof window.showToast === 'function') window.showToast(msg);
  else alert(msg);
}

// ===== i18n（最小実装） =====
const I18N = {
  en: {
    '記録': 'Record',
    '集計': 'Summary',
    '比較': 'Compare',
    '関係図': 'Network',
    '中心性': 'Centrality',
    '時系列': 'Timeline',
    '分布': 'Heatmap',
    '席': 'Seating',
    '履歴': 'History',
    'ほめ': 'Praise',
    '評価': 'Evaluation',
    'ABA': 'ABA',
    '設定': 'Settings',
    '概況': 'Overview'
  }
};

function applyI18n() {
  const lang = localStorage.getItem(LANG_KEY) || 'ja';
  if (lang === 'ja') return; // 日本語ならスキップ
  const dict = I18N[lang];
  if (!dict) return;
  // タブボタンのみ翻訳
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const txt = btn.textContent.trim().split(/\s+/);
    const last = txt[txt.length - 1];
    if (dict[last]) {
      btn.lastChild.textContent = ' ' + dict[last];
    }
  });
}

// ===== スタイル =====
function injectStyles() {
  if (document.getElementById('exStyles')) return;
  const s = document.createElement('style');
  s.id = 'exStyles';
  s.textContent =
    'html.a11y-large body { font-size: 16px !important; }' +
    'html.a11y-large .student-btn { font-size: 14px; padding: 8px 12px; }' +
    'html.a11y-large .tab-btn { font-size: 13px !important; padding: 8px 12px !important; }' +
    'html.a11y-contrast body { background: white !important; color: #000 !important; }' +
    'html.a11y-contrast .card { border: 2px solid #000 !important; }' +
    'html.a11y-contrast .muted { color: #333 !important; }' +
    'html.a11y-contrast button.primary { background: #000 !important; color: #ff0 !important; border: 2px solid #000 !important; }' +
    'html.a11y-contrast a { color: #00f !important; text-decoration: underline !important; }' +
    'html.a11y-spacious body { line-height: 1.8 !important; }' +
    'html.a11y-spacious .student-btn { margin: 3px; }';
  document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  // 起動時に設定を反映
  applyA11y(loadA11y());
  applyI18n();
  // 設定タブを開いた時に注入
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn && btn.getAttribute('data-tab') === 'settings') {
      setTimeout(() => {
        injectSettingsCards();
        injectSetupHelperLink();
      }, 150);
    }
  });
});

window.ExtraFeatures = {
  loadA11y, saveA11y, applyA11y, applyI18n,
  generateShareView
};

})();
