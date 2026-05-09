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
  const STORAGE_KEY = 'sansuuApp_v2';   // v2: 樋口式進度表
  const DEVICE_ID = ensureDeviceId_();
  const CLASS_ID = '5-4-2026';
  const NUMBERS = Array.from({ length: 28 }, (_, i) => i + 1);

  // status コード ⇄ 表示マッピング
  const STATUS_CODE = { x: '×', tri: '△', circ: '○', dbl: '◎' };
  const STATUS_RANK = { x: 0, tri: 1, circ: 2, dbl: 3 };

  const state = {
    studentNumber: null,
    studentId: null,
    units: [],                     // window.UNIT_MASTER.units (v2)
    steps: [],                     // window.UNIT_MASTER.steps (6ステップ)
    statusLevels: [],              // window.UNIT_MASTER.status_levels (4段階)
    selectedUnitId: null,
    progressCache: {},             // { '${pageId}|step${num}': { status, edited_at, ... } }
    currentTab: 'manual',
    cardLearning: { pageId: null, idx: 0, cards: [] },
    pendingPicker: null,           // {pageId, stepNum} 進度表でクリック中の対象
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
    if (window.UNIT_MASTER) {
      state.units = window.UNIT_MASTER.units || [];
      state.steps = window.UNIT_MASTER.steps || [];
      state.statusLevels = window.UNIT_MASTER.status_levels || [];
      if (!state.selectedUnitId && state.units.length > 0) {
        state.selectedUnitId = state.units[0].unit_id;
      }
      // 教師側 overrides があれば適用
      try {
        const overrides = JSON.parse(localStorage.getItem('sansuuApp_unitOverrides') || '{}');
        if (overrides.units) state.units = overrides.units;
      } catch {}
      return;
    }
    console.error('window.UNIT_MASTER が読み込まれていません。data/unit_master.js を確認してください。');
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
    renderProgressTable_();
    renderProgressSummary_();
    renderDayCards_();
    renderReflectItemSelect_();
  }

  // ----------------------------------------------------------------
  // 進度表（樋口式 学習計画表）
  // ----------------------------------------------------------------
  function renderProgressTable_() {
    const u = getCurrentUnit_();
    if (!u || !u.pages) return;
    const head = document.getElementById('progressTableHead');
    const body = document.getElementById('progressTableBody');
    if (!head || !body) return;

    // ヘッダ
    let h = '<tr><th class="col-page">ページ・問題</th>';
    state.steps.forEach(s => {
      h += `<th class="col-step" title="${escapeHtml_(s.label)}">${s.icon}<br><span style="font-size:10px;">${escapeHtml_(s.short)}</span></th>`;
    });
    h += '<th class="col-cards">カード</th></tr>';
    head.innerHTML = h;

    // 各ページ行
    body.innerHTML = '';
    u.pages.forEach(p => {
      const tr = document.createElement('tr');
      tr.className = 'level-' + (p.level || 'basic') + (p.teacher_check ? ' teacher-check' : '');

      // ページラベル
      const labelTd = document.createElement('td');
      labelTd.className = 'cell-page-label';
      labelTd.innerHTML = `${escapeHtml_(p.label)}<span class="page-no">${escapeHtml_(p.page || '')}</span>`;
      tr.appendChild(labelTd);

      // 各ステップのセル
      state.steps.forEach(s => {
        const td = document.createElement('td');
        const key = `${p.page_id}|step${s.num}`;
        const rec = state.progressCache[key];
        const statusCode = rec && rec.status ? rec.status : '';
        td.className = 'cell-step ' + (statusCode ? 'status-' + statusCode : 'empty');
        td.textContent = STATUS_CODE[statusCode] || '・';
        td.dataset.pageId = p.page_id;
        td.dataset.stepNum = s.num;
        td.addEventListener('click', () => openStatusPicker_(p, s, statusCode));
        tr.appendChild(td);
      });

      // カードボタン
      const cardTd = document.createElement('td');
      cardTd.className = 'cell-cards';
      const hasCards = (p.cards || []).length > 0;
      cardTd.innerHTML = `<button class="${hasCards ? '' : 'no-cards'}" ${hasCards ? '' : 'disabled'}>📇 ${(p.cards || []).length}枚</button>`;
      if (hasCards) {
        cardTd.querySelector('button').addEventListener('click', () => openCardLearning_(p));
      }
      tr.appendChild(cardTd);

      body.appendChild(tr);
    });
  }

  function statusToMark_(s) {
    return STATUS_CODE[s] || '・';
  }

  // ----------------------------------------------------------------
  // 4段階評価ピッカー（樋口式 ×→△→○→◎）
  // ----------------------------------------------------------------
  function openStatusPicker_(page, step, currentCode) {
    state.pendingPicker = { pageId: page.page_id, stepNum: step.num };
    document.getElementById('statusPickerTitle').textContent =
      `${page.label} — ${step.label}`;
    document.getElementById('statusPickerContext').textContent =
      `${step.icon} ${step.desc}`;
    const grid = document.getElementById('statusPickerGrid');
    grid.innerHTML = '';
    state.statusLevels.forEach(lv => {
      const btn = document.createElement('button');
      btn.className = 'status-pick-btn';
      btn.dataset.pick = lv.code;
      btn.innerHTML = `<span class="pick-icon">${lv.icon}</span><span class="pick-label">${lv.label}</span>`;
      if (lv.code === currentCode) btn.style.background = '#FFFBE6';
      btn.addEventListener('click', () => {
        recordStepStatus_(page.page_id, step.num, lv.code);
        document.getElementById('statusPickerModal').hidden = true;
      });
      grid.appendChild(btn);
    });
    // クリアボタン
    const clearBtn = document.createElement('button');
    clearBtn.className = 'status-pick-btn clear-btn';
    clearBtn.innerHTML = '・ まだ取り組んでいない';
    clearBtn.addEventListener('click', () => {
      clearStepStatus_(page.page_id, step.num);
      document.getElementById('statusPickerModal').hidden = true;
    });
    grid.appendChild(clearBtn);
    document.getElementById('statusPickerModal').hidden = false;
  }

  async function recordStepStatus_(pageId, stepNum, code) {
    const u = getCurrentUnit_();
    if (!u) return;
    const ts = new Date().toISOString();
    const data = {
      student_id: state.studentId,
      unit_id: u.unit_id,
      item_id: `${pageId}-step${stepNum}`,
      status: code,
      reason: null,
      next_strategy: null,
      reason_tags: [],
      strategy_tag: null,
      device_id: DEVICE_ID,
      created_at: ts,
      edited_at: ts
    };
    state.progressCache[`${pageId}|step${stepNum}`] = data;
    renderProgressTable_();
    renderProgressSummary_();
    try {
      const result = await window.CloudSync.push('progress', 'insert', data);
      if (result.ok) toast(`${STATUS_CODE[code]} を記録`, 'success');
      else toast('オフライン：あとで同期', 'info');
    } catch (err) {
      console.warn('recordStepStatus failed', err);
    }
  }

  function clearStepStatus_(pageId, stepNum) {
    delete state.progressCache[`${pageId}|step${stepNum}`];
    renderProgressTable_();
    renderProgressSummary_();
    toast('クリアしました（教師端末で再同期で復活します）', 'info');
  }

  // 閉じる
  document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('statusPickerCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', () => {
      document.getElementById('statusPickerModal').hidden = true;
    });
  });

  // ----------------------------------------------------------------
  // カード学習モード（1問1カード）
  // ----------------------------------------------------------------
  function openCardLearning_(page) {
    if (!page.cards || page.cards.length === 0) {
      toast('このページにはまだカードがありません', 'info');
      return;
    }
    state.cardLearning = { pageId: page.page_id, idx: 0, cards: page.cards };
    document.getElementById('cardLearningTitle').textContent = `📇 ${page.label}`;
    showCard_(0);
    document.getElementById('cardLearningModal').hidden = false;
  }

  function showCard_(idx) {
    const cards = state.cardLearning.cards;
    if (idx < 0 || idx >= cards.length) return;
    state.cardLearning.idx = idx;
    const card = cards[idx];
    document.getElementById('cardProgress').textContent = `${idx + 1} / ${cards.length}`;
    document.getElementById('cardQuestion').textContent = card.q;
    document.getElementById('cardAnswer').textContent = card.a;
    document.getElementById('cardHint').textContent = card.hint ? '💡 ' + card.hint : '';
    document.getElementById('cardFront').hidden = false;
    document.getElementById('cardBack').hidden = true;
    document.getElementById('cardPrevBtn').disabled = idx === 0;
    document.getElementById('cardNextBtn').disabled = idx === cards.length - 1;

    // セルフチェック評価
    const grid = document.getElementById('cardStatusGrid');
    grid.innerHTML = '';
    state.statusLevels.forEach(lv => {
      const btn = document.createElement('button');
      btn.className = 'status-pick-btn';
      btn.dataset.pick = lv.code;
      btn.innerHTML = `<span class="pick-icon">${lv.icon}</span><span class="pick-label">${lv.label}</span>`;
      btn.addEventListener('click', async () => {
        // ステップ3（問題解決）に評価を記録
        await recordStepStatus_(state.cardLearning.pageId, 3, lv.code);
        if (idx < cards.length - 1) showCard_(idx + 1);
        else {
          toast('全カード完了！', 'success');
          document.getElementById('cardLearningModal').hidden = true;
        }
      });
      grid.appendChild(btn);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const flip = document.getElementById('cardFlipBtn');
    const close = document.getElementById('cardLearningCloseBtn');
    const prev = document.getElementById('cardPrevBtn');
    const next = document.getElementById('cardNextBtn');
    if (flip) flip.addEventListener('click', () => {
      document.getElementById('cardFront').hidden = true;
      document.getElementById('cardBack').hidden = false;
    });
    if (close) close.addEventListener('click', () => {
      document.getElementById('cardLearningModal').hidden = true;
    });
    if (prev) prev.addEventListener('click', () => showCard_(state.cardLearning.idx - 1));
    if (next) next.addEventListener('click', () => showCard_(state.cardLearning.idx + 1));
  });

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

  }

  function renderReflectItemSelect_() {
    const sel = document.getElementById('reflectItem');
    if (!sel) return;
    const u = getCurrentUnit_();
    if (!u || !u.pages) return;
    sel.innerHTML = '';
    u.pages.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.page_id;
      opt.textContent = `${p.label}（${p.page || ''}）`;
      sel.appendChild(opt);
    });
    if (state.reflectForm.itemId) sel.value = state.reflectForm.itemId;
  }

  async function submitReflect_() {
    const pageId = document.getElementById('reflectItem').value;
    const status = document.getElementById('reflectStatus').value;
    if (!pageId || !status) {
      toast('ページと できぐあい を選んでね', 'error');
      return;
    }
    // 振り返りはステップ⑥（振り返り）の評価＋原因＋作戦として記録
    const stepNum = 6;
    const ts = new Date().toISOString();
    const data = {
      student_id: state.studentId,
      unit_id: state.selectedUnitId,
      item_id: `${pageId}-step${stepNum}`,
      status: status,
      reason_tags: Array.from(state.reflectForm.reasonTags),
      reason: state.reflectForm.reasonFree || null,
      strategy_tag: document.getElementById('reflectStrategy').value || null,
      next_strategy: state.reflectForm.strategyFree || null,
      device_id: DEVICE_ID,
      created_at: ts,
      edited_at: ts
    };

    state.progressCache[`${pageId}|step${stepNum}`] = data;
    renderProgressTable_();
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
    if (!u || !u.pages) return;
    const total = u.pages.length * state.steps.length;
    let cnt = { x: 0, tri: 0, circ: 0, dbl: 0 };
    u.pages.forEach(p => {
      state.steps.forEach(s => {
        const rec = state.progressCache[`${p.page_id}|step${s.num}`];
        if (rec && cnt[rec.status] !== undefined) cnt[rec.status]++;
      });
    });
    document.getElementById('progressSummary').textContent =
      `◎${cnt.dbl} ○${cnt.circ} △${cnt.tri} ×${cnt.x}`;
    const done = cnt.tri + cnt.circ + cnt.dbl;
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
        // item_id = `${pageId}-step${num}` 形式 → progressCache キー `${pageId}|step${num}`
        const map = {};
        filtered.forEach(r => {
          const m = (r.item_id || '').match(/^(.+)-step(\d+)$/);
          if (!m) return;
          const cacheKey = `${m[1]}|step${m[2]}`;
          if (!map[cacheKey] || (r.edited_at || '') > (map[cacheKey].edited_at || '')) {
            map[cacheKey] = r;
          }
        });
        state.progressCache = Object.assign({}, state.progressCache, map);
        renderProgressTable_();
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
        // 旧 manualLevel タブは削除済（v2: 進度表ベースに移行）
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
