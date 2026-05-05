'use strict';
/* ==========================================================================
 * onboarding-wizard.js — 初回起動オンボーディングウィザード
 *
 * 配布版で初めてアプリを開いた人向けの 5 ステップ・ガイド
 *  Step 1: ようこそ
 *  Step 2: 学校名・クラス名・学年
 *  Step 3: 名簿登録（CSV or 手入力）
 *  Step 4: 4 モードの説明（タブ巡回ツアー）
 *  Step 5: クラウド同期は後で設定 OK & 完了
 *
 * 起動条件: localStorage に 'onboardingWizardDone_v2' が無い場合
 * 強制再表示: 設定タブ「もう一度ガイドを見る」ボタン
 * ========================================================================== */

(function() {

const KEY = 'onboardingWizardDone_v2';

function _esc(s) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let _step = 1;
const TOTAL_STEPS = 5;

function open(forceShow) {
  if (!forceShow && localStorage.getItem(KEY)) return;
  // 旧簡易オンボーディングモーダルを閉じる
  const old = document.getElementById('onboardingModal');
  if (old) old.classList.add('hidden');
  _step = 1;
  render();
}

function close() {
  const m = document.getElementById('owWizard');
  if (m) m.remove();
  localStorage.setItem(KEY, '1');
}

function render() {
  let m = document.getElementById('owWizard');
  if (!m) {
    m = document.createElement('div');
    m.id = 'owWizard';
    m.className = 'ow-bd';
    document.body.appendChild(m);
  }
  m.innerHTML = renderStep(_step);
  bindEvents(m);
}

function renderStep(step) {
  const isPersonal = window.APP_CONFIG && window.APP_CONFIG.mode === 'personal';
  let body = '';
  switch (step) {
    case 1:
      body = stepWelcome();
      break;
    case 2:
      body = stepClassInfo();
      break;
    case 3:
      body = stepRoster();
      break;
    case 4:
      body = stepTour();
      break;
    case 5:
      body = stepFinish(isPersonal);
      break;
  }
  return '<div class="ow-modal">'
       + '<div class="ow-progress">'
       + Array.from({length: TOTAL_STEPS}, (_, i) =>
           '<span class="ow-dot' + (i + 1 === step ? ' active' : '') + (i + 1 < step ? ' done' : '') + '"></span>'
         ).join('')
       + ' <span class="ow-step-label">ステップ ' + step + ' / ' + TOTAL_STEPS + '</span>'
       + ' <button class="ow-skip" id="owSkipBtn" title="スキップ">スキップ ✕</button>'
       + '</div>'
       + '<div class="ow-body">' + body + '</div>'
       + '</div>';
}

function stepWelcome() {
  const isPersonal = window.APP_CONFIG && window.APP_CONFIG.mode === 'personal';
  const brand = (window.APP_CONFIG && window.APP_CONFIG.brandName) || '担任記録アプリ';
  return '<h1>👋 ' + _esc(brand) + 'へようこそ</h1>'
       + '<p class="ow-lead">' + (isPersonal ? '個人版' : '配布版') + ' / 5 つの簡単なステップで設定できます（合計 約3分）</p>'
       + '<div class="ow-features">'
       + '<div class="ow-fc"><b>📝 4モード記録</b><br><span class="ow-mut">交友・ほめ・評価・ABA を1つのアプリで</span></div>'
       + '<div class="ow-fc"><b>🏫 学級概況</b><br><span class="ow-mut">未観察児童・気になる児童をパッと把握</span></div>'
       + '<div class="ow-fc"><b>📊 高度な分析</b><br><span class="ow-mut">中心性・PMI・移動平均・ヒートマップ</span></div>'
       + '<div class="ow-fc"><b>🪑 席替え自動配置</b><br><span class="ow-mut">NG・性別バランス・焼きなまし最適化</span></div>'
       + '<div class="ow-fc"><b>📷 写真・音声メモ</b><br><span class="ow-mut">児童ごとに作品やメモを保存</span></div>'
       + '<div class="ow-fc"><b>🔍 全文検索</b><br><span class="ow-mut">Ctrl+K で全モード横断検索</span></div>'
       + '</div>'
       + '<div class="ow-info-box">'
       + '<b>💡 データはあなたの端末（ブラウザ）にだけ保存されます。</b>'
       + 'ネット環境がなくても全機能が動きます。週1回はバックアップ（JSONエクスポート）を推奨。'
       + '</div>'
       + '<div class="ow-actions">'
       + '<button class="ow-next">はじめる →</button>'
       + '</div>';
}

function stepClassInfo() {
  const settings = (window.state && window.state.settings) || {};
  return '<h1>🏫 ステップ 2/5 — クラス情報の設定</h1>'
       + '<p class="ow-lead">後から「⚙ 設定」タブでいつでも変更できます。</p>'
       + '<div class="ow-form">'
       + '<label>学校名 <span class="ow-mut">(任意)</span><input type="text" id="owSchool" placeholder="例: ○○小学校" value="' + _esc(settings.schoolName || '') + '"></label>'
       + '<label>クラス名 <span class="ow-required">*</span><input type="text" id="owClass" placeholder="例: 5年4組" value="' + _esc(settings.classLabel || '') + '"></label>'
       + '<label>学年 <span class="ow-required">*</span>'
       + '<select id="owGrade">'
       + ['','1','2','3','4','5','6'].map(g =>
           '<option value="' + g + '"' + (String(settings.activeGrade || '') === g ? ' selected' : '') + '>' + (g ? g + '年' : '— 選択 —') + '</option>'
         ).join('')
       + '</select></label>'
       + '<p class="ow-mut small">学年を選ぶと、評価モードに該当学年の教科・単元が自動表示されます。<br>'
       + '現在: 5年（114単元・全7教科）/ 2年（35単元・7教科）対応。他学年は枠組みのみ。</p>'
       + '</div>'
       + '<div class="ow-actions">'
       + '<button class="ow-back">← 戻る</button>'
       + '<button class="ow-next" id="owClassNext">次へ →</button>'
       + '</div>';
}

function stepRoster() {
  const studs = (window.state && window.state.students) || [];
  return '<h1>👥 ステップ 3/5 — 児童名簿の登録</h1>'
       + '<p class="ow-lead">出席番号順で名簿を登録します。後から追加・編集できます。</p>'
       + '<div class="ow-roster-tabs">'
       + '<button class="ow-rt-btn active" data-rt="csv">📥 CSV一括取込（推奨）</button>'
       + '<button class="ow-rt-btn" data-rt="manual">✍ 1人ずつ手入力</button>'
       + '<button class="ow-rt-btn" data-rt="sample">⚡ サンプルで試す</button>'
       + '</div>'
       + '<div id="owRosterPane">'
       + '<div class="ow-rp" data-rp="csv">'
       + '<p class="ow-mut small">Excelや成績ソフトから「出席番号,名前,かな,性別」形式でコピペしてください。<br>性別は M / F / 男 / 女（省略可）。</p>'
       + '<textarea id="owCsvInput" rows="8" placeholder="1,佐藤太郎,さとうたろう,M&#10;2,鈴木花子,すずきはなこ,F&#10;3,田中一郎,たなかいちろう,M&#10;..."></textarea>'
       + '<button class="ow-rp-apply" id="owCsvApply">この内容で取り込む</button>'
       + '</div>'
       + '<div class="ow-rp" data-rp="manual" style="display:none;">'
       + '<p class="ow-mut small">設定タブの「児童名簿」カードから、後でじっくり登録できます。今は「次へ」進んでも OK。</p>'
       + '<p>現在の登録: <b>' + studs.length + '名</b></p>'
       + '</div>'
       + '<div class="ow-rp" data-rp="sample" style="display:none;">'
       + '<p class="ow-mut small">見本5名のサンプル名簿で動きを試せます（後から本物の名簿に置き換え可能）。</p>'
       + '<button class="ow-rp-apply" id="owSampleApply">サンプル5名を投入する</button>'
       + '</div>'
       + '</div>'
       + '<div class="ow-actions">'
       + '<button class="ow-back">← 戻る</button>'
       + '<button class="ow-next">次へ →</button>'
       + '</div>';
}

function stepTour() {
  return '<h1>🎯 ステップ 4/5 — 4モードの使い方ツアー</h1>'
       + '<p class="ow-lead">画面上部の「📝 記録」タブには 4 つのモードがあります。場面に応じて使い分けてください。</p>'
       + '<div class="ow-modes">'
       + '<div class="ow-m"><div class="ow-m-emoji">📝</div><div><b>交友関係</b><br>'
       + '<span class="ow-mut small">「誰と誰が一緒にいた」を記録。シーン（休み時間/授業中など）と一緒に保存。集計タブで PMI・Jaccard・中心性指標を確認</span></div></div>'
       + '<div class="ow-m"><div class="ow-m-emoji">🌟</div><div><b>ほめたい</b><br>'
       + '<span class="ow-mut small">良かった行動を1タップで記録。複数選択＋クイックタグ（手伝い/協力/挙手など）で時短</span></div></div>'
       + '<div class="ow-m"><div class="ow-m-emoji">📊</div><div><b>観点別評価</b><br>'
       + '<span class="ow-mut small">教科×単元×3観点で ABC（または5段階）を記録。何度でも追記可能（補助簿として機能）。教科別マトリクスシートに自動集計</span></div></div>'
       + '<div class="ow-m"><div class="ow-m-emoji">🚨</div><div><b>ABAアセスメント</b><br>'
       + '<span class="ow-mut small">問題行動を A-B-C 構造（先行・行動・結果）で記録。離席/暴言/寝る等のワンタップ＋ステップ式UI</span></div></div>'
       + '</div>'
       + '<div class="ow-tabs-tour">'
       + '<h3>主要タブ</h3>'
       + '<ul>'
       + '<li><b>🏫 概況</b> — 今日の状況・気になる児童を一覧</li>'
       + '<li><b>📜 履歴</b> — 全記録の検索・絞り込み・編集</li>'
       + '<li><b>🌐 中心性</b> — SNAで関係構造を可視化</li>'
       + '<li><b>🪑 席</b> — 班分け＋座席自動配置（NG/性別/焼きなまし）</li>'
       + '<li><b>⚙ 設定</b> — 名簿管理・バックアップ・PDFレポート</li>'
       + '</ul>'
       + '<p class="ow-info-box small">'
       + '🔍 <b>Ctrl+K</b> で全モード横断検索 / <b>?</b> でヘルプ / <b>1</b>〜<b>28</b> 数字キーで児童選択'
       + '</p>'
       + '</div>'
       + '<div class="ow-actions">'
       + '<button class="ow-back">← 戻る</button>'
       + '<button class="ow-next">次へ →</button>'
       + '</div>';
}

function stepFinish(isPersonal) {
  return '<h1>✅ ステップ 5/5 — 完了！</h1>'
       + '<p class="ow-lead">準備ができました。すぐに使い始められます。</p>'
       + '<div class="ow-finish-grid">'
       + '<div class="ow-fc"><h3>💾 データの保存先</h3>'
       + '<p class="ow-mut small">あなたの端末（ブラウザの localStorage）にのみ保存されます。<br>'
       + '<b>週1回</b>は ⚙ 設定 →「📥 JSONエクスポート」でバックアップを推奨。</p></div>'
       + '<div class="ow-fc"><h3>☁ クラウド同期（任意）</h3>'
       + '<p class="ow-mut small">' + (isPersonal
           ? '個人版は同期設定済みです。複数PCで自動同期されます。'
           : '複数PC・スマホで同期したい場合のみ。<br>同梱の <a href="setup-gas.html" target="_blank" style="color:#4a90e2;font-weight:600;">📘 setup-gas.html を開く</a> と、対話型ガイドが画面で1ステップずつ案内します（5-7分）。<br><b>不要な場合はそのまま使えます。</b>')
       + '</p></div>'
       + '<div class="ow-fc"><h3>📱 ホーム画面に追加</h3>'
       + '<p class="ow-mut small">PWA対応。Chromeのアドレスバー右側「⊕」or「インストール」ボタンで、デスクトップアプリのように使えます。</p></div>'
       + '<div class="ow-fc"><h3>📚 ヘルプ</h3>'
       + '<p class="ow-mut small">右上の <b>?</b> ボタンでショートカット一覧。<br>このガイドは ⚙ 設定 →「もう一度ガイドを見る」で再表示できます。</p></div>'
       + '</div>'
       + '<div class="ow-actions ow-actions-finish">'
       + '<button class="ow-back">← 戻る</button>'
       + '<button class="ow-finish" id="owFinishBtn">記録をはじめる 🚀</button>'
       + '</div>';
}

function bindEvents(m) {
  m.querySelectorAll('.ow-next').forEach(b => b.addEventListener('click', () => goNext()));
  m.querySelectorAll('.ow-back').forEach(b => b.addEventListener('click', () => goBack()));
  m.querySelector('#owSkipBtn')?.addEventListener('click', () => {
    if (confirm('セットアップをスキップします。後で ⚙ 設定 から再表示できます。よろしいですか？')) {
      close();
    }
  });
  m.querySelector('#owFinishBtn')?.addEventListener('click', () => {
    close();
    // 概況タブにジャンプ
    const ovBtn = document.querySelector('.tab-btn[data-tab="overview"]');
    if (ovBtn) ovBtn.click();
  });
  m.querySelector('#owClassNext')?.addEventListener('click', () => {
    const cls = m.querySelector('#owClass').value.trim();
    const grade = m.querySelector('#owGrade').value;
    if (!cls) { alert('クラス名は必須です'); return; }
    if (!grade) { alert('学年を選択してください'); return; }
    if (window.state && window.state.settings) {
      const sch = m.querySelector('#owSchool').value.trim();
      window.state.settings.schoolName = sch;
      window.state.settings.classLabel = cls;
      window.state.settings.activeGrade = parseInt(grade, 10);
      if (typeof window.saveState === 'function') window.saveState();
      if (typeof applyAppHeader === 'function') applyAppHeader();
      if (typeof applyGradeData === 'function') applyGradeData(window.state.settings.activeGrade);
    }
    goNext();
  });
  // 名簿タブ切替
  m.querySelectorAll('.ow-rt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      m.querySelectorAll('.ow-rt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.rt;
      m.querySelectorAll('.ow-rp').forEach(p => {
        p.style.display = p.dataset.rp === target ? 'block' : 'none';
      });
    });
  });
  m.querySelector('#owCsvApply')?.addEventListener('click', () => {
    const text = m.querySelector('#owCsvInput').value.trim();
    if (!text) { alert('CSVを貼り付けてください'); return; }
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const newStudents = [];
    for (const line of lines) {
      const cols = line.split(/[\t,]/).map(c => c.trim());
      const id = parseInt(cols[0], 10);
      const name = cols[1] || '';
      if (!id || !name) continue;
      const obj = { id, name };
      if (cols[2]) obj.kana = cols[2];
      if (cols[3] === 'M' || cols[3] === '男') obj.gender = 'M';
      if (cols[3] === 'F' || cols[3] === '女') obj.gender = 'F';
      newStudents.push(obj);
    }
    if (newStudents.length === 0) { alert('有効な行がありません。形式を確認してください。'); return; }
    if (window.state) {
      window.state.students = newStudents;
      window.state.settings.customStudents = newStudents.slice();
      if (typeof window.saveState === 'function') window.saveState();
      if (typeof renderStudentButtons === 'function') renderStudentButtons();
    }
    alert('✓ ' + newStudents.length + '名を取り込みました');
  });
  m.querySelector('#owSampleApply')?.addEventListener('click', () => {
    const sample = (window.APP_CONFIG && window.APP_CONFIG.sampleStudents) || [
      { id: 1, name: '見本 太郎', kana: 'みほん たろう' },
      { id: 2, name: '見本 花子', kana: 'みほん はなこ' },
      { id: 3, name: '見本 次郎', kana: 'みほん じろう' },
      { id: 4, name: '見本 さくら', kana: 'みほん さくら' },
      { id: 5, name: '見本 健太', kana: 'みほん けんた' }
    ];
    if (window.state) {
      window.state.students = sample.map(s => ({ ...s }));
      window.state.settings.customStudents = window.state.students.slice();
      if (typeof window.saveState === 'function') window.saveState();
      if (typeof renderStudentButtons === 'function') renderStudentButtons();
    }
    alert('✓ サンプル5名を投入しました');
  });
}

function goNext() {
  if (_step < TOTAL_STEPS) { _step++; render(); }
}

function goBack() {
  if (_step > 1) { _step--; render(); }
}

// ===== スタイル =====
function injectStyles() {
  if (document.getElementById('owStyles')) return;
  const s = document.createElement('style');
  s.id = 'owStyles';
  s.textContent = `
    .ow-bd { position:fixed; inset:0; background:rgba(20,30,50,0.7); z-index:99998; display:flex; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(4px); }
    .ow-modal { background:white; border-radius:14px; max-width:720px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.4); }
    .ow-progress { display:flex; align-items:center; padding:14px 20px; border-bottom:1px solid #eef; gap:6px; background:#f8fafc; border-radius:14px 14px 0 0; }
    .ow-dot { width:10px; height:10px; border-radius:50%; background:#cbd5e0; transition:all .2s; }
    .ow-dot.active { background:#4a90e2; width:30px; border-radius:5px; }
    .ow-dot.done { background:#48bb78; }
    .ow-step-label { margin-left:auto; font-size:12px; color:#666; }
    .ow-skip { padding:4px 10px; background:transparent; border:1px solid #ddd; border-radius:5px; cursor:pointer; font-size:11px; color:#888; }
    .ow-skip:hover { background:#f5f5f5; }
    .ow-body { padding:24px 28px; }
    .ow-body h1 { font-size:22px; margin:0 0 8px; color:#2c3e50; font-weight:700; }
    .ow-body h3 { font-size:13px; margin:0 0 6px; color:#444; }
    .ow-lead { font-size:13px; color:#666; margin:0 0 14px; line-height:1.5; }
    .ow-mut { color:#888; }
    .ow-required { color:#c00; font-weight:bold; }
    .ow-features { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:14px; }
    .ow-fc { padding:10px 12px; border:1px solid #eef; border-radius:8px; background:#fafbfc; font-size:13px; line-height:1.5; }
    .ow-info-box { padding:10px 14px; background:#fff8e1; border-left:4px solid #ffb300; border-radius:5px; font-size:12.5px; line-height:1.6; margin:14px 0; }
    .ow-info-box.small { padding:6px 10px; font-size:11.5px; }
    .ow-form label { display:block; margin-bottom:12px; font-size:13px; font-weight:600; color:#444; }
    .ow-form input, .ow-form select { width:100%; padding:10px 12px; border:2px solid #ddd; border-radius:6px; font-size:14px; margin-top:4px; box-sizing:border-box; font-family:inherit; }
    .ow-form input:focus, .ow-form select:focus { outline:none; border-color:#4a90e2; }
    .ow-roster-tabs { display:flex; gap:6px; margin-bottom:14px; border-bottom:2px solid #eef; padding-bottom:0; }
    .ow-rt-btn { padding:8px 14px; background:transparent; border:none; border-bottom:3px solid transparent; cursor:pointer; font-size:13px; color:#888; margin-bottom:-2px; }
    .ow-rt-btn:hover { color:#4a90e2; }
    .ow-rt-btn.active { color:#4a90e2; border-bottom-color:#4a90e2; font-weight:600; }
    .ow-rp textarea { width:100%; padding:10px; border:2px solid #ddd; border-radius:6px; font-family:Consolas,'Courier New',monospace; font-size:12px; resize:vertical; box-sizing:border-box; }
    .ow-rp-apply { margin-top:8px; padding:8px 16px; background:#4a90e2; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; }
    .ow-rp-apply:hover { background:#357abd; }
    .ow-modes { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
    .ow-m { display:flex; gap:8px; padding:8px 10px; background:#fafbfc; border:1px solid #eef; border-radius:6px; font-size:12px; line-height:1.5; }
    .ow-m-emoji { font-size:24px; flex-shrink:0; }
    .ow-tabs-tour ul { padding-left:18px; font-size:12.5px; line-height:1.7; margin:6px 0; }
    .ow-finish-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
    .ow-actions { display:flex; justify-content:space-between; padding-top:14px; gap:10px; border-top:1px solid #eef; margin-top:18px; }
    .ow-actions-finish { justify-content:space-between; }
    .ow-actions button { padding:10px 22px; border-radius:6px; border:none; cursor:pointer; font-size:14px; font-weight:600; }
    .ow-back { background:#e8eef5; color:#4a5568; }
    .ow-back:hover { background:#cbd5e0; }
    .ow-next, .ow-finish { background:#4a90e2; color:white; margin-left:auto; }
    .ow-next:hover, .ow-finish:hover { background:#357abd; }
    .ow-finish { background:#48bb78; padding:12px 28px; font-size:15px; }
    .ow-finish:hover { background:#38a169; }
    @media (max-width: 600px) {
      .ow-features, .ow-modes, .ow-finish-grid { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(s);
}

// ===== 設定タブに「もう一度ガイド」ボタン注入 =====
function injectReshowButton() {
  if (document.getElementById('owReshowBtn')) return;
  const cards = document.querySelectorAll('#tab-settings .card');
  let target = null;
  cards.forEach(c => {
    if (target) return;
    const h3 = c.querySelector('h3');
    if (h3 && h3.textContent.includes('アプリ設定')) target = c;
  });
  if (!target) return;
  const btn = document.createElement('button');
  btn.id = 'owReshowBtn';
  btn.className = 'ghost';
  btn.style.cssText = 'margin-top:8px;padding:5px 12px;font-size:12px;';
  btn.textContent = '🎓 セットアップガイドをもう一度見る';
  btn.addEventListener('click', () => open(true));
  target.appendChild(btn);
}

// ===== ヘッダー右側にもガイドボタン注入（常時アクセス可能） =====
function injectHeaderGuideButton() {
  if (document.getElementById('owHeaderBtn')) return;
  const helpBtn = document.getElementById('helpBtn');
  if (!helpBtn || !helpBtn.parentNode) return;
  const btn = document.createElement('button');
  btn.id = 'owHeaderBtn';
  btn.className = 'help-btn';
  btn.title = 'セットアップガイドを表示（何度でも見られます）';
  btn.textContent = '🎓';
  btn.style.cssText = 'margin-right:4px;';
  btn.addEventListener('click', () => open(true));
  helpBtn.parentNode.insertBefore(btn, helpBtn);
}

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  // ヘッダーにガイドボタンを即時注入
  setTimeout(injectHeaderGuideButton, 300);
  // 旧簡易オンボーディングは閉じておく
  setTimeout(() => {
    const old = document.getElementById('onboardingModal');
    if (old) old.classList.add('hidden');
    // 配布版 or 完全初回（記録ゼロ）なら起動
    const isDist = window.APP_CONFIG && window.APP_CONFIG.mode === 'distribution';
    const noRecords = !window.state || (window.state.records || []).length === 0;
    const noClass = !window.state || !window.state.settings || !window.state.settings.classLabel;
    if (isDist && noClass) {
      open(false);
    } else if (noRecords && noClass) {
      open(false);
    }
  }, 500);
  // 設定タブに「もう一度」ボタン注入
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn && btn.getAttribute('data-tab') === 'settings') {
      setTimeout(injectReshowButton, 200);
    }
  });
});

window.OnboardingWizard = { open, close };

})();
