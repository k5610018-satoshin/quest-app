/* ============================================================
 * 算数 自由進度学習アプリ - 教師管理画面 v0.2
 * 機能: ヒートマップ / フィード / 座席表 / アラート / 到達度マトリクス
 * 依存: cloud-sync.js, idb-storage.js, data/unit_master.json
 * ============================================================ */
(() => {
  'use strict';

  const POLL_INTERVAL_MS = 10000;
  const NUMBERS = Array.from({ length: 28 }, (_, i) => i + 1);

  const state = {
    mode: 'live',                  // 'live' | 'after'
    view: 'heatmap',
    units: [],
    selectedUnitId: null,
    students: [],                  // [{number, student_id, name, ...}]
    progress: [],                  // 全 progress（最新のみ）
    feed: [],                      // 時系列、新着先頭
    interventions: [],
    challenges: [],
    alerts: [],
    selectedStudentId: null,
    pollTimer: null
  };

  // ----------------------------------------------------------------
  // Boot
  // ----------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', async () => {
    await loadUnits_();
    initRoster_();
    initHeader_();
    initSide_();
    initDetailPanel_();
    showView_('heatmap');
    startPolling_();
  });

  function initRoster_() {
    state.students = NUMBERS.map(n => ({
      number: n,
      student_id: `todasho-2026-5-4-${String(n).padStart(2, '0')}`,
      name: `No.${n}`
    }));
  }

  async function loadUnits_() {
    if (window.UNIT_MASTER && Array.isArray(window.UNIT_MASTER.units)) {
      state.units = window.UNIT_MASTER.units;
      // 教師側ローカル編集の上書きを適用
      try {
        const overrides = JSON.parse(localStorage.getItem('sansuuApp_unitOverrides') || '{}');
        if (overrides.units) state.units = overrides.units;
      } catch {}
      state.selectedUnitId = state.units[0] && state.units[0].unit_id;
      return;
    }
    try {
      const res = await fetch('data/unit_master.json', { cache: 'no-cache' });
      const d = await res.json();
      state.units = d.units || [];
      state.selectedUnitId = state.units[0] && state.units[0].unit_id;
    } catch (err) {
      console.error('loadUnits failed', err);
      toast('単元データの読み込みに失敗', 'error');
    }
  }

  function getCurrentUnit_() {
    return state.units.find(u => u.unit_id === state.selectedUnitId);
  }

  // ----------------------------------------------------------------
  // ヘッダ初期化
  // ----------------------------------------------------------------
  function initHeader_() {
    const sel = document.getElementById('tUnitSelect');
    state.units.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.unit_id;
      opt.textContent = `${u.order}. ${u.name}`;
      sel.appendChild(opt);
    });
    sel.value = state.selectedUnitId;
    sel.addEventListener('change', e => {
      state.selectedUnitId = e.target.value;
      refreshAll_();
    });

    // モードトグル
    document.querySelector('.mode-toggle').addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const mode = btn.dataset.value;
      state.mode = mode;
      document.querySelectorAll('.mode-toggle button').forEach(b => {
        b.classList.toggle('active', b.dataset.value === mode);
      });
      document.querySelectorAll('.side-group').forEach(g => {
        g.hidden = g.dataset.mode !== mode;
      });
      // モードに応じてデフォルトビュー
      const defaultView = mode === 'live' ? 'heatmap' : 'matrix';
      showView_(defaultView);
    });

    document.getElementById('tRefreshBtn').addEventListener('click', refreshAll_);
  }

  function initSide_() {
    document.querySelector('.t-side').addEventListener('click', e => {
      const btn = e.target.closest('.side-btn');
      if (!btn) return;
      showView_(btn.dataset.view);
    });
  }

  function showView_(view) {
    state.view = view;
    document.querySelectorAll('.side-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    refreshView_();
  }

  // ----------------------------------------------------------------
  // データ取得（10秒ポーリング）
  // ----------------------------------------------------------------
  function startPolling_() {
    refreshAll_();
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => {
      if (state.mode === 'live') refreshAll_();
    }, POLL_INTERVAL_MS);
  }

  async function refreshAll_() {
    if (!window.CloudSync || !window.CloudSync.isConfigured()) {
      setSyncBadge_('not-configured');
      // ダミー描画（ローカルデモ用）
      state.progress = [];
      state.feed = [];
      state.alerts = [];
      refreshView_();
      return;
    }
    try {
      const unitId = state.selectedUnitId;
      const [heatRes, alertRes, feedRes, interRes, chalRes] = await Promise.all([
        window.CloudSync.pull('heatmap', { unit_id: unitId }),
        window.CloudSync.pull('alerts', {}),
        window.CloudSync.pull('progress', {}),
        window.CloudSync.pull('interventions', {}),
        window.CloudSync.pull('challenges', {})
      ]);
      if (heatRes.ok) state.progress = heatRes.data || [];
      if (alertRes.ok) state.alerts = alertRes.data || [];
      if (interRes.ok) state.interventions = interRes.data || [];
      if (chalRes.ok) state.challenges = chalRes.data || [];
      if (feedRes.ok) {
        // フィードは progress + interventions(help_received) + challenges を統合し時系列に
        const feedItems = [];
        (feedRes.data || []).forEach(r => feedItems.push({ ...r, _kind: 'progress', _ts: r.edited_at }));
        (interRes.data || []).filter(r => r.kind === 'help_received').forEach(r =>
          feedItems.push({ ...r, _kind: 'help_received', _ts: r.created_at })
        );
        (chalRes.data || []).forEach(r =>
          feedItems.push({ ...r, _kind: r.type, _ts: r.created_at })
        );
        state.feed = feedItems
          .sort((a, b) => (b._ts || '').localeCompare(a._ts || ''))
          .slice(0, 50);
      }
      setSyncBadge_('ok');
      updateAlertBadge_();
      updateProgressCounter_();
      refreshView_();
    } catch (err) {
      console.warn('refreshAll error', err);
      setSyncBadge_('error');
    }
  }

  function setSyncBadge_(status) {
    const b = document.getElementById('tSyncBadge');
    b.classList.remove('error', 'pending');
    if (status === 'ok') b.textContent = '☁';
    else if (status === 'error') { b.textContent = '⚠'; b.classList.add('error'); }
    else if (status === 'not-configured') { b.textContent = '⚙'; b.classList.add('error'); }
  }

  function updateAlertBadge_() {
    const el = document.getElementById('alertBadge');
    const cnt = document.getElementById('alertCount');
    if (state.alerts && state.alerts.length > 0) {
      el.hidden = false;
      cnt.textContent = state.alerts.length;
    } else {
      el.hidden = true;
    }
  }

  function updateProgressCounter_() {
    const u = getCurrentUnit_();
    const total = u ? state.students.length * u.items.length : 0;
    let a = 0, b = 0, c = 0;
    state.progress.forEach(r => {
      if (r.unit_id !== state.selectedUnitId) return;
      if (r.status === 'A') a++;
      else if (r.status === 'B') b++;
      else if (r.status === 'C') c++;
    });
    document.getElementById('tProgressCounter').textContent = `◎${a} ○${b} △${c} / ${total}`;
  }

  // ----------------------------------------------------------------
  // ビュー描画
  // ----------------------------------------------------------------
  function refreshView_() {
    const main = document.getElementById('tMain');
    main.innerHTML = '';
    switch (state.view) {
      case 'heatmap': renderHeatmap_(main); break;
      case 'feed': renderFeed_(main); break;
      case 'seat': renderSeat_(main); break;
      case 'alerts': renderAlerts_(main); break;
      case 'matrix': renderMatrix_(main); break;
      case 'growth': renderGrowth_(main); break;
      case 'supplement': renderSupplement_(main); break;
      case 'export': renderExport_(main); break;
      case 'unit_editor': renderUnitEditor_(main); break;
      default: main.innerHTML = '<p>未実装ビュー</p>';
    }
  }

  // ----------------------------------------------------------------
  // ステータス選択ポップオーバー（セルクリック編集用）
  // ----------------------------------------------------------------
  let _statusPickerCtx = null;

  function openStatusPicker_(targetEl, studentId, itemId, currentStatus) {
    _statusPickerCtx = { targetEl, studentId, itemId, currentStatus };
    const picker = document.getElementById('statusPicker');
    const rect = targetEl.getBoundingClientRect();
    picker.style.top = (rect.bottom + 4) + 'px';
    picker.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';
    picker.hidden = false;
  }

  function closeStatusPicker_() {
    document.getElementById('statusPicker').hidden = true;
    _statusPickerCtx = null;
  }

  document.addEventListener('click', e => {
    const picker = document.getElementById('statusPicker');
    if (!picker || picker.hidden) return;
    const btn = e.target.closest('.status-picker button');
    if (btn) {
      const pick = btn.dataset.pick;
      if (pick === 'cancel') return closeStatusPicker_();
      if (_statusPickerCtx) {
        const { studentId, itemId, currentStatus } = _statusPickerCtx;
        applyTeacherStatusEdit_(studentId, itemId, pick === '' ? null : pick);
      }
      closeStatusPicker_();
      return;
    }
    // ピッカー外クリックで閉じる
    if (!e.target.closest('.heatmap-cell') && !e.target.closest('.matrix-cell')) {
      closeStatusPicker_();
    }
  });

  async function applyTeacherStatusEdit_(studentId, itemId, status) {
    const ts = new Date().toISOString();
    if (status === null) {
      // 削除：state からだけ消す（DB上は残す）
      state.progress = state.progress.filter(r =>
        !(r.student_id === studentId && r.unit_id === state.selectedUnitId && r.item_id === itemId)
      );
      refreshView_();
      toast('セルをクリア（教師端末のみ）', 'info');
      return;
    }
    const data = {
      student_id: studentId,
      unit_id: state.selectedUnitId,
      item_id: itemId,
      status: status,
      reason: '教師による訂正',
      next_strategy: null,
      reason_tags: [],
      strategy_tag: null,
      device_id: 'teacher-edit',
      created_at: ts,
      edited_at: ts
    };
    // ローカル即時反映
    const key = `${studentId}|${itemId}`;
    state.progress = state.progress.filter(r =>
      !(r.student_id === studentId && r.unit_id === state.selectedUnitId && r.item_id === itemId)
    );
    state.progress.push(data);
    refreshView_();
    // バックエンドへ
    try {
      const result = await window.CloudSync.push('progress', 'insert', data);
      if (result.ok) {
        toast(`No.${parseInt(studentId.split('-').pop(),10)} ${itemId} を ${statusMark_(status)} に訂正`, 'success');
      } else {
        toast('オフライン：あとで同期', 'info');
      }
    } catch (err) {
      console.warn('teacher edit push failed', err);
    }
  }

  // ----------------------------------------------------------------
  // 単元編集ビュー
  // ----------------------------------------------------------------
  function renderUnitEditor_(root) {
    const wrap = document.createElement('div');
    wrap.className = 'unit-editor';
    wrap.innerHTML = `
      <h2 style="color:#1F4E8B;margin-bottom:8px;">📚 単元編集</h2>
      <p style="color:#666;font-size:14px;margin-bottom:16px;">
        単元の項目（学習の手引き）を編集できます。変更は教師端末の localStorage に保存され、児童アプリは次回起動時から反映されます。<br>
        全員に配布したいときは [💾 unit_master.js をダウンロード] でファイル保存し、<code>data/unit_master.js</code> を置き換えてください。
      </p>
      <div class="unit-editor-header">
        <select id="unitEditSelect"></select>
        <button class="action-btn" id="unitAddNewBtn">＋ 新しい単元</button>
      </div>
      <div class="unit-editor-actions">
        <button id="unitSaveLocalBtn" class="primary">💾 教師端末に保存</button>
        <button id="unitDownloadJsBtn">⬇ unit_master.js をダウンロード</button>
        <button id="unitDownloadJsonBtn">⬇ unit_master.json をダウンロード</button>
        <button id="unitResetBtn" class="danger">↺ 元の状態に戻す</button>
      </div>
      <div id="unitEditBody"></div>
      <div class="unit-editor-status" id="unitEditStatus" hidden></div>
    `;
    root.appendChild(wrap);

    const sel = wrap.querySelector('#unitEditSelect');
    state.units.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.unit_id;
      opt.textContent = `${u.order || ''}. ${u.name}（${u.hours || '-'}時間）`;
      sel.appendChild(opt);
    });
    sel.value = state.selectedUnitId;
    sel.addEventListener('change', () => renderUnitEditBody_(sel.value));

    wrap.querySelector('#unitAddNewBtn').addEventListener('click', addNewUnit_);
    wrap.querySelector('#unitSaveLocalBtn').addEventListener('click', saveUnitOverridesLocal_);
    wrap.querySelector('#unitDownloadJsBtn').addEventListener('click', () => downloadUnitMaster_('js'));
    wrap.querySelector('#unitDownloadJsonBtn').addEventListener('click', () => downloadUnitMaster_('json'));
    wrap.querySelector('#unitResetBtn').addEventListener('click', resetUnitOverrides_);

    renderUnitEditBody_(sel.value);
  }

  function renderUnitEditBody_(unitId) {
    const body = document.getElementById('unitEditBody');
    const u = state.units.find(x => x.unit_id === unitId);
    if (!u) { body.innerHTML = '<p>単元が見つかりません</p>'; return; }
    body.innerHTML = `
      <div class="unit-fields">
        <label>単元名
          <input type="text" data-uf="name" value="${escapeAttr_(u.name)}">
        </label>
        <label>時数
          <input type="number" data-uf="hours" value="${u.hours || ''}">
        </label>
        <label>教科書ページ
          <input type="text" data-uf="textbook_pages" value="${escapeAttr_(u.textbook_pages || '')}">
        </label>
      </div>
      <table class="item-editor-table" id="itemEditTable">
        <thead>
          <tr>
            <th style="width:80px;">ID</th>
            <th>項目名</th>
            <th style="width:110px;">レベル</th>
            <th style="width:120px;">ページ</th>
            <th style="width:80px;">操作</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <button class="item-editor-add" id="addItemBtn">＋ 項目を追加</button>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button class="action-btn danger" id="deleteUnitBtn" style="background:white;color:#B00020;border-color:#FFB3B3;border:2px solid #FFB3B3;border-radius:6px;padding:8px 14px;font-size:13px;">🗑 この単元を削除</button>
      </div>
    `;
    renderItemRows_(u);

    body.querySelectorAll('[data-uf]').forEach(input => {
      input.addEventListener('input', e => {
        const k = input.dataset.uf;
        u[k] = k === 'hours' ? parseInt(input.value, 10) || 0 : input.value;
      });
    });
    body.querySelector('#addItemBtn').addEventListener('click', () => {
      u.items = u.items || [];
      const order = u.order || 99;
      const next = u.items.length + 1;
      u.items.push({
        item_id: `${String(order).padStart(2, '0')}-${next}`,
        label: '新しい項目',
        level: 'basic',
        page: ''
      });
      renderItemRows_(u);
    });
    body.querySelector('#deleteUnitBtn').addEventListener('click', () => {
      if (!confirm(`単元「${u.name}」を削除しますか？`)) return;
      state.units = state.units.filter(x => x.unit_id !== unitId);
      toast('削除しました（保存ボタンで確定）', 'info');
      // ビューを再描画
      const main = document.getElementById('tMain');
      main.innerHTML = '';
      renderUnitEditor_(main);
    });
  }

  function renderItemRows_(unit) {
    const tbody = document.querySelector('#itemEditTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    (unit.items || []).forEach((it, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" data-if="item_id" value="${escapeAttr_(it.item_id)}"></td>
        <td><input type="text" data-if="label" value="${escapeAttr_(it.label)}"></td>
        <td>
          <select data-if="level">
            <option value="basic"${it.level === 'basic' ? ' selected' : ''}>基本</option>
            <option value="applied"${it.level === 'applied' ? ' selected' : ''}>応用</option>
            <option value="challenge"${it.level === 'challenge' ? ' selected' : ''}>チャレンジ</option>
          </select>
        </td>
        <td><input type="text" data-if="page" value="${escapeAttr_(it.page || '')}"></td>
        <td class="row-actions">
          <button data-row-action="up">↑</button>
          <button data-row-action="down">↓</button>
          <button data-row-action="del">🗑</button>
        </td>
      `;
      tbody.appendChild(tr);
      tr.querySelectorAll('[data-if]').forEach(input => {
        input.addEventListener('input', e => {
          it[input.dataset.if] = input.value;
        });
      });
      tr.querySelectorAll('[data-row-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.rowAction;
          if (action === 'del') {
            unit.items.splice(idx, 1);
          } else if (action === 'up' && idx > 0) {
            [unit.items[idx - 1], unit.items[idx]] = [unit.items[idx], unit.items[idx - 1]];
          } else if (action === 'down' && idx < unit.items.length - 1) {
            [unit.items[idx + 1], unit.items[idx]] = [unit.items[idx], unit.items[idx + 1]];
          }
          renderItemRows_(unit);
        });
      });
    });
  }

  function addNewUnit_() {
    const id = prompt('新しい単元のIDを入力（例: sansuu-5-19-shuusei）：');
    if (!id) return;
    if (state.units.some(u => u.unit_id === id)) {
      alert('そのIDはすでに存在します');
      return;
    }
    const newUnit = {
      unit_id: id,
      order: state.units.length + 1,
      term: 3,
      name: '新しい単元',
      hours: 5,
      textbook_pages: '',
      items: []
    };
    state.units.push(newUnit);
    state.selectedUnitId = id;
    const main = document.getElementById('tMain');
    main.innerHTML = '';
    renderUnitEditor_(main);
  }

  function saveUnitOverridesLocal_() {
    const overrides = { units: state.units, saved_at: new Date().toISOString() };
    localStorage.setItem('sansuuApp_unitOverrides', JSON.stringify(overrides));
    showUnitEditStatus_(`✅ 教師端末に保存しました（${state.units.length} 単元）`);
  }

  function downloadUnitMaster_(format) {
    const base = window.UNIT_MASTER || { schema_version: '1.0', grade: 5, subject: 'sansuu' };
    const out = {
      ...base,
      generated_at: new Date().toISOString().slice(0, 10),
      units: state.units
    };
    let content, filename, mime;
    if (format === 'js') {
      content = '// Auto-generated; do not edit directly.\n' +
                '// Edit via teacher.html unit editor view.\n' +
                'window.UNIT_MASTER = ' + JSON.stringify(out, null, 2) + ';\n';
      filename = 'unit_master.js';
      mime = 'application/javascript';
    } else {
      content = JSON.stringify(out, null, 2);
      filename = 'unit_master.json';
      mime = 'application/json';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showUnitEditStatus_(`⬇ ${filename} をダウンロードしました。data/${filename} に置き換えてください。`);
  }

  function resetUnitOverrides_() {
    if (!confirm('編集をすべて破棄して元のデータに戻しますか？')) return;
    localStorage.removeItem('sansuuApp_unitOverrides');
    if (window.UNIT_MASTER && window.UNIT_MASTER.units) {
      // 深いコピーを再注入
      state.units = JSON.parse(JSON.stringify(window.UNIT_MASTER.units));
      state.selectedUnitId = state.units[0] && state.units[0].unit_id;
    }
    const main = document.getElementById('tMain');
    main.innerHTML = '';
    renderUnitEditor_(main);
    showUnitEditStatus_('↺ 元の状態に戻しました', 'warn');
  }

  function showUnitEditStatus_(msg, kind) {
    const el = document.getElementById('unitEditStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'unit-editor-status' + (kind === 'warn' ? ' warn' : '');
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 4000);
  }

  function escapeAttr_(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // === ヒートマップ ===
  function renderHeatmap_(root) {
    const u = getCurrentUnit_();
    if (!u) return;
    const items = u.items;
    const progressMap = buildProgressMap_();
    const alertSet = new Set(state.alerts.map(a => a.student_id));

    const legend = document.createElement('div');
    legend.className = 'heatmap-legend';
    legend.innerHTML = `
      <span><span class="legend-dot" style="background:#69C779"></span>◎ ばっちり</span>
      <span><span class="legend-dot" style="background:#FFD400"></span>○ できた</span>
      <span><span class="legend-dot" style="background:#FF6B6B"></span>△ もう一回</span>
      <span><span class="legend-dot" style="background:#EAEAEA"></span>未着手</span>
    `;
    root.appendChild(legend);

    const map = document.createElement('div');
    map.className = 'heatmap';

    // ヘッダ行
    const headRow = document.createElement('div');
    headRow.className = 'heatmap-row';
    const blank = document.createElement('div');
    blank.className = 'heatmap-cell head';
    blank.textContent = '児童';
    headRow.appendChild(blank);
    items.forEach(it => {
      const c = document.createElement('div');
      c.className = 'heatmap-cell head';
      c.textContent = it.item_id.split('-')[1] || it.item_id;
      c.title = it.label;
      headRow.appendChild(c);
    });
    map.appendChild(headRow);

    // 各児童
    state.students.forEach(s => {
      const row = document.createElement('div');
      row.className = 'heatmap-row';
      const numCell = document.createElement('div');
      numCell.className = 'heatmap-cell student-num';
      if (alertSet.has(s.student_id)) numCell.classList.add('has-alert');
      numCell.textContent = `No.${s.number}`;
      numCell.dataset.studentId = s.student_id;
      numCell.addEventListener('click', () => openDetail_(s.student_id));
      row.appendChild(numCell);
      items.forEach(it => {
        const cell = document.createElement('div');
        const key = `${s.student_id}|${it.item_id}`;
        const r = progressMap[key];
        cell.className = 'heatmap-cell ' + (r ? 'status-' + r.status : 'status-empty');
        cell.textContent = r ? statusMark_(r.status) : '・';
        cell.title = `${it.label}\nクリック=訂正、Shift+クリック=詳細`;
        cell.addEventListener('click', e => {
          if (e.shiftKey) {
            openDetail_(s.student_id, it.item_id);
          } else {
            openStatusPicker_(cell, s.student_id, it.item_id, r ? r.status : null);
          }
        });
        row.appendChild(cell);
      });
      map.appendChild(row);
    });
    root.appendChild(map);
  }

  function buildProgressMap_() {
    const map = {};
    state.progress.forEach(r => {
      if (r.unit_id !== state.selectedUnitId) return;
      const key = `${r.student_id}|${r.item_id}`;
      if (!map[key] || (r.edited_at || '') > (map[key].edited_at || '')) {
        map[key] = r;
      }
    });
    return map;
  }

  function statusMark_(s) { return { A: '◎', B: '○', C: '△' }[s] || '・'; }

  // === フィード ===
  function renderFeed_(root) {
    const wrap = document.createElement('div');
    wrap.className = 'feed';
    const numToStudent = {};
    state.students.forEach(s => { numToStudent[s.student_id] = s; });
    if (!state.feed || state.feed.length === 0) {
      wrap.innerHTML = '<p style="text-align:center;color:#888;padding:32px;">まだ記録がありません。児童が振り返りを記録すると新着順に表示されます。</p>';
    }
    state.feed.forEach(r => {
      const s = numToStudent[r.student_id] || { number: '?' };
      const item = document.createElement('div');
      const time = r._ts ? formatTime_(r._ts) : '';
      let cls = 'feed-item';
      let mainText = '';
      let mark = '・';
      if (r._kind === 'progress') {
        cls += ' status-' + (r.status || 'empty');
        const reason = r.reason || (r.reason_tags ? toReasonString_(r.reason_tags) : '');
        const next = r.next_strategy || r.strategy_tag || '';
        mainText = `<span class="student-no">No.${s.number}</span>${escapeHtml_(getItemLabel_(r.unit_id, r.item_id))}` +
                   (reason ? `<br><small>${escapeHtml_(reason)}</small>` : '') +
                   (next ? `<br><small>→ ${escapeHtml_(next)}</small>` : '');
        mark = statusMark_(r.status);
      } else if (r._kind === 'help_received') {
        cls += ' kind-help_received';
        mainText = `<span class="student-no">No.${s.number}</span>🙋 先生にヘルプ要請`;
        mark = '🙋';
      } else if (r._kind === 'self_problem') {
        cls += ' kind-self_problem';
        mainText = `<span class="student-no">No.${s.number}</span>★ 自作問題：${escapeHtml_((r.content || '').substring(0, 40))}`;
        mark = '★';
      } else if (r._kind === 'strategy_text') {
        cls += ' kind-self_problem';
        mainText = `<span class="student-no">No.${s.number}</span>✏ 攻略文：${escapeHtml_((r.content || '').substring(0, 40))}`;
        mark = '✏';
      } else if (r._kind === 'teach_friend') {
        cls += ' kind-teach_friend';
        const target = r.target_student_id ? r.target_student_id.split('-').pop() : '?';
        mainText = `<span class="student-no">No.${s.number}</span>👫 No.${parseInt(target, 10)} に教えた`;
        mark = '👫';
      }
      item.className = cls;
      item.innerHTML = `
        <span class="feed-time">${time}</span>
        <span class="feed-content">${mainText}</span>
        <span class="feed-status">${mark}</span>
      `;
      item.addEventListener('click', () => openDetail_(r.student_id, r.item_id));
      wrap.appendChild(item);
    });
    root.appendChild(wrap);
  }

  function toReasonString_(tags) {
    try {
      const arr = typeof tags === 'string' ? JSON.parse(tags) : tags;
      return Array.isArray(arr) ? arr.join('・') : '';
    } catch { return ''; }
  }

  function getItemLabel_(unitId, itemId) {
    const u = state.units.find(x => x.unit_id === unitId);
    if (!u) return itemId;
    const it = u.items.find(x => x.item_id === itemId);
    return it ? it.label : itemId;
  }

  function formatTime_(iso) {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // === 座席表 ===
  function renderSeat_(root) {
    const grid = document.createElement('div');
    grid.className = 'seat-grid';
    grid.innerHTML = '<div class="blackboard">[ 黒板 ]</div>';
    const progressMap = buildProgressMap_();
    const alertSet = new Set(state.alerts.map(a => a.student_id));
    state.students.forEach(s => {
      // 単元の中の最新記録を1つ取る（児童ごと最新ステータス）
      const recent = state.progress
        .filter(r => r.student_id === s.student_id && r.unit_id === state.selectedUnitId)
        .sort((a, b) => (b.edited_at || '').localeCompare(a.edited_at || ''))[0];
      const cell = document.createElement('div');
      const status = recent ? recent.status : '';
      cell.className = 'seat-cell' + (status ? ' status-' + status : '');
      if (alertSet.has(s.student_id)) cell.classList.add('has-alert');
      cell.innerHTML = `
        <div class="seat-num">No.${s.number}</div>
        <div class="seat-status">${recent ? statusMark_(recent.status) : '・'}</div>
      `;
      cell.addEventListener('click', () => openDetail_(s.student_id));
      grid.appendChild(cell);
    });
    root.appendChild(grid);
  }

  // === アラート ===
  function renderAlerts_(root) {
    const list = document.createElement('div');
    list.className = 'alert-list';
    if (state.alerts.length === 0) {
      list.innerHTML = '<p style="text-align:center;color:#888;padding:32px;">アラートはありません。</p>';
    }
    state.alerts.forEach(a => {
      const num = parseInt(a.student_id.split('-').pop(), 10);
      const row = document.createElement('div');
      row.className = 'alert-row';
      row.innerHTML = `
        <span class="student-no">No.${num}</span>
        <span class="alert-msg">直近で △ が ${a.recent_c_count} 連続</span>
        <span class="alert-time">${a.last_edited ? formatTime_(a.last_edited) : ''}</span>
      `;
      row.addEventListener('click', () => openDetail_(a.student_id));
      list.appendChild(row);
    });
    root.appendChild(list);
  }

  // === マトリクス（放課後）===
  function renderMatrix_(root) {
    const u = getCurrentUnit_();
    if (!u) return;
    const items = u.items;
    const progressMap = buildProgressMap_();

    const exportBar = document.createElement('div');
    exportBar.className = 'matrix-export';
    exportBar.innerHTML = `
      <button id="exportCsvBtn">📊 CSVダウンロード</button>
      <button id="exportJsonBtn">📤 evidence JSON</button>
      <button id="exportDocxBtn">📝 大計画シート(.docx)</button>
    `;
    root.appendChild(exportBar);
    exportBar.querySelector('#exportCsvBtn').addEventListener('click', () => downloadMatrixCsv_(u, items, progressMap));
    exportBar.querySelector('#exportJsonBtn').addEventListener('click', () => downloadEvidenceJson_(u, items, progressMap));
    exportBar.querySelector('#exportDocxBtn').addEventListener('click', () => alert('python C:/Users/K5610/scripts/sansuu_app_export_daikeikaku.py --unit ' + u.unit_id + ' を実行してください'));

    const table = document.createElement('table');
    table.className = 'matrix-table';
    let html = '<thead><tr><th>児童</th>';
    items.forEach(it => { html += `<th title="${escapeHtml_(it.label)}">${it.item_id.split('-')[1]}</th>`; });
    html += '<th>◎</th><th>○</th><th>△</th></tr></thead><tbody>';
    state.students.forEach(s => {
      let a = 0, b = 0, c = 0;
      let row = `<tr><td><b>No.${s.number}</b></td>`;
      items.forEach(it => {
        const r = progressMap[`${s.student_id}|${it.item_id}`];
        const cellAttrs = `data-student="${s.student_id}" data-item="${it.item_id}" data-status="${r ? r.status : ''}" title="クリックで訂正"`;
        if (r) {
          row += `<td class="matrix-cell ${r.status}" ${cellAttrs}>${statusMark_(r.status)}</td>`;
          if (r.status === 'A') a++; else if (r.status === 'B') b++; else if (r.status === 'C') c++;
        } else {
          row += `<td class="matrix-cell empty" ${cellAttrs}>・</td>`;
        }
      });
      row += `<td>${a}</td><td>${b}</td><td>${c}</td></tr>`;
      html += row;
    });
    // 集計行
    html += '<tr>';
    html += '<td class="summary-row">合計</td>';
    items.forEach(it => {
      let A = 0, B = 0, C = 0;
      state.students.forEach(s => {
        const r = progressMap[`${s.student_id}|${it.item_id}`];
        if (r) { if (r.status === 'A') A++; else if (r.status === 'B') B++; else if (r.status === 'C') C++; }
      });
      const cls = (C > state.students.length / 2) ? 'summary-row alert' : 'summary-row';
      html += `<td class="${cls}" title="◎${A} ○${B} △${C}">△${C}</td>`;
    });
    html += '<td class="summary-row" colspan="3"></td></tr>';
    html += '</tbody>';
    table.innerHTML = html;
    root.appendChild(table);

    // マトリクスセル編集
    table.querySelectorAll('td.matrix-cell[data-student]').forEach(td => {
      td.style.cursor = 'pointer';
      td.addEventListener('click', () => {
        openStatusPicker_(td, td.dataset.student, td.dataset.item, td.dataset.status || null);
      });
    });
  }

  function downloadMatrixCsv_(unit, items, progressMap) {
    const rows = [['児童', ...items.map(it => it.label), '◎', '○', '△']];
    state.students.forEach(s => {
      let a = 0, b = 0, c = 0;
      const cells = items.map(it => {
        const r = progressMap[`${s.student_id}|${it.item_id}`];
        if (r) { if (r.status === 'A') a++; else if (r.status === 'B') b++; else if (r.status === 'C') c++; return r.status; }
        return '';
      });
      rows.push([`No.${s.number}`, ...cells, a, b, c]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sansuu-matrix-${unit.unit_id}-${dateStamp_()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadEvidenceJson_(unit, items, progressMap) {
    const evidence = {
      subject: 'sansuu',
      grade: 5,
      unit_id: unit.unit_id,
      unit_name: unit.name,
      generated_at: new Date().toISOString(),
      students: state.students.map(s => {
        const detail = items.map(it => {
          const r = progressMap[`${s.student_id}|${it.item_id}`];
          return { item_id: it.item_id, status: r ? r.status : null };
        });
        const sm = { A: 0, B: 0, C: 0, total: 0 };
        detail.forEach(d => { if (d.status) { sm[d.status]++; sm.total++; } });
        return { student_id: s.student_id, items: detail, summary: sm };
      })
    };
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sansuu-evidence-${unit.unit_id}-${dateStamp_()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function dateStamp_() {
    const d = new Date();
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }

  // === 伸びカード（簡易）===
  function renderGrowth_(root) {
    const u = getCurrentUnit_();
    const wrap = document.createElement('div');
    wrap.style.maxWidth = '720px';
    wrap.style.margin = '0 auto';
    if (!u) return;
    const progressMap = buildProgressMap_();
    state.students.forEach(s => {
      let a = 0, b = 0, c = 0;
      u.items.forEach(it => {
        const r = progressMap[`${s.student_id}|${it.item_id}`];
        if (r) { if (r.status === 'A') a++; else if (r.status === 'B') b++; else if (r.status === 'C') c++; }
      });
      const card = document.createElement('div');
      card.className = 'feed-item';
      card.innerHTML = `
        <span class="feed-time">No.${s.number}</span>
        <span class="feed-content">
          ◎${a} ○${b} △${c}
          <br><small>${u.name}</small>
        </span>
        <span class="feed-status">${a >= u.items.length / 2 ? '↗' : '・'}</span>
      `;
      card.addEventListener('click', () => openDetail_(s.student_id));
      wrap.appendChild(card);
    });
    root.appendChild(wrap);
  }

  // === 補充候補 ===
  function renderSupplement_(root) {
    const u = getCurrentUnit_();
    if (!u) return;
    const progressMap = buildProgressMap_();
    const wrap = document.createElement('div');
    wrap.style.maxWidth = '720px';
    wrap.style.margin = '0 auto';
    wrap.innerHTML = '<h3 style="margin-bottom:12px;">過半数が △ の項目（補充指導の候補）</h3>';
    let any = false;
    u.items.forEach(it => {
      let A = 0, B = 0, C = 0;
      state.students.forEach(s => {
        const r = progressMap[`${s.student_id}|${it.item_id}`];
        if (r) { if (r.status === 'A') A++; else if (r.status === 'B') B++; else if (r.status === 'C') C++; }
      });
      if (C > state.students.length / 2) {
        any = true;
        const card = document.createElement('div');
        card.className = 'alert-row';
        card.innerHTML = `
          <span class="student-no">${it.item_id}</span>
          <span class="alert-msg">${escapeHtml_(it.label)}（◎${A} ○${B} △${C}）</span>
          <span class="alert-time">${escapeHtml_(it.page || '')}</span>
        `;
        wrap.appendChild(card);
      }
    });
    if (!any) wrap.innerHTML += '<p style="color:#888;text-align:center;padding:32px;">過半数△の項目はありません。良いペースです。</p>';
    root.appendChild(wrap);
  }

  // === エクスポート ===
  function renderExport_(root) {
    root.innerHTML = `
      <div style="max-width:600px;margin:0 auto;">
        <h3>エクスポート</h3>
        <p>マトリクスタブから、CSV / evidence JSON / 大計画シート(.docx) を出力できます。</p>
        <p style="margin-top:16px;color:#888;font-size:14px;">
          観点別評価アプリへの送信は、<code>python sansuu_app_sync.py --export-evidence UNIT_ID</code>
          を実行してください。
        </p>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // 詳細パネル
  // ----------------------------------------------------------------
  function initDetailPanel_() {
    document.getElementById('detailCloseBtn').addEventListener('click', () => closeDetail_());
    document.getElementById('pinBtn').addEventListener('click', () => recordIntervention_('pin', '後でフォロー'));
    document.getElementById('commentBtn').addEventListener('click', () => {
      const txt = prompt('コメント（メモ）：');
      if (txt) recordIntervention_('voice', txt);
    });
    document.getElementById('aiSuggestBtn').addEventListener('click', () => suggestVoicePatterns_());
  }

  function openDetail_(studentId, focusItemId) {
    state.selectedStudentId = studentId;
    const num = parseInt(studentId.split('-').pop(), 10);
    const u = getCurrentUnit_();
    document.getElementById('detailTitle').textContent = `No.${num} の進度`;

    const studentProgress = state.progress.filter(r =>
      r.student_id === studentId && r.unit_id === state.selectedUnitId
    );
    const progressMap = {};
    studentProgress.forEach(r => {
      if (!progressMap[r.item_id] || (r.edited_at || '') > (progressMap[r.item_id].edited_at || '')) {
        progressMap[r.item_id] = r;
      }
    });

    const itemsHtml = u ? u.items.map(it => {
      const r = progressMap[it.item_id];
      const mark = r ? statusMark_(r.status) : '・';
      const cls = r ? 'mark-' + r.status : '';
      const reason = r && r.reason ? `<br><small>${escapeHtml_(r.reason)}</small>` : '';
      const next = r && r.next_strategy ? `<br><small>→ ${escapeHtml_(r.next_strategy)}</small>` : '';
      const focus = (it.item_id === focusItemId) ? 'background:#FFFBE6;' : '';
      return `<li style="${focus}"><span class="item-mark ${cls}">${mark}</span>${escapeHtml_(it.label)}${reason}${next}</li>`;
    }).join('') : '';

    document.getElementById('detailBody').innerHTML = `
      <div class="detail-section">
        <h4>${u ? u.name : ''}</h4>
        <ul class="detail-progress-list">${itemsHtml}</ul>
      </div>
    `;
    document.getElementById('tDetailPanel').hidden = false;
  }

  function closeDetail_() {
    document.getElementById('tDetailPanel').hidden = true;
    state.selectedStudentId = null;
  }

  // ----------------------------------------------------------------
  // 声かけ案サジェスト（定型パターン辞書ベース・Claude API不要）
  // ----------------------------------------------------------------
  function detectStudentState_(studentId) {
    // 児童の最近の状況から状態を判定
    const recent = state.progress
      .filter(r => r.student_id === studentId)
      .sort((a, b) => (b.edited_at || '').localeCompare(a.edited_at || ''))
      .slice(0, 5);
    const helpRecent = state.alerts.find(a => a.student_id === studentId);
    const interventions = state.interventions.filter(i =>
      i.student_id === studentId &&
      i.kind === 'help_received' &&
      (Date.now() - new Date(i.created_at).getTime()) < 30 * 60 * 1000  // 30分以内
    );

    const states = [];
    // ヘルプ要請が直近にある
    if (interventions.length > 0) states.push('help_received');
    // 連続△
    if (recent.length >= 3 && recent.slice(0, 3).every(r => r.status === 'C')) {
      states.push('consecutive_c');
    }
    // 連続◎
    if (recent.length >= 3 && recent.slice(0, 3).every(r => r.status === 'A')) {
      states.push('consecutive_a');
    }
    // 進度判定（その単元の項目数に対する記録数）
    const u = getCurrentUnit_();
    if (u) {
      const unitRecent = recent.filter(r => r.unit_id === state.selectedUnitId);
      const ratio = unitRecent.length / u.items.length;
      if (ratio < 0.2) states.push('slow_pace');
      else if (ratio > 0.7 && unitRecent.filter(r => r.status === 'A').length / unitRecent.length > 0.6) {
        states.push('fast_pace');
      }
    }
    // 直近の動きがない（最後の記録から30分以上）
    if (recent.length > 0) {
      const lastTs = new Date(recent[0].edited_at).getTime();
      if (Date.now() - lastTs > 30 * 60 * 1000) states.push('no_action');
    }
    // どれも該当しなければ general
    if (states.length === 0) states.push('general');
    return states;
  }

  function pickRandomLines_(lines, n) {
    const arr = [...lines];
    const out = [];
    while (out.length < n && arr.length > 0) {
      const idx = Math.floor(Math.random() * arr.length);
      out.push(arr.splice(idx, 1)[0]);
    }
    return out;
  }

  function suggestVoicePatterns_() {
    if (!state.selectedStudentId) return;
    const states = detectStudentState_(state.selectedStudentId);
    const patterns = window.PROMPTS.teacherVoicePatterns;
    let html = '<div style="padding:8px 0;">';
    states.forEach(stateName => {
      const p = patterns[stateName];
      if (!p) return;
      const lines = pickRandomLines_(p.lines, 3);
      html += `<div style="margin-bottom:14px;">`;
      html += `<h4 style="margin-bottom:6px;">${p.icon} ${escapeHtml_(p.label)}</h4>`;
      html += `<ul style="list-style:none;padding-left:0;">`;
      lines.forEach(line => {
        html += `<li style="padding:8px 12px;margin-bottom:4px;background:#FFFBE6;border-left:3px solid #FFD400;border-radius:4px;cursor:pointer;" data-voice-line="${escapeHtml_(line)}">「${escapeHtml_(line)}」</li>`;
      });
      html += `</ul></div>`;
    });
    html += '<p style="font-size:12px;color:#888;margin-top:8px;">クリックすると介入として記録されます</p></div>';

    // 詳細パネル下部に挿入
    const body = document.getElementById('detailBody');
    let suggestSection = body.querySelector('.voice-suggest-section');
    if (suggestSection) suggestSection.remove();
    suggestSection = document.createElement('div');
    suggestSection.className = 'detail-section voice-suggest-section';
    suggestSection.innerHTML = '<h4>🤖 声かけ案（樋口流）</h4>' + html;
    body.appendChild(suggestSection);

    // クリックで記録
    suggestSection.querySelectorAll('[data-voice-line]').forEach(li => {
      li.addEventListener('click', () => {
        recordIntervention_('voice', li.dataset.voiceLine);
        li.style.background = '#E6F7E6';
        li.style.borderLeftColor = '#69C779';
      });
    });
  }

  async function recordIntervention_(kind, comment) {
    if (!state.selectedStudentId) return;
    const data = {
      teacher_id: 'sato',
      student_id: state.selectedStudentId,
      unit_id: state.selectedUnitId,
      kind: kind,
      comment: comment,
      ai_generated: false,
      created_at: new Date().toISOString()
    };
    try {
      const result = await window.CloudSync.push('interventions', 'insert', data);
      if (result.ok) toast('記録しました', 'success');
      else toast('オフラインのためキューに追加', 'info');
    } catch (err) {
      toast('保存失敗: ' + err.message, 'error');
    }
  }

  // ----------------------------------------------------------------
  // ユーティリティ
  // ----------------------------------------------------------------
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 2000);
  }

  function escapeHtml_(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  // デバッグ公開
  window.SansuuTeacher = { state, refreshAll_, showView_ };
})();
