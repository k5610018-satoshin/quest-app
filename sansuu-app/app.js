/* ============================================================
 * 算数 自由進度学習アプリ - 児童側 v0.1
 * 設計: スクロール禁止 / 1画面完結 / btn-grp / 選択→まとめて保存
 * 依存: cloud-sync.js, idb-storage.js, data/unit_master.json, data/prompts.js
 * ============================================================ */
(() => {
  'use strict';

  // ----------------------------------------------------------------
  // State
  // ----------------------------------------------------------------
  const STORAGE_KEY = 'sansuuApp_v1';
  const DEVICE_ID = ensureDeviceId_();
  const CLASS_ID = '5-4-2026';
  const NUMBERS = Array.from({ length: 28 }, (_, i) => i + 1);

  const state = {
    studentNumber: null,           // 1〜28
    studentId: null,               // 'todasho-2026-5-4-01'
    units: [],                     // unit_master.json の units 配列
    selectedUnitId: null,
    progressCache: {},             // { 'unit_id|item_id': latestRow }
    currentTab: 'manual',
    manualLevel: 'basic',
    reflectForm: {
      itemId: '',
      status: '',
      reasonTags: new Set(),
      reasonFree: '',
      strategyTag: '',
      strategyFree: ''
    }
  };

  // ----------------------------------------------------------------
  // Boot
  // ----------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      loadStateFromStorage_();
      // ?reset=1 でローカル状態リセット
      if (location.search.includes('reset=1')) {
        localStorage.removeItem(STORAGE_KEY);
        state.studentNumber = null;
        state.studentId = null;
      }
      await loadUnitMaster_();
      initLoginScreen_();
      initTabs_();
      initBtnGrps_();
      initUnitSelect_();
      initActionFooter_();
      initReflectForm_();
      initModalCloseHandlers_();

      if (state.studentNumber && state.studentId) {
        enterApp_();
      }
    } catch (err) {
      console.error('boot failed', err);
      const msg = document.createElement('div');
      msg.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#FF6B6B;color:white;padding:12px;text-align:center;z-index:9999;';
      msg.innerHTML = `起動エラー: ${err.message}<br><small>?reset=1 をURL末尾に付けてリロードすると初期化できます</small>`;
      document.body.appendChild(msg);
    }
  });

  // ----------------------------------------------------------------
  // 状態の保存・復元
  // ----------------------------------------------------------------
  function saveState_() {
    const snapshot = {
      studentNumber: state.studentNumber,
      studentId: state.studentId,
      selectedUnitId: state.selectedUnitId,
      currentTab: state.currentTab,
      manualLevel: state.manualLevel,
      ts: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (err) { console.warn('saveState failed', err); }
  }

  function loadStateFromStorage_() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      state.studentNumber = obj.studentNumber || null;
      state.studentId = obj.studentId || null;
      state.selectedUnitId = obj.selectedUnitId || null;
      state.currentTab = obj.currentTab || 'manual';
      state.manualLevel = obj.manualLevel || 'basic';
    } catch (err) { console.warn('loadState failed', err); }
  }

  function ensureDeviceId_() {
    let id = localStorage.getItem('sansuuApp_deviceId');
    if (!id) {
      id = 'dev-' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('sansuuApp_deviceId', id);
    }
    return id;
  }

  // ----------------------------------------------------------------
  // Unit Master の読み込み
  // ----------------------------------------------------------------
  async function loadUnitMaster_() {
    // 優先1: window.UNIT_MASTER（unit_master.js から）
    if (window.UNIT_MASTER && Array.isArray(window.UNIT_MASTER.units)) {
      state.units = window.UNIT_MASTER.units;
      if (!state.selectedUnitId && state.units.length > 0) {
        state.selectedUnitId = state.units[0].unit_id;
      }
      // 教師側で編集された上書きデータがあれば適用
      try {
        const overrides = JSON.parse(localStorage.getItem('sansuuApp_unitOverrides') || '{}');
        if (overrides.units) {
          state.units = overrides.units;
        }
      } catch {}
      return;
    }
    // 優先2: fetch（http(s):// での起動時のみ動く）
    try {
      const res = await fetch('data/unit_master.json', { cache: 'no-cache' });
      const data = await res.json();
      state.units = data.units || [];
      if (!state.selectedUnitId && state.units.length > 0) {
        state.selectedUnitId = state.units[0].unit_id;
      }
    } catch (err) {
      console.error('loadUnitMaster failed', err);
      console.warn('単元データの読み込み失敗。data/unit_master.js が読み込まれているか確認してください。');
    }
  }

  function getCurrentUnit_() {
    return state.units.find(u => u.unit_id === state.selectedUnitId) || null;
  }

  // ----------------------------------------------------------------
  // 番号ログイン
  // ----------------------------------------------------------------
  function initLoginScreen_() {
    const grid = document.getElementById('numberGrid');
    if (!grid) {
      console.error('numberGrid not found');
      return;
    }
    grid.innerHTML = '';
    NUMBERS.forEach(n => {
      const btn = document.createElement('button');
      btn.textContent = n;
      btn.dataset.number = n;
      btn.addEventListener('click', () => {
        try {
          state.studentNumber = n;
          state.studentId = `todasho-2026-5-4-${String(n).padStart(2, '0')}`;
          saveState_();
          enterApp_();
        } catch (err) {
          console.error('login click error', err);
          alert('ログイン処理でエラー: ' + err.message);
        }
      });
      grid.appendChild(btn);
    });
  }

  function enterApp_() {
    try {
      document.getElementById('loginScreen').hidden = true;
      document.getElementById('mainApp').hidden = false;
      document.getElementById('studentBadge').textContent = `No.${state.studentNumber}`;

      populateUnitSelect_();
      showTab_(state.currentTab);
      refreshUnitView_();

      if (window.CloudSync && window.CloudSync.isConfigured()) {
        pullProgressForCurrentUnit_();
      }
    } catch (err) {
      console.error('enterApp error', err);
      alert('画面遷移エラー: ' + err.message + '\n\nもう一度ログインし直してください（右上 ← ボタン）');
    }
  }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    state.studentNumber = null;
    state.studentId = null;
    saveState_();
    document.getElementById('loginScreen').hidden = false;
    document.getElementById('mainApp').hidden = true;
  });

  // ----------------------------------------------------------------
  // タブ切替
  // ----------------------------------------------------------------
  function initTabs_() {
    document.getElementById('tabNav').addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      showTab_(btn.dataset.tab);
    });
  }

  function showTab_(tab) {
    state.currentTab = tab;
    saveState_();
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('active', c.dataset.tabContent === tab);
    });
    // タブ別の追加更新
    if (tab === 'today') renderDayCards_();
    if (tab === 'reflect') renderReflectItemSelect_();
  }

  // ----------------------------------------------------------------
  // 単元セレクト
  // ----------------------------------------------------------------
  function initUnitSelect_() {
    document.getElementById('unitSelect').addEventListener('change', e => {
      state.selectedUnitId = e.target.value;
      saveState_();
      refreshUnitView_();
      pullProgressForCurrentUnit_();
    });
  }

  function populateUnitSelect_() {
    const sel = document.getElementById('unitSelect');
    sel.innerHTML = '';
    state.units.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.unit_id;
      opt.textContent = `${u.order}. ${u.name}（${u.hours}時間）`;
      sel.appendChild(opt);
    });
    sel.value = state.selectedUnitId || (state.units[0] && state.units[0].unit_id);
  }

  function refreshUnitView_() {
    const u = getCurrentUnit_();
    if (!u) return;
    document.getElementById('manualUnitName').textContent = u.name;
    document.getElementById('manualUnitHours').textContent = `${u.hours}時間`;
    document.getElementById('manualUnitPages').textContent = u.textbook_pages || '';
    renderManualItemList_();
    renderProgressSummary_();
    renderDayCards_();
    renderReflectItemSelect_();
  }

  // ----------------------------------------------------------------
  // 手引きタブ
  // ----------------------------------------------------------------
  function renderManualItemList_() {
    const u = getCurrentUnit_();
    if (!u) return;
    const list = document.getElementById('manualItemList');
    const filtered = u.items.filter(it => it.level === state.manualLevel);
    list.innerHTML = '';
    filtered.forEach(it => {
      const li = document.createElement('li');
      li.className = 'item-row';
      const latest = state.progressCache[`${u.unit_id}|${it.item_id}`];
      if (latest && latest.status) {
        li.classList.add('status-' + latest.status.toLowerCase());
      }
      const statusMark = latest ? statusToMark_(latest.status) : '・';
      li.innerHTML = `
        <span class="item-id">${it.item_id}</span>
        <span class="item-label">${escapeHtml_(it.label)}</span>
        <span class="item-page">${escapeHtml_(it.page || '')}</span>
        <span class="item-status">${statusMark}</span>
        <button class="icon-btn" data-jump-reflect="${it.item_id}" title="この項目で振り返る">📝</button>
      `;
      list.appendChild(li);
    });
  }

  function statusToMark_(s) {
    return { A: '◎', B: '○', C: '△' }[s] || '・';
  }

  // ----------------------------------------------------------------
  // きょうタブ（今日±2日のカレンダー）
  // ----------------------------------------------------------------
  function renderDayCards_() {
    const wrap = document.getElementById('dayCards');
    if (!wrap) return;
    wrap.innerHTML = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let off = -2; off <= 2; off++) {
      const d = new Date(today);
      d.setDate(d.getDate() + off);
      const card = document.createElement('div');
      card.className = 'day-card' + (off === 0 ? ' today' : (off > 0 ? ' future' : ''));
      const dStr = `${d.getMonth() + 1}/${d.getDate()}`;
      const wDay = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
      const planText = off === 0 ? 'きょうのけ：単元の好きなところから' : (off > 0 ? '計画はこれから' : '・・・');
      card.innerHTML = `
        <div class="day-date">${dStr}（${wDay}）</div>
        <div class="day-plan">${planText}</div>
        <div class="day-status" data-day-offset="${off}">
          <div class="btn-grp">
            <button data-value="A" class="status-a">◎</button>
            <button data-value="B" class="status-b">○</button>
            <button data-value="C" class="status-c">△</button>
          </div>
        </div>
      `;
      wrap.appendChild(card);
    }
    // 今日のステータスはクリックで振り返りタブにジャンプ
    wrap.querySelectorAll('[data-day-offset="0"] button').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const v = btn.dataset.value;
        state.reflectForm.status = v;
        showTab_('reflect');
        // 反映
        document.querySelectorAll('.status-grp button').forEach(b => {
          b.classList.toggle('active', b.dataset.value === v);
        });
        document.getElementById('reflectStatus').value = v;
      });
    });
  }

  // ----------------------------------------------------------------
  // 振り返りタブ
  // ----------------------------------------------------------------
  function initReflectForm_() {
    // reason タグ：トグル式選択
    document.getElementById('reasonTags').addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const v = btn.dataset.value;
      if (state.reflectForm.reasonTags.has(v)) {
        state.reflectForm.reasonTags.delete(v);
        btn.classList.remove('active');
      } else {
        state.reflectForm.reasonTags.add(v);
        btn.classList.add('active');
      }
    });

    // 自由記述の同期
    document.getElementById('reflectReasonFree').addEventListener('input', e => {
      state.reflectForm.reasonFree = e.target.value;
    });
    document.getElementById('reflectStrategyFree').addEventListener('input', e => {
      state.reflectForm.strategyFree = e.target.value;
    });

    // 送信
    document.getElementById('submitReflectBtn').addEventListener('click', submitReflect_);

    // 手引きタブから振り返りへの遷移ボタン
    document.getElementById('manualItemList').addEventListener('click', e => {
      const btn = e.target.closest('[data-jump-reflect]');
      if (!btn) return;
      const itemId = btn.dataset.jumpReflect;
      state.reflectForm.itemId = itemId;
      showTab_('reflect');
      document.getElementById('reflectItem').value = itemId;
    });
  }

  function renderReflectItemSelect_() {
    const sel = document.getElementById('reflectItem');
    if (!sel) return;
    const u = getCurrentUnit_();
    if (!u) return;
    sel.innerHTML = '';
    u.items.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.item_id;
      opt.textContent = `${it.item_id} ${it.label}`;
      sel.appendChild(opt);
    });
    if (state.reflectForm.itemId) sel.value = state.reflectForm.itemId;
  }

  async function submitReflect_() {
    const itemId = document.getElementById('reflectItem').value;
    const status = document.getElementById('reflectStatus').value;
    if (!itemId || !status) {
      toast('項目と できぐあい を選んでね', 'error');
      return;
    }
    const data = {
      student_id: state.studentId,
      unit_id: state.selectedUnitId,
      item_id: itemId,
      status: status,
      reason_tags: Array.from(state.reflectForm.reasonTags),
      reason: state.reflectForm.reasonFree || null,
      strategy_tag: document.getElementById('reflectStrategy').value || null,
      next_strategy: state.reflectForm.strategyFree || null,
      device_id: DEVICE_ID,
      created_at: new Date().toISOString(),
      edited_at: new Date().toISOString()
    };

    // ローカルキャッシュへ即時反映
    state.progressCache[`${data.unit_id}|${data.item_id}`] = data;
    renderManualItemList_();
    renderProgressSummary_();

    // 同期
    document.getElementById('submitReflectBtn').disabled = true;
    try {
      const result = await window.CloudSync.push('progress', 'insert', data);
      if (result.ok) {
        toast('きろく完了！', 'success');
        clearReflectForm_();
      } else {
        toast('保存はしたよ。あとでつながったら同期するね', 'info');
      }
    } catch (err) {
      console.warn('reflect submit error', err);
      toast('保存はしたよ。あとでつながったら同期するね', 'info');
    } finally {
      document.getElementById('submitReflectBtn').disabled = false;
    }
  }

  function clearReflectForm_() {
    state.reflectForm = {
      itemId: '', status: '',
      reasonTags: new Set(), reasonFree: '',
      strategyTag: '', strategyFree: ''
    };
    document.querySelectorAll('.status-grp button, .reason-grp button, .strategy-grp button').forEach(b => {
      b.classList.remove('active');
    });
    document.getElementById('reflectStatus').value = '';
    document.getElementById('reflectStrategy').value = '';
    document.getElementById('reflectReasonFree').value = '';
    document.getElementById('reflectStrategyFree').value = '';
  }

  // ----------------------------------------------------------------
  // フッタの上位層対応ボタン
  // ----------------------------------------------------------------
  function initActionFooter_() {
    document.querySelector('.action-footer').addEventListener('click', async e => {
      const btn = e.target.closest('.action-btn');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'help') return showHelpModal_();
      if (['teach', 'self_problem', 'strategy_text'].includes(action)) {
        return promptChallenge_(action === 'teach' ? 'teach_friend' : action);
      }
    });
  }

  function showHelpModal_() {
    const list = document.getElementById('helpStepsList');
    list.innerHTML = '';
    window.PROMPTS.helpSteps.forEach((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="help-icon">${s.icon}</span>
        <span class="help-label">${i + 1}. ${escapeHtml_(s.label)}</span>
        <span class="help-detail">${escapeHtml_(s.detail)}</span>
      `;
      list.appendChild(li);
    });
    document.getElementById('helpModal').hidden = false;
  }

  function initModalCloseHandlers_() {
    const helpClose = document.getElementById('helpCloseBtn');
    const teachClose = document.getElementById('teachCloseBtn');
    const askTeacher = document.getElementById('askTeacherBtn');

    if (helpClose) helpClose.addEventListener('click', () => {
      document.getElementById('helpModal').hidden = true;
    });
    if (teachClose) teachClose.addEventListener('click', () => {
      document.getElementById('teachModal').hidden = true;
    });
    if (askTeacher) askTeacher.addEventListener('click', async () => {
      const data = {
        teacher_id: 'sato',
        student_id: state.studentId,
        unit_id: state.selectedUnitId,
        kind: 'help_received',
        comment: `No.${state.studentNumber} がヘルプ要請（${getCurrentUnit_()?.name || ''}）`,
        ai_generated: false,
        created_at: new Date().toISOString()
      };
      try {
        await window.CloudSync.push('interventions', 'insert', data);
        toast('先生にとどけたよ！すこし待ってね', 'success');
      } catch (err) {
        toast('あとでつながったら送るね', 'info');
      }
      document.getElementById('helpModal').hidden = true;
    });
  }

  async function promptChallenge_(type) {
    if (type === 'teach_friend') {
      return openTeachModal_();
    }
    const labels = window.PROMPTS.upperTierActions[type] || { label: '', placeholder: '' };
    const txt = prompt(`${labels.icon} ${labels.label}：内容を書いてね`, labels.placeholder);
    if (!txt) return;
    const data = {
      student_id: state.studentId,
      unit_id: state.selectedUnitId,
      type: type,
      content: txt,
      created_at: new Date().toISOString()
    };
    try {
      await window.CloudSync.push('challenges', 'insert', data);
      toast(`${labels.label} を きろくしたよ！`, 'success');
    } catch (err) {
      toast('あとでつながったら同期するね', 'info');
    }
  }

  // 「教えに行く」モーダル
  function openTeachModal_() {
    const grid = document.getElementById('teachTargetGrid');
    grid.innerHTML = '';
    let selectedNum = null;
    NUMBERS.forEach(n => {
      if (n === state.studentNumber) return;  // 自分以外
      const btn = document.createElement('button');
      btn.textContent = n;
      btn.dataset.number = n;
      btn.addEventListener('click', () => {
        grid.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedNum = n;
      });
      grid.appendChild(btn);
    });
    document.getElementById('teachContent').value = '';
    document.getElementById('teachModal').hidden = false;

    document.getElementById('teachSubmitBtn').onclick = async () => {
      if (!selectedNum) { toast('だれに教えたかえらんでね', 'error'); return; }
      const content = document.getElementById('teachContent').value.trim();
      const targetId = `todasho-2026-5-4-${String(selectedNum).padStart(2, '0')}`;
      const data = {
        student_id: state.studentId,
        unit_id: state.selectedUnitId,
        type: 'teach_friend',
        content: content || `No.${selectedNum} に教えた`,
        target_student_id: targetId,
        created_at: new Date().toISOString()
      };
      try {
        await window.CloudSync.push('challenges', 'insert', data);
        toast('教えてくれてありがとう！', 'success');
      } catch (err) {
        toast('あとでつながったら同期するね', 'info');
      }
      document.getElementById('teachModal').hidden = true;
    };
  }

  // ----------------------------------------------------------------
  // 進度サマリ表示
  // ----------------------------------------------------------------
  function renderProgressSummary_() {
    const u = getCurrentUnit_();
    if (!u) return;
    const total = u.items.length;
    let a = 0, b = 0, c = 0;
    u.items.forEach(it => {
      const latest = state.progressCache[`${u.unit_id}|${it.item_id}`];
      if (latest) {
        if (latest.status === 'A') a++;
        else if (latest.status === 'B') b++;
        else if (latest.status === 'C') c++;
      }
    });
    document.getElementById('progressSummary').textContent = `◎${a} ○${b} △${c}`;
    const done = a + b + c;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    document.getElementById('progressBarFill').style.width = pct + '%';
  }

  // ----------------------------------------------------------------
  // 進度のプル
  // ----------------------------------------------------------------
  async function pullProgressForCurrentUnit_() {
    if (!window.CloudSync || !state.studentId) return;
    try {
      const result = await window.CloudSync.pull('progress', { student_id: state.studentId });
      if (result.ok && Array.isArray(result.data)) {
        const filtered = result.data.filter(r => r.unit_id === state.selectedUnitId);
        // 最新だけ抽出
        const map = {};
        filtered.forEach(r => {
          const key = `${r.unit_id}|${r.item_id}`;
          if (!map[key] || (r.edited_at || '') > (map[key].edited_at || '')) {
            map[key] = r;
          }
        });
        state.progressCache = Object.assign({}, state.progressCache, map);
        renderManualItemList_();
        renderProgressSummary_();
        setSyncBadge_('ok');
      }
    } catch (err) {
      console.warn('pull error', err);
      setSyncBadge_('error');
    }
  }

  function setSyncBadge_(status) {
    const badge = document.getElementById('syncBadge');
    badge.classList.remove('error', 'pending');
    if (status === 'ok') {
      badge.textContent = '☁';
    } else if (status === 'pending') {
      badge.classList.add('pending');
      badge.textContent = '↻';
    } else if (status === 'error') {
      badge.classList.add('error');
      badge.textContent = '⚠';
    }
  }

  // ----------------------------------------------------------------
  // btn-grp 汎用初期化
  // ----------------------------------------------------------------
  function initBtnGrps_() {
    document.querySelectorAll('.btn-grp[data-target]').forEach(grp => {
      const targetId = grp.dataset.target;
      grp.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        // 単選トグル
        grp.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(targetId);
        if (target) target.value = btn.dataset.value;
        // 特殊な反応
        if (targetId === 'manualLevel') {
          state.manualLevel = btn.dataset.value;
          saveState_();
          renderManualItemList_();
        }
      });
    });
  }

  // ----------------------------------------------------------------
  // ユーティリティ
  // ----------------------------------------------------------------
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 2200);
  }

  function escapeHtml_(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  // 公開（デバッグ用）
  window.SansuuApp = { state, getCurrentUnit_, refreshUnitView_, pullProgressForCurrentUnit_ };
})();
