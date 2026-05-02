'use strict';

/* ==========================================================================
 * 5年4組 観点別評価記録アプリ
 * - localStorage で記録を保管
 * - 教科×単元×観点 を選び、児童グリッドのABCボタンで1タップ評価
 * - 同じ subject/unit/viewpoint/student の最新1件のみ有効、古い記録は superseded
 * ========================================================================== */

const STORAGE_KEY = 'evaluationApp_v1';
const STORAGE_BACKUP_KEY = 'evaluationApp_v1_backup';
const LAST_BACKUP_KEY = 'evaluationApp_lastBackup';
const APP_VERSION = 1;
let isSaving = false;

const GRADES = ['A', 'B', 'C'];

// ========== State ==========
if (!window.APP_DATA || !Array.isArray(window.APP_DATA.students)) {
  document.body.innerHTML = '<p style="padding:20px;color:#c00">データ読込失敗。data.jsを確認してください。</p>';
  throw new Error('APP_DATA missing');
}

const state = {
  students: window.APP_DATA.students.map(s => ({ ...s })),
  subjects: window.APP_DATA.subjects.map(s => ({ ...s })),
  viewpoints: window.APP_DATA.viewpoints.map(v => ({ ...v })),
  units: [],
  records: [],
  ui: {
    currentTab: 'record',
    currentSubject: 'kokugo',
    currentUnitId: null,
    currentViewpoint: 'knowledge',
    currentMode: 'viewpoint',  // 'viewpoint' | 'student'
    focusStudentId: null,
    selectedHistoryIds: new Set(),
    numBuf: '',
    numTimer: null,
    lastBulkOp: null,  // {action, ids:[recordId,...]}
    popoverStudentId: null
  }
};

// ========== Persistence ==========
function checkLocalStorage() {
  try {
    const k = '__test_' + Date.now();
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    alert('このブラウザはlocalStorageが利用不可です。プライベートモードを解除してください。');
    return false;
  }
}

function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.error('localStorage 読み込み失敗', e);
    return;
  }
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data.records)) {
      state.records = data.records.map(normalizeRecord).filter(Boolean);
    }
    if (Array.isArray(data.units)) {
      state.units = data.units.map(normalizeUnit).filter(Boolean);
    }
    if (data.lastSubject) state.ui.currentSubject = data.lastSubject;
    if (data.lastUnitId) state.ui.currentUnitId = data.lastUnitId;
    if (data.lastViewpoint) state.ui.currentViewpoint = data.lastViewpoint;
    if (data.lastMode) state.ui.currentMode = data.lastMode;
  } catch (e) {
    console.error('保存データのパース失敗', e);
    showToast('保存データの読み込みに失敗。バックアップから復元してください', 'error');
  }
}

function saveState() {
  const data = {
    version: APP_VERSION,
    records: state.records,
    units: state.units,
    lastSubject: state.ui.currentSubject,
    lastUnitId: state.ui.currentUnitId,
    lastViewpoint: state.ui.currentViewpoint,
    lastMode: state.ui.currentMode
  };
  const json = JSON.stringify(data);
  try {
    const prev = localStorage.getItem(STORAGE_KEY);
    if (prev) {
      try { localStorage.setItem(STORAGE_BACKUP_KEY, prev); } catch (_) {}
    }
    localStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    console.error('保存失敗', e);
    if (e.name === 'QuotaExceededError' || /quota/i.test(e.message || '')) {
      showToast('容量超過。エクスポートして履歴を整理してください', 'error');
    } else {
      showToast('保存失敗: ' + (e.message || 'unknown'), 'error');
    }
  }
}

// ========== Data Normalization ==========
function normalizeRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const subject = typeof r.subject === 'string' ? r.subject : null;
  const unitId = typeof r.unitId === 'string' ? r.unitId : null;
  const viewpoint = typeof r.viewpoint === 'string' ? r.viewpoint : null;
  const studentId = parseInt(r.studentId);
  const grade = typeof r.grade === 'string' ? r.grade.toUpperCase() : null;
  if (!subject || !unitId || !viewpoint || !Number.isFinite(studentId) || !GRADES.includes(grade)) {
    return null;
  }
  const timestamp = r.timestamp || new Date().toISOString();
  let date = r.date;
  if (!date) {
    try { date = new Date(timestamp).toISOString().slice(0, 10); }
    catch { date = todayISO(); }
  }
  return {
    id: r.id || uuid(),
    timestamp,
    date,
    subject,
    unitId,
    viewpoint,
    studentId,
    grade,
    superseded: r.superseded === true
  };
}

function normalizeUnit(u) {
  if (!u || typeof u !== 'object') return null;
  const subject = typeof u.subject === 'string' ? u.subject : null;
  const name = typeof u.name === 'string' ? u.name.trim() : '';
  if (!subject || !name) return null;
  const criteria = (u.criteria && typeof u.criteria === 'object') ? u.criteria : {};
  return {
    id: u.id || uuid(),
    subject,
    name,
    criteria: {
      knowledge: typeof criteria.knowledge === 'string' ? criteria.knowledge : '',
      thinking:  typeof criteria.thinking  === 'string' ? criteria.thinking  : '',
      attitude:  typeof criteria.attitude  === 'string' ? criteria.attitude  : ''
    },
    created_at: u.created_at || new Date().toISOString(),
    archived: u.archived === true
  };
}

// ========== Helpers ==========
function getStudent(id) {
  return state.students.find(s => s.id === id);
}
function getStudentName(id) {
  return getStudent(id)?.name || `(ID:${id})`;
}
function getSubject(id) {
  return state.subjects.find(s => s.id === id);
}
function getSubjectLabel(id) {
  return getSubject(id)?.label || id;
}
function getSubjectColor(id) {
  return getSubject(id)?.color || '#4a90e2';
}
function getViewpoint(id) {
  return state.viewpoints.find(v => v.id === id);
}
function getViewpointLabel(id) {
  return getViewpoint(id)?.label || id;
}
function getViewpointShort(id) {
  return getViewpoint(id)?.short || '?';
}
function getUnit(id) {
  return state.units.find(u => u.id === id);
}
function getUnitName(id) {
  return getUnit(id)?.name || '(削除済単元)';
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function formatDateTime(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function uuid() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return 'r-' + crypto.randomUUID();
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => { t.className = 'toast'; }, 1800);
}

// ========== Lookup ==========
// 最新の有効なレコードを取得 (superseded=false かつ最新タイムスタンプ)
function getLatestRecord(subject, unitId, viewpoint, studentId) {
  let latest = null;
  for (const r of state.records) {
    if (r.superseded) continue;
    if (r.subject === subject && r.unitId === unitId && r.viewpoint === viewpoint && r.studentId === studentId) {
      if (!latest || r.timestamp > latest.timestamp) latest = r;
    }
  }
  return latest;
}

// 最新評価マップ: key="subject|unit|vp|sid" => record
function buildLatestMap(filter = {}) {
  const map = {};
  for (const r of state.records) {
    if (r.superseded) continue;
    if (filter.subject && r.subject !== filter.subject) continue;
    if (filter.unitId && r.unitId !== filter.unitId) continue;
    if (filter.viewpoint && r.viewpoint !== filter.viewpoint) continue;
    const key = `${r.subject}|${r.unitId}|${r.viewpoint}|${r.studentId}`;
    const cur = map[key];
    if (!cur || r.timestamp > cur.timestamp) map[key] = r;
  }
  return map;
}

// ========== Init ==========
function init() {
  if (!checkLocalStorage()) return;
  loadState();
  ensureDefaultUnits();
  // 単元未選択 or 存在しない単元なら、現教科の最初のアクティブ単元へ
  ensureValidUnitSelection();

  renderToday();
  renderSubjectButtons();
  renderUnitSelect();
  renderViewpointTabs();
  renderCriteriaCard();
  renderStudentGrid();

  initRecordEvents();
  initUnitMgmtEvents();
  initSummaryFilters();
  initDistFilters();
  initHeatmapFilters();
  initGrowthFilters();
  initHistoryFilters();
  initSettingsEvents();
  initKeyboardShortcuts();
  initHelpModal();
  initPopover();
  initSummaryPrint();
  initInteractionEvents();

  updateHealthBadge();
  applyModeUI();
  refreshAll();
  checkCAlerts();
}

function ensureDefaultUnits() {
  // 各教科に「単元未設定」のプレースホルダを1つ自動作成
  for (const subj of state.subjects) {
    const exists = state.units.some(u => u.subject === subj.id);
    if (!exists) {
      state.units.push({
        id: uuid(),
        subject: subj.id,
        name: '単元未設定',
        criteria: { knowledge: '', thinking: '', attitude: '' },
        created_at: new Date().toISOString(),
        archived: false
      });
    }
  }
  saveState();
}

function ensureValidUnitSelection() {
  const units = state.units.filter(u => u.subject === state.ui.currentSubject && !u.archived);
  if (units.length === 0) {
    // 全アーカイブされている場合はアーカイブ含めて選ぶ
    const all = state.units.filter(u => u.subject === state.ui.currentSubject);
    state.ui.currentUnitId = all[0] ? all[0].id : null;
    return;
  }
  if (!state.ui.currentUnitId || !units.some(u => u.id === state.ui.currentUnitId)) {
    state.ui.currentUnitId = units[0].id;
  }
}

function updateHealthBadge() {
  const badge = document.getElementById('healthBadge');
  if (!badge) return;
  const total = state.records.filter(r => !r.superseded).length;
  const lastBackup = parseInt(localStorage.getItem(LAST_BACKUP_KEY) || '0');
  let cls = 'health-badge';
  let text = `累計 ${total}件`;
  if (lastBackup) {
    const days = Math.max(0, Math.floor((Date.now() - lastBackup) / 86400000));
    text += ` ・ 最終BU ${days}日前`;
    if (days >= 14) cls += ' danger';
    else if (days >= 7) cls += ' warn';
  } else if (total >= 5) {
    text += ' ・ 未BU ⚠';
    cls += ' warn';
  }
  badge.textContent = text;
  badge.className = cls;
}

function renderToday() {
  const d = new Date();
  const wd = ['日','月','火','水','木','金','土'][d.getDay()];
  document.getElementById('todayLabel').textContent =
    `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} (${wd})`;
}

// ========== Subject Buttons ==========
function renderSubjectButtons() {
  const cont = document.getElementById('subjectButtons');
  cont.innerHTML = '';
  for (const subj of state.subjects) {
    const btn = document.createElement('button');
    btn.className = 'subject-btn' + (subj.id === state.ui.currentSubject ? ' active' : '');
    btn.dataset.subjectId = subj.id;
    btn.style.setProperty('--subject-color', subj.color);
    btn.textContent = subj.label;
    btn.addEventListener('click', () => {
      state.ui.currentSubject = subj.id;
      ensureValidUnitSelection();
      renderSubjectButtons();
      renderUnitSelect();
      renderCriteriaCard();
      renderStudentGrid();
      saveState();
    });
    cont.appendChild(btn);
  }
}

// ========== Unit Select ==========
function renderUnitSelect() {
  const sel = document.getElementById('unitSelect');
  sel.innerHTML = '';
  const units = state.units.filter(u => u.subject === state.ui.currentSubject && !u.archived);
  if (units.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(単元なし - 単元管理タブで追加)';
    sel.appendChild(opt);
    return;
  }
  for (const u of units) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    if (u.id === state.ui.currentUnitId) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ========== Viewpoint Tabs ==========
function renderViewpointTabs() {
  const cont = document.getElementById('viewpointTabs');
  cont.innerHTML = '';
  for (const vp of state.viewpoints) {
    const btn = document.createElement('button');
    btn.className = 'viewpoint-tab' + (vp.id === state.ui.currentViewpoint ? ' active' : '');
    btn.dataset.vp = vp.id;
    const span = document.createElement('span');
    span.className = 'vp-short';
    span.textContent = vp.short;
    btn.appendChild(span);
    btn.appendChild(document.createTextNode(vp.label));
    btn.addEventListener('click', () => {
      state.ui.currentViewpoint = vp.id;
      renderViewpointTabs();
      renderCriteriaCard();
      renderStudentGrid();
      saveState();
    });
    cont.appendChild(btn);
  }
}

// ========== Criteria Card ==========
function renderCriteriaCard() {
  const labelEl = document.getElementById('criteriaLabel');
  const metaEl = document.getElementById('criteriaMeta');
  const textEl = document.getElementById('criteriaText');
  const unit = getUnit(state.ui.currentUnitId);
  const vp = getViewpoint(state.ui.currentViewpoint);
  if (!unit || !vp) {
    labelEl.textContent = '評価基準';
    metaEl.textContent = '';
    textEl.textContent = '単元と観点を選択すると評価基準が表示されます';
    textEl.className = 'criteria-text empty';
    return;
  }
  labelEl.textContent = `📋 評価基準（${vp.label}）`;
  metaEl.textContent = `${getSubjectLabel(unit.subject)} / ${unit.name}`;
  const text = (unit.criteria && unit.criteria[vp.id]) || '';
  if (!text) {
    textEl.textContent = '（評価基準が未設定です。単元管理タブで設定できます）';
    textEl.className = 'criteria-text empty';
  } else {
    textEl.textContent = text;
    textEl.className = 'criteria-text';
  }
}

// ========== Student Grid ==========
function renderStudentGrid() {
  const grid = document.getElementById('studentGrid');
  grid.innerHTML = '';
  grid.classList.toggle('mode-student', state.ui.currentMode === 'student');

  for (const s of state.students) {
    const card = document.createElement('div');
    card.className = 'student-card';
    card.dataset.studentId = s.id;
    if (s.highlight) card.classList.add('highlight');
    if (s.watch) card.classList.add('watch');
    card.title = `${s.kana}${s.note ? ' / ' + s.note : ''} (出席番号 ${s.id})`;

    // 出席番号
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = s.id;
    card.appendChild(num);

    // 名前 (児童軸モードはクリックでポップオーバー)
    const nameEl = document.createElement('div');
    nameEl.className = 'stu-name';
    nameEl.textContent = s.name;
    nameEl.addEventListener('click', () => {
      if (state.ui.currentMode === 'student') {
        openStudentPopover(s.id);
      } else {
        // 観点軸モード: フォーカスのみ
        setFocusStudent(s.id);
      }
    });
    card.appendChild(nameEl);

    if (state.ui.currentMode === 'viewpoint') {
      // 観点軸モード: 現観点のABCボタン
      const row = document.createElement('div');
      row.className = 'grade-row';
      const cur = getLatestRecord(state.ui.currentSubject, state.ui.currentUnitId, state.ui.currentViewpoint, s.id);
      for (const g of GRADES) {
        const b = document.createElement('button');
        b.className = `g-btn g-${g}` + (cur && cur.grade === g ? ' selected' : '');
        b.textContent = g;
        b.dataset.grade = g;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          setGrade(s.id, state.ui.currentViewpoint, g);
        });
        row.appendChild(b);
      }
      card.appendChild(row);

      if (cur) {
        card.classList.add('has-grade', `grade-${cur.grade}`);
      } else if (s.highlight) {
        card.classList.add('no-grade');
      }
    } else {
      // 児童軸モード: 3観点を縦に並べる
      for (const vp of state.viewpoints) {
        const row = document.createElement('div');
        row.className = 'vp-row';
        row.dataset.vp = vp.id;
        const lbl = document.createElement('span');
        lbl.className = 'vp-label';
        lbl.textContent = vp.short;
        row.appendChild(lbl);
        const cur = getLatestRecord(state.ui.currentSubject, state.ui.currentUnitId, vp.id, s.id);
        for (const g of GRADES) {
          const b = document.createElement('button');
          b.className = `g-btn g-${g}` + (cur && cur.grade === g ? ' selected' : '');
          b.textContent = g;
          b.dataset.grade = g;
          b.dataset.vp = vp.id;
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            setGrade(s.id, vp.id, g);
          });
          row.appendChild(b);
        }
        card.appendChild(row);
      }
    }

    if (state.ui.focusStudentId === s.id) card.classList.add('kbd-focus');

    grid.appendChild(card);
  }

  refreshGridCoverage();
  refreshProgress();
}

function refreshGridCoverage() {
  const today = todayISO();
  const todaySet = new Set();
  for (const r of state.records) {
    if (r.superseded) continue;
    if (r.date === today) todaySet.add(r.studentId);
  }
  document.querySelectorAll('.student-card').forEach(card => {
    const id = parseInt(card.dataset.studentId);
    card.classList.toggle('covered-today', todaySet.has(id));
  });
}

function refreshProgress() {
  const subj = state.ui.currentSubject;
  const unit = state.ui.currentUnitId;
  const vp = state.ui.currentViewpoint;
  if (!unit) {
    document.getElementById('progressCount').textContent = '0';
    document.getElementById('countA').textContent = '0';
    document.getElementById('countB').textContent = '0';
    document.getElementById('countC').textContent = '0';
    return;
  }
  let evaluated = 0, a = 0, b = 0, c = 0;
  for (const s of state.students) {
    const cur = state.ui.currentMode === 'viewpoint'
      ? getLatestRecord(subj, unit, vp, s.id)
      : null;
    if (state.ui.currentMode === 'viewpoint') {
      if (cur) {
        evaluated++;
        if (cur.grade === 'A') a++;
        else if (cur.grade === 'B') b++;
        else if (cur.grade === 'C') c++;
      }
    } else {
      // 児童軸: 3観点全部評価された児童をカウント
      const r1 = getLatestRecord(subj, unit, 'knowledge', s.id);
      const r2 = getLatestRecord(subj, unit, 'thinking', s.id);
      const r3 = getLatestRecord(subj, unit, 'attitude', s.id);
      if (r1 && r2 && r3) evaluated++;
      // ABC合計（複数観点で同児童でもカウント）
      [r1, r2, r3].forEach(r => {
        if (!r) return;
        if (r.grade === 'A') a++;
        else if (r.grade === 'B') b++;
        else if (r.grade === 'C') c++;
      });
    }
  }
  document.getElementById('progressCount').textContent = String(evaluated);
  document.getElementById('countA').textContent = String(a);
  document.getElementById('countB').textContent = String(b);
  document.getElementById('countC').textContent = String(c);
}

function setFocusStudent(id) {
  state.ui.focusStudentId = id;
  document.querySelectorAll('.student-card').forEach(c => {
    c.classList.toggle('kbd-focus', parseInt(c.dataset.studentId) === id);
  });
}

// ========== Set Grade ==========
function setGrade(studentId, viewpoint, grade) {
  if (isSaving) return;
  if (!state.ui.currentUnitId) {
    showToast('単元が未選択です', 'error');
    return;
  }
  if (!GRADES.includes(grade)) return;
  isSaving = true;
  try {
    const subject = state.ui.currentSubject;
    const unitId = state.ui.currentUnitId;

    const cur = getLatestRecord(subject, unitId, viewpoint, studentId);
    if (cur && cur.grade === grade) {
      // 同じ評価を再タップ → 取消（superseded化のみで履歴維持はしない、削除）
      state.records = state.records.filter(r => r.id !== cur.id);
      // ただし、過去にsupersededになっていたものを最新化はしない（取消は単純削除）
      saveState();
      showToast(`✓ ${getStudentName(studentId)}: ${getViewpointShort(viewpoint)} → 取消`, 'success');
      renderStudentGrid();
      updateHealthBadge();
      return;
    }
    // 既存の最新を superseded化
    if (cur) cur.superseded = true;
    // 新規レコードを追加
    const rec = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      date: todayISO(),
      subject,
      unitId,
      viewpoint,
      studentId,
      grade,
      superseded: false
    };
    state.records.push(rec);
    saveState();

    showToast(`✓ ${getStudentName(studentId)}: ${getViewpointShort(viewpoint)} → ${grade}`, 'success');
    renderStudentGrid();
    updateHealthBadge();
    checkCAlerts();
  } finally {
    isSaving = false;
  }
}

// ========== Bulk Actions ==========
function bulkSetGrade(grade) {
  const subj = state.ui.currentSubject;
  const unit = state.ui.currentUnitId;
  const vp = state.ui.currentViewpoint;
  if (!unit) { showToast('単元が未選択です', 'error'); return; }
  if (state.ui.currentMode !== 'viewpoint') {
    showToast('一括操作は観点軸モードのみ', 'error');
    return;
  }
  const targets = [];
  for (const s of state.students) {
    const cur = getLatestRecord(subj, unit, vp, s.id);
    if (!cur || cur.grade !== grade) targets.push({ studentId: s.id, prev: cur });
  }
  if (targets.length === 0) { showToast(`既に全員${grade}です`, 'success'); return; }
  if (!confirm(`${targets.length}人を一括で「${grade}」に設定します。よろしいですか？\n\n（${getViewpointLabel(vp)} / ${getUnitName(unit)}）`)) return;

  const newIds = [];
  for (const t of targets) {
    if (t.prev) t.prev.superseded = true;
    const rec = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      date: todayISO(),
      subject: subj,
      unitId: unit,
      viewpoint: vp,
      studentId: t.studentId,
      grade,
      superseded: false
    };
    state.records.push(rec);
    newIds.push(rec.id);
  }
  state.ui.lastBulkOp = { action: 'set', ids: newIds, prevIds: targets.filter(t => t.prev).map(t => t.prev.id) };
  saveState();
  showToast(`✓ ${targets.length}人を「${grade}」に設定 (Ctrl+Zで取消可)`, 'success');
  renderStudentGrid();
  updateHealthBadge();
  checkCAlerts();
}

function bulkClear() {
  const subj = state.ui.currentSubject;
  const unit = state.ui.currentUnitId;
  const vp = state.ui.currentViewpoint;
  if (!unit) return;
  if (state.ui.currentMode !== 'viewpoint') {
    showToast('一括操作は観点軸モードのみ', 'error');
    return;
  }
  const targets = state.records.filter(r =>
    !r.superseded && r.subject === subj && r.unitId === unit && r.viewpoint === vp
  );
  if (targets.length === 0) { showToast('クリア対象がありません', 'success'); return; }
  if (!confirm(`${targets.length}件の評価を全クリアします。\n（${getViewpointLabel(vp)} / ${getUnitName(unit)}）\n履歴には残ります。よろしいですか？`)) return;
  for (const r of targets) r.superseded = true;
  state.ui.lastBulkOp = { action: 'clear', supersededIds: targets.map(r => r.id) };
  saveState();
  showToast(`✓ ${targets.length}件をクリア (Ctrl+Zで取消可)`, 'success');
  renderStudentGrid();
  updateHealthBadge();
}

function undoLastOp() {
  // 直前の操作を取消: 1) lastBulkOpがあれば優先 2) 単発の最新追加レコードを削除
  if (state.ui.lastBulkOp) {
    const op = state.ui.lastBulkOp;
    if (op.action === 'set') {
      // 新規追加分を削除
      state.records = state.records.filter(r => !op.ids.includes(r.id));
      // superseded化していたprevを復活
      for (const pid of (op.prevIds || [])) {
        const r = state.records.find(x => x.id === pid);
        if (r) r.superseded = false;
      }
      showToast(`↶ 一括設定を取消 (${op.ids.length}件)`, 'success');
    } else if (op.action === 'clear') {
      for (const id of op.supersededIds) {
        const r = state.records.find(x => x.id === id);
        if (r) r.superseded = false;
      }
      showToast(`↶ 一括クリアを取消 (${op.supersededIds.length}件)`, 'success');
    }
    state.ui.lastBulkOp = null;
    saveState();
    renderStudentGrid();
    updateHealthBadge();
    return;
  }
  // 単発undo: 最新の有効レコードを削除し、1つ前のsupersededを復活
  let latest = null;
  for (const r of state.records) {
    if (r.superseded) continue;
    if (!latest || r.timestamp > latest.timestamp) latest = r;
  }
  if (!latest) {
    showToast('取り消す評価がありません', 'error');
    return;
  }
  // 同 subject/unit/vp/student で次に古い superseded を復活
  const sib = state.records.filter(r =>
    r.id !== latest.id &&
    r.subject === latest.subject &&
    r.unitId === latest.unitId &&
    r.viewpoint === latest.viewpoint &&
    r.studentId === latest.studentId
  ).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  state.records = state.records.filter(r => r.id !== latest.id);
  if (sib[0]) sib[0].superseded = false;
  saveState();
  showToast(`↶ 取消: ${getStudentName(latest.studentId)} ${getViewpointShort(latest.viewpoint)}=${latest.grade}`, 'success');
  renderStudentGrid();
  updateHealthBadge();
}

// ========== Mode UI ==========
function applyModeUI() {
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.ui.currentMode);
  });
  document.getElementById('viewpointTabs').classList.toggle('hidden-mode', state.ui.currentMode !== 'viewpoint');
  // 一括ボタンは観点軸モードのみ意味あり、児童軸では disable
  ['bulkABtn', 'bulkBBtn', 'bulkCBtn', 'bulkClearBtn'].forEach(id => {
    document.getElementById(id).disabled = state.ui.currentMode !== 'viewpoint';
  });
}

// ========== Record events ==========
function initRecordEvents() {
  // タブ切替
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // モード切替
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.currentMode = btn.dataset.mode;
      applyModeUI();
      renderStudentGrid();
      saveState();
    });
  });

  // 単元切替
  document.getElementById('unitSelect').addEventListener('change', e => {
    state.ui.currentUnitId = e.target.value || null;
    renderCriteriaCard();
    renderStudentGrid();
    saveState();
  });

  // 新規単元追加ショートカット (記録タブから)
  document.getElementById('newUnitBtn').addEventListener('click', () => {
    openUnitModal(null, state.ui.currentSubject);
  });

  // Undo
  document.getElementById('undoBtn').addEventListener('click', undoLastOp);

  // 一括操作
  document.getElementById('bulkABtn').addEventListener('click', () => bulkSetGrade('A'));
  document.getElementById('bulkBBtn').addEventListener('click', () => bulkSetGrade('B'));
  document.getElementById('bulkCBtn').addEventListener('click', () => bulkSetGrade('C'));
  document.getElementById('bulkClearBtn').addEventListener('click', bulkClear);
}

function switchTab(name) {
  state.ui.currentTab = name;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'summary') refreshSummary();
  else if (name === 'distribution') refreshDistribution();
  else if (name === 'heatmap') refreshHeatmap();
  else if (name === 'growth') refreshGrowth();
  else if (name === 'history') refreshHistory();
  else if (name === 'units') refreshUnitList();
  else if (name === 'settings') refreshSettings();
}

// ========== Popover (児童軸モード) ==========
function initPopover() {
  document.getElementById('popoverCloseBtn').addEventListener('click', closeStudentPopover);
  document.getElementById('studentPopoverBackdrop').addEventListener('click', e => {
    if (e.target.id === 'studentPopoverBackdrop') closeStudentPopover();
  });
}

function openStudentPopover(studentId) {
  state.ui.popoverStudentId = studentId;
  const s = getStudent(studentId);
  const unit = getUnit(state.ui.currentUnitId);
  if (!s || !unit) return;
  document.getElementById('popoverTitle').textContent = `${s.name} (No.${s.id}) — ${getSubjectLabel(state.ui.currentSubject)} / ${unit.name}`;
  const body = document.getElementById('popoverBody');
  body.innerHTML = '';
  for (const vp of state.viewpoints) {
    const row = document.createElement('div');
    row.className = 'popover-vp-row';
    const info = document.createElement('div');
    info.className = 'vp-info';
    const name = document.createElement('div');
    name.className = 'vp-name';
    name.textContent = vp.label;
    info.appendChild(name);
    const cri = document.createElement('div');
    cri.className = 'vp-criteria';
    cri.textContent = (unit.criteria && unit.criteria[vp.id]) || '（評価基準未設定）';
    info.appendChild(cri);
    row.appendChild(info);

    const grow = document.createElement('div');
    grow.className = 'grade-row';
    const cur = getLatestRecord(state.ui.currentSubject, state.ui.currentUnitId, vp.id, studentId);
    for (const g of GRADES) {
      const b = document.createElement('button');
      b.className = `g-btn g-${g}` + (cur && cur.grade === g ? ' selected' : '');
      b.textContent = g;
      b.addEventListener('click', () => {
        setGrade(studentId, vp.id, g);
        // ポップオーバー再描画
        openStudentPopover(studentId);
      });
      grow.appendChild(b);
    }
    row.appendChild(grow);
    body.appendChild(row);
  }
  document.getElementById('studentPopoverBackdrop').classList.remove('hidden');
}

function closeStudentPopover() {
  state.ui.popoverStudentId = null;
  document.getElementById('studentPopoverBackdrop').classList.add('hidden');
}

// ========== Summary tab ==========
function initSummaryFilters() {
  const sel = document.getElementById('summarySubject');
  for (const subj of state.subjects) {
    const opt = document.createElement('option');
    opt.value = subj.id;
    opt.textContent = subj.label;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    populateSummaryUnits();
    refreshSummary();
  });
  document.getElementById('summaryUnit').addEventListener('change', refreshSummary);
  document.getElementById('summaryCsvBtn').addEventListener('click', exportSummaryCSV);
}

function populateSummaryUnits() {
  const subj = document.getElementById('summarySubject').value;
  const sel = document.getElementById('summaryUnit');
  const cur = sel.value;
  sel.innerHTML = '<option value="">すべて</option>';
  const units = state.units.filter(u => u.subject === subj);
  for (const u of units) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name + (u.archived ? ' (アーカイブ)' : '');
    if (u.id === cur) opt.selected = true;
    sel.appendChild(opt);
  }
}

function refreshSummary() {
  // 初回 or 教科変更時にユニット一覧を埋める
  const subjSel = document.getElementById('summarySubject');
  if (!subjSel.value) subjSel.value = state.ui.currentSubject;
  const subj = subjSel.value;
  // 常に最新化（単元の追加・削除に追随）
  populateSummaryUnits();
  const unitFilter = document.getElementById('summaryUnit').value;

  let units = state.units.filter(u => u.subject === subj);
  if (unitFilter) units = units.filter(u => u.id === unitFilter);

  const table = document.getElementById('summaryTable');
  if (units.length === 0) {
    table.innerHTML = '<thead><tr><th>—</th></tr></thead><tbody><tr><td class="muted" style="padding:14px;text-align:center">単元がありません。単元管理タブで追加してください。</td></tr></tbody>';
    document.getElementById('summaryInfo').textContent = '0単元';
    return;
  }

  // ヘッダ: 児童 | (単元1: 知 思 態) (単元2: 知 思 態) ...
  let html = '<thead><tr><th rowspan="2" class="name-cell" style="position:sticky;left:0;z-index:3;background:#f5f7fa">児童</th>';
  for (const u of units) {
    html += `<th colspan="3" class="unit-header"><span class="unit-name" title="${escapeHtml(u.name)}">${escapeHtml(u.name)}</span></th>`;
  }
  html += '</tr><tr>';
  for (const _ of units) {
    for (const vp of state.viewpoints) {
      html += `<th><span class="vp-mini" style="background:${vpColorVar(vp.id)}" title="${escapeHtml(vp.label)}">${escapeHtml(vp.short)}</span></th>`;
    }
  }
  html += '</tr></thead><tbody>';

  let count = 0;
  for (const s of state.students) {
    const rowClass = s.highlight ? 'highlight-row' : (s.watch ? 'watch-row' : '');
    html += `<tr class="${rowClass}"><td class="name-cell"><span class="num">${s.id}</span>${escapeHtml(s.name)}</td>`;
    for (const u of units) {
      for (const vp of state.viewpoints) {
        const cur = getLatestRecord(subj, u.id, vp.id, s.id);
        if (cur) {
          html += `<td class="cell grade-${cur.grade}">${cur.grade}</td>`;
          count++;
        } else {
          html += `<td class="cell grade-none">—</td>`;
        }
      }
    }
    html += '</tr>';
  }
  html += '</tbody>';
  table.innerHTML = html;
  document.getElementById('summaryInfo').textContent = `${units.length}単元 / 評価済${count}件`;
}

function vpColorVar(id) {
  if (id === 'knowledge') return 'var(--grade-b)';
  if (id === 'thinking') return 'var(--grade-a)';
  if (id === 'attitude') return 'var(--grade-c)';
  return '#ccc';
}

function exportSummaryCSV() {
  const subj = document.getElementById('summarySubject').value;
  const unitFilter = document.getElementById('summaryUnit').value;
  let units = state.units.filter(u => u.subject === subj);
  if (unitFilter) units = units.filter(u => u.id === unitFilter);

  const header = ['出席番号', '氏名'];
  for (const u of units) {
    for (const vp of state.viewpoints) {
      header.push(`${u.name}_${vp.short}`);
    }
  }
  const rows = [header];
  for (const s of state.students) {
    const row = [s.id, s.name];
    for (const u of units) {
      for (const vp of state.viewpoints) {
        const cur = getLatestRecord(subj, u.id, vp.id, s.id);
        row.push(cur ? cur.grade : '');
      }
    }
    rows.push(row);
  }
  const csv = '﻿' + rows.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadFile(csv, `evaluation-summary-${getSubjectLabel(subj)}-${todayISO()}.csv`, 'text/csv;charset=utf-8');
  showToast('集計CSVをエクスポートしました');
}

// ========== Distribution tab ==========
function initDistFilters() {
  const sel = document.getElementById('distSubject');
  for (const subj of state.subjects) {
    const opt = document.createElement('option');
    opt.value = subj.id;
    opt.textContent = subj.label;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    populateDistUnits();
    refreshDistribution();
  });
  document.getElementById('distUnit').addEventListener('change', refreshDistribution);
}

function populateDistUnits() {
  const subj = document.getElementById('distSubject').value;
  const sel = document.getElementById('distUnit');
  const cur = sel.value;
  sel.innerHTML = '<option value="">すべての単元</option>';
  const units = state.units.filter(u => u.subject === subj);
  for (const u of units) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name + (u.archived ? ' (アーカイブ)' : '');
    if (u.id === cur) opt.selected = true;
    sel.appendChild(opt);
  }
}

function refreshDistribution() {
  const subjSel = document.getElementById('distSubject');
  if (!subjSel.value) subjSel.value = state.ui.currentSubject;
  const subj = subjSel.value;
  populateDistUnits();
  const unitFilter = document.getElementById('distUnit').value;

  let units = state.units.filter(u => u.subject === subj);
  if (unitFilter) units = units.filter(u => u.id === unitFilter);

  const area = document.getElementById('distArea');
  area.innerHTML = '';
  document.getElementById('distInfo').textContent = `${units.length}単元`;

  if (units.length === 0) {
    area.innerHTML = '<div class="muted" style="padding:14px;text-align:center">単元がありません</div>';
    document.getElementById('distAttention').innerHTML = '';
    return;
  }

  // 集計用: 単元ごと×観点ごとのABC分布
  const attentionData = []; // {unit, vp, aHl: [...students], cHl: [...]}
  for (const u of units) {
    const card = document.createElement('div');
    card.className = 'dist-card';
    let html = `<h4>${escapeHtml(u.name)}<span class="total">${escapeHtml(getSubjectLabel(subj))}</span></h4>`;
    for (const vp of state.viewpoints) {
      const counts = { A: 0, B: 0, C: 0, none: 0 };
      const hlByGrade = { A: [], C: [] };
      for (const s of state.students) {
        const cur = getLatestRecord(subj, u.id, vp.id, s.id);
        if (cur) {
          counts[cur.grade]++;
          if (s.highlight && (cur.grade === 'A' || cur.grade === 'C')) {
            hlByGrade[cur.grade].push(s);
          }
        } else counts.none++;
      }
      const total = counts.A + counts.B + counts.C;
      const max = Math.max(counts.A, counts.B, counts.C, 1);
      attentionData.push({ unit: u, vp, hlA: hlByGrade.A, hlC: hlByGrade.C, counts });

      html += `<div class="vp-block"><div class="vp-title" data-vp="${vp.id}"><span class="vp-short">${escapeHtml(vp.short)}</span>${escapeHtml(vp.label)}<span class="muted small" style="margin-left:auto">評価${total}/未${counts.none}</span></div>`;
      for (const g of GRADES) {
        const w = counts[g] === 0 ? 0 : Math.max(2, Math.round((counts[g] / max) * 100));
        const pct = total > 0 ? Math.round((counts[g] / total) * 100) : 0;
        html += `<div class="bar-row"><div class="bar-label">${g}</div><div class="bar-track"><div class="bar-fill ${g}" style="width:${w}%"></div></div><div class="bar-count">${counts[g]}人 (${pct}%)</div></div>`;
      }
      html += '</div>';
    }
    card.innerHTML = html;
    area.appendChild(card);
  }

  // 要配慮児童の状況パネル
  renderAttentionPanel(subj, units);
}

function renderAttentionPanel(subj, units) {
  const att = document.getElementById('distAttention');
  const hlStudents = state.students.filter(s => s.highlight);
  if (hlStudents.length === 0 || units.length === 0) {
    att.innerHTML = '';
    return;
  }
  // 各 highlight児童について、評価Aの数、Cの数、未評価の数を集計
  const lines = [];
  for (const s of hlStudents) {
    let aCnt = 0, cCnt = 0, noneCnt = 0, bCnt = 0;
    const aDetails = [], cDetails = [];
    for (const u of units) {
      for (const vp of state.viewpoints) {
        const cur = getLatestRecord(subj, u.id, vp.id, s.id);
        if (!cur) { noneCnt++; continue; }
        if (cur.grade === 'A') { aCnt++; aDetails.push(`${u.name}${vp.short}`); }
        else if (cur.grade === 'B') bCnt++;
        else if (cur.grade === 'C') { cCnt++; cDetails.push(`${u.name}${vp.short}`); }
      }
    }
    lines.push({ s, aCnt, bCnt, cCnt, noneCnt, aDetails, cDetails });
  }
  // C取得児童
  const withC = lines.filter(l => l.cCnt > 0);
  // A取得児童
  const withA = lines.filter(l => l.aCnt > 0);

  let html = '<h3>要配慮児童 の状況（' + escapeHtml(getSubjectLabel(subj)) + '）</h3>';
  html += `<div class="att-block"><b>Aを取った子 (${withA.length}人):</b>`;
  if (withA.length === 0) {
    html += '<div class="att-empty">該当なし</div>';
  } else {
    html += '<ul class="att-list">';
    for (const l of withA) {
      html += `<li>${escapeHtml(l.s.name)} — A:${l.aCnt}件 (${l.aDetails.slice(0, 3).map(escapeHtml).join(', ')}${l.aDetails.length > 3 ? '...' : ''})</li>`;
    }
    html += '</ul>';
  }
  html += '</div>';

  html += `<div class="att-block"><b>Cを取った子 (${withC.length}人):</b>`;
  if (withC.length === 0) {
    html += '<div class="att-empty">該当なし</div>';
  } else {
    html += '<ul class="att-list">';
    for (const l of withC) {
      html += `<li>${escapeHtml(l.s.name)} — C:${l.cCnt}件 (${l.cDetails.slice(0, 3).map(escapeHtml).join(', ')}${l.cDetails.length > 3 ? '...' : ''})</li>`;
    }
    html += '</ul>';
  }
  html += '</div>';

  // 未評価が多い子
  const manyNone = lines.filter(l => l.noneCnt >= units.length).slice(0, 5);
  if (manyNone.length > 0) {
    html += `<div class="att-block"><b>未評価が多い要配慮児童 (${manyNone.length}人):</b><ul class="att-list">`;
    for (const l of manyNone) {
      html += `<li>${escapeHtml(l.s.name)} — 未評価 ${l.noneCnt}件</li>`;
    }
    html += '</ul></div>';
  }

  att.innerHTML = html;
}

// ========== History tab ==========
function initHistoryFilters() {
  const sel1 = document.getElementById('historyStudent');
  for (const s of state.students) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel1.appendChild(opt);
  }
  const sel2 = document.getElementById('historySubject');
  for (const subj of state.subjects) {
    const opt = document.createElement('option');
    opt.value = subj.id;
    opt.textContent = subj.label;
    sel2.appendChild(opt);
  }
  const sel3 = document.getElementById('historyViewpoint');
  for (const vp of state.viewpoints) {
    const opt = document.createElement('option');
    opt.value = vp.id;
    opt.textContent = vp.label;
    sel3.appendChild(opt);
  }
  ['historyStudent', 'historySubject', 'historyViewpoint', 'historyShowSuperseded'].forEach(id => {
    document.getElementById(id).addEventListener('change', refreshHistory);
  });
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedRecords);
}

function refreshHistory() {
  const sid = document.getElementById('historyStudent').value;
  const subj = document.getElementById('historySubject').value;
  const vp = document.getElementById('historyViewpoint').value;
  const showSup = document.getElementById('historyShowSuperseded').value === '1';

  let recs = state.records.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (sid) recs = recs.filter(r => r.studentId === parseInt(sid));
  if (subj) recs = recs.filter(r => r.subject === subj);
  if (vp) recs = recs.filter(r => r.viewpoint === vp);
  if (!showSup) recs = recs.filter(r => !r.superseded);

  document.getElementById('historyInfo').textContent = `${recs.length}件`;

  state.ui.selectedHistoryIds.clear();
  document.getElementById('deleteSelectedBtn').disabled = true;

  const LIMIT = 500;
  const displayed = recs.slice(0, LIMIT);
  const truncated = recs.length > LIMIT;

  let html = `
    <thead>
      <tr>
        <th><input type="checkbox" id="histAll"></th>
        <th>日時</th>
        <th>教科</th>
        <th>単元</th>
        <th>観点</th>
        <th>児童</th>
        <th>評価</th>
        <th>状態</th>
      </tr>
    </thead><tbody>
  `;
  for (const r of displayed) {
    const cls = r.superseded ? 'superseded' : '';
    const stateLabel = r.superseded ? '<span class="muted">上書き済</span>' : '<b>最新</b>';
    html += `
      <tr class="${cls}">
        <td><input type="checkbox" class="hist-check" data-id="${escapeHtml(r.id)}"></td>
        <td>${escapeHtml(formatDateTime(r.timestamp))}</td>
        <td>${escapeHtml(getSubjectLabel(r.subject))}</td>
        <td>${escapeHtml(getUnitName(r.unitId))}</td>
        <td>${escapeHtml(getViewpointShort(r.viewpoint))} ${escapeHtml(getViewpointLabel(r.viewpoint))}</td>
        <td>${escapeHtml(getStudentName(r.studentId))}</td>
        <td class="grade-cell ${r.grade}">${r.grade}</td>
        <td>${stateLabel}</td>
      </tr>
    `;
  }
  if (truncated) {
    html += `<tr><td colspan="8" class="muted" style="text-align:center;padding:10px">…他${recs.length - LIMIT}件（フィルタで絞り込んでください）</td></tr>`;
  }
  if (displayed.length === 0) {
    html += `<tr><td colspan="8" class="muted" style="text-align:center;padding:14px">該当する記録がありません</td></tr>`;
  }
  html += '</tbody>';
  document.getElementById('historyTable').innerHTML = html;

  document.getElementById('histAll')?.addEventListener('change', e => {
    const checked = e.target.checked;
    document.querySelectorAll('.hist-check').forEach(cb => {
      cb.checked = checked;
      if (checked) state.ui.selectedHistoryIds.add(cb.dataset.id);
    });
    if (!checked) state.ui.selectedHistoryIds.clear();
    document.getElementById('deleteSelectedBtn').disabled = state.ui.selectedHistoryIds.size === 0;
  });
  document.querySelectorAll('.hist-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.ui.selectedHistoryIds.add(cb.dataset.id);
      else state.ui.selectedHistoryIds.delete(cb.dataset.id);
      document.getElementById('deleteSelectedBtn').disabled = state.ui.selectedHistoryIds.size === 0;
    });
  });
}

function deleteSelectedRecords() {
  const n = state.ui.selectedHistoryIds.size;
  if (n === 0) return;
  if (!confirm(`${n}件の記録を完全に削除します。\n（履歴も含めて消えます。元に戻せません）\nよろしいですか？`)) return;

  // 削除する記録に対応する subject/unit/vp/student で、最新が消える場合は次に新しい superseded を最新化
  const toDelete = state.records.filter(r => state.ui.selectedHistoryIds.has(r.id));
  state.records = state.records.filter(r => !state.ui.selectedHistoryIds.has(r.id));
  // 各キーの最新を再計算
  const groupKeys = new Set();
  for (const d of toDelete) {
    groupKeys.add(`${d.subject}|${d.unitId}|${d.viewpoint}|${d.studentId}`);
  }
  for (const key of groupKeys) {
    const [subject, unitId, viewpoint, sid] = key.split('|');
    const studentId = parseInt(sid);
    const group = state.records.filter(r =>
      r.subject === subject && r.unitId === unitId && r.viewpoint === viewpoint && r.studentId === studentId
    ).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (group.length > 0) {
      // 全部supersededになっている場合は先頭を復活
      const hasActive = group.some(r => !r.superseded);
      if (!hasActive) group[0].superseded = false;
    }
  }
  state.ui.selectedHistoryIds.clear();
  saveState();
  showToast(`${n}件削除しました`);
  refreshHistory();
  updateHealthBadge();
  if (state.ui.currentTab === 'record') renderStudentGrid();
}

// ========== Unit Management tab ==========
function initUnitMgmtEvents() {
  const sel = document.getElementById('unitMgmtSubject');
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = 'すべての教科';
  sel.appendChild(opt0);
  for (const subj of state.subjects) {
    const opt = document.createElement('option');
    opt.value = subj.id;
    opt.textContent = subj.label;
    sel.appendChild(opt);
  }
  ['unitMgmtSubject', 'unitMgmtShowArchived'].forEach(id => {
    document.getElementById(id).addEventListener('change', refreshUnitList);
  });
  document.getElementById('addUnitBtn').addEventListener('click', () => openUnitModal(null));

  // モーダル
  const subjFormSel = document.getElementById('unitFormSubject');
  for (const subj of state.subjects) {
    const opt = document.createElement('option');
    opt.value = subj.id;
    opt.textContent = subj.label;
    subjFormSel.appendChild(opt);
  }
  document.getElementById('unitFormCancelBtn').addEventListener('click', closeUnitModal);
  document.getElementById('unitFormSaveBtn').addEventListener('click', saveUnitFromModal);
  document.getElementById('unitModal').addEventListener('click', e => {
    if (e.target.id === 'unitModal') closeUnitModal();
  });
}

let editingUnitId = null;

function openUnitModal(unitId, defaultSubject = null) {
  editingUnitId = unitId;
  const u = unitId ? getUnit(unitId) : null;
  document.getElementById('unitModalTitle').textContent = u ? '単元を編集' : '単元を追加';
  document.getElementById('unitFormSubject').value = u ? u.subject : (defaultSubject || state.ui.currentSubject);
  document.getElementById('unitFormName').value = u ? u.name : '';
  document.getElementById('unitFormKnowledge').value = u ? (u.criteria.knowledge || '') : '';
  document.getElementById('unitFormThinking').value = u ? (u.criteria.thinking || '') : '';
  document.getElementById('unitFormAttitude').value = u ? (u.criteria.attitude || '') : '';
  document.getElementById('unitModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('unitFormName').focus(), 50);
}

function closeUnitModal() {
  editingUnitId = null;
  document.getElementById('unitModal').classList.add('hidden');
}

function saveUnitFromModal() {
  const subject = document.getElementById('unitFormSubject').value;
  const name = document.getElementById('unitFormName').value.trim();
  if (!name) { showToast('単元名を入力してください', 'error'); return; }
  if (!subject) { showToast('教科を選択してください', 'error'); return; }
  const criteria = {
    knowledge: document.getElementById('unitFormKnowledge').value.trim(),
    thinking:  document.getElementById('unitFormThinking').value.trim(),
    attitude:  document.getElementById('unitFormAttitude').value.trim()
  };
  if (editingUnitId) {
    const u = getUnit(editingUnitId);
    if (u) {
      u.subject = subject;
      u.name = name;
      u.criteria = criteria;
    }
    showToast(`単元「${name}」を更新しました`);
  } else {
    const u = {
      id: uuid(),
      subject,
      name,
      criteria,
      created_at: new Date().toISOString(),
      archived: false
    };
    state.units.push(u);
    // 新規追加: 現在の教科が一致すれば現在の単元として選択
    if (state.ui.currentSubject === subject) {
      state.ui.currentUnitId = u.id;
    }
    showToast(`単元「${name}」を追加しました`);
  }
  saveState();
  closeUnitModal();
  if (state.ui.currentTab === 'units') refreshUnitList();
  if (state.ui.currentTab === 'record') {
    renderUnitSelect();
    renderCriteriaCard();
    renderStudentGrid();
  }
}

function refreshUnitList() {
  const subjFilter = document.getElementById('unitMgmtSubject').value;
  const showArchived = document.getElementById('unitMgmtShowArchived').value === '1';
  let units = state.units.slice();
  if (subjFilter) units = units.filter(u => u.subject === subjFilter);
  if (!showArchived) units = units.filter(u => !u.archived);
  // 教科順にソート
  const subjOrder = state.subjects.map(s => s.id);
  units.sort((a, b) => {
    const i1 = subjOrder.indexOf(a.subject);
    const i2 = subjOrder.indexOf(b.subject);
    if (i1 !== i2) return i1 - i2;
    return a.name.localeCompare(b.name, 'ja');
  });

  const list = document.getElementById('unitList');
  list.innerHTML = '';
  if (units.length === 0) {
    list.innerHTML = '<div class="muted" style="padding:14px;text-align:center">単元がありません。「＋ 新しい単元を追加」から追加してください。</div>';
    return;
  }

  for (const u of units) {
    const card = document.createElement('div');
    card.className = 'unit-card' + (u.archived ? ' archived' : '');
    card.style.setProperty('--subject-color', getSubjectColor(u.subject));

    // 評価件数を計算
    const recCount = state.records.filter(r => !r.superseded && r.unitId === u.id).length;
    const hasRecords = recCount > 0;

    let html = `
      <div class="unit-card-header">
        <span class="unit-name">${escapeHtml(u.name)}</span>
        <span class="subject-tag">${escapeHtml(getSubjectLabel(u.subject))}</span>
      </div>
    `;
    for (const vp of state.viewpoints) {
      const t = u.criteria[vp.id] || '';
      const cls = t ? '' : 'empty';
      html += `<div class="vp-criteria" data-vp="${vp.id}"><span class="vp-tag">${escapeHtml(vp.short)}</span><span class="vp-text ${cls}">${escapeHtml(t || '（未設定）')}</span></div>`;
    }
    // 要配慮児童の評価ピックアップ
    const hlEvalsByVp = {};
    for (const vp of state.viewpoints) {
      const list2 = [];
      for (const s of state.students.filter(x => x.highlight)) {
        const cur = getLatestRecord(u.subject, u.id, vp.id, s.id);
        if (cur) list2.push(`${s.name}:${cur.grade}`);
      }
      if (list2.length > 0) hlEvalsByVp[vp.id] = list2;
    }
    let hlText = '';
    if (Object.keys(hlEvalsByVp).length > 0) {
      const arr = [];
      for (const vp of state.viewpoints) {
        if (hlEvalsByVp[vp.id]) arr.push(`${vp.short}[${hlEvalsByVp[vp.id].slice(0, 3).join(', ')}${hlEvalsByVp[vp.id].length > 3 ? '...' : ''}]`);
      }
      hlText = `<span class="att-list">配慮児: ${arr.join(' ')}</span>`;
    }
    html += `<div class="stat-line"><span>評価${recCount}件 / 作成 ${u.created_at.slice(0, 10)}${u.archived ? ' / アーカイブ' : ''}</span>${hlText}</div>`;

    html += '<div class="unit-card-actions">';
    html += `<button class="ghost small" data-act="edit" data-id="${escapeHtml(u.id)}">編集</button>`;
    html += `<button class="ghost small" data-act="duplicate" data-id="${escapeHtml(u.id)}">複製</button>`;
    if (u.archived) {
      html += `<button class="ghost small" data-act="unarchive" data-id="${escapeHtml(u.id)}">アーカイブ解除</button>`;
    } else {
      html += `<button class="ghost small" data-act="archive" data-id="${escapeHtml(u.id)}">アーカイブ</button>`;
    }
    if (!hasRecords) {
      html += `<button class="ghost small danger" data-act="delete" data-id="${escapeHtml(u.id)}">削除</button>`;
    }
    html += '</div>';
    card.innerHTML = html;
    list.appendChild(card);
  }

  list.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      handleUnitAction(id, act);
    });
  });
}

function handleUnitAction(id, act) {
  const u = getUnit(id);
  if (!u) return;
  if (act === 'edit') {
    openUnitModal(id);
  } else if (act === 'duplicate') {
    const copy = {
      id: uuid(),
      subject: u.subject,
      name: u.name + ' (コピー)',
      criteria: { ...u.criteria },
      created_at: new Date().toISOString(),
      archived: false
    };
    state.units.push(copy);
    saveState();
    showToast(`「${copy.name}」を作成しました`);
    refreshUnitList();
    if (state.ui.currentTab === 'record') renderUnitSelect();
  } else if (act === 'archive') {
    if (!confirm(`単元「${u.name}」をアーカイブしますか？\n記録タブの単元一覧から非表示になります。\n（評価データは残ります）`)) return;
    u.archived = true;
    saveState();
    if (state.ui.currentUnitId === u.id) {
      state.ui.currentUnitId = null;
      ensureValidUnitSelection();
    }
    refreshUnitList();
    if (state.ui.currentTab === 'record') {
      renderUnitSelect();
      renderCriteriaCard();
      renderStudentGrid();
    }
    showToast(`「${u.name}」をアーカイブしました`);
  } else if (act === 'unarchive') {
    u.archived = false;
    saveState();
    refreshUnitList();
    if (state.ui.currentTab === 'record') renderUnitSelect();
    showToast(`「${u.name}」をアーカイブ解除しました`);
  } else if (act === 'delete') {
    const recCount = state.records.filter(r => r.unitId === u.id).length;
    if (recCount > 0) {
      showToast('評価記録のある単元は削除できません（アーカイブのみ）', 'error');
      return;
    }
    if (!confirm(`単元「${u.name}」を完全に削除しますか？`)) return;
    state.units = state.units.filter(x => x.id !== u.id);
    saveState();
    if (state.ui.currentUnitId === u.id) {
      state.ui.currentUnitId = null;
      ensureValidUnitSelection();
    }
    refreshUnitList();
    if (state.ui.currentTab === 'record') {
      renderUnitSelect();
      renderCriteriaCard();
      renderStudentGrid();
    }
    showToast(`「${u.name}」を削除しました`);
  }
}

// ========== Settings ==========
function initSettingsEvents() {
  document.getElementById('exportBtn').addEventListener('click', exportJSON);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) importJSON(f);
    e.target.value = '';
  });
  document.getElementById('exportCsvBtn').addEventListener('click', exportAllCSV);
  document.getElementById('exportFukutanninBtn').addEventListener('click', exportFukutanninJSON);
  document.getElementById('resetBtn').addEventListener('click', resetAll);
}

function refreshSettings() {
  const active = state.records.filter(r => !r.superseded);
  document.getElementById('statsTotal').textContent = active.length;
  document.getElementById('statsTotalRaw').textContent = state.records.length;
  document.getElementById('statsUnits').textContent = state.units.filter(u => !u.archived).length;
  const dates = new Set(active.map(r => r.date));
  document.getElementById('statsDays').textContent = dates.size;
  const studentSet = new Set(active.map(r => r.studentId));
  document.getElementById('statsStudents').textContent = studentSet.size;
  if (active.length > 0) {
    const sorted = active.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    document.getElementById('statsFirstDate').textContent = sorted[0].date;
    document.getElementById('statsLastDate').textContent = sorted[sorted.length - 1].date;
  } else {
    document.getElementById('statsFirstDate').textContent = '—';
    document.getElementById('statsLastDate').textContent = '—';
  }

  // 教科別集計
  const subjStats = document.getElementById('subjectStatsTable');
  let html = '<tr><th style="text-align:left">教科</th><th>単元</th><th>評価</th><th>A</th><th>B</th><th>C</th></tr>';
  for (const subj of state.subjects) {
    const units = state.units.filter(u => u.subject === subj.id && !u.archived).length;
    const recs = active.filter(r => r.subject === subj.id);
    const a = recs.filter(r => r.grade === 'A').length;
    const b = recs.filter(r => r.grade === 'B').length;
    const c = recs.filter(r => r.grade === 'C').length;
    html += `<tr><td style="text-align:left"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${subj.color};margin-right:6px"></span>${escapeHtml(subj.label)}</td><td>${units}</td><td>${recs.length}</td><td style="color:var(--grade-a-dark)">${a}</td><td style="color:var(--grade-b-dark)">${b}</td><td style="color:var(--grade-c-dark)">${c}</td></tr>`;
  }
  subjStats.innerHTML = html;
}

function exportJSON() {
  const data = {
    version: APP_VERSION,
    exported_at: new Date().toISOString(),
    class: window.APP_DATA.class,
    school: window.APP_DATA.school,
    year: window.APP_DATA.year,
    students: state.students,
    subjects: state.subjects,
    viewpoints: state.viewpoints,
    units: state.units,
    records: state.records
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `evaluation-${todayISO()}.json`);
  try { localStorage.setItem(LAST_BACKUP_KEY, String(Date.now())); } catch (_) {}
  updateHealthBadge();
  showToast(`JSONをエクスポートしました (${state.records.length}件)`);
}

function exportFukutanninJSON() {
  // AI副担任 student-cards-enriched.json と統合できる形式
  const active = state.records.filter(r => !r.superseded);
  const byStudent = {};
  for (const s of state.students) {
    byStudent[String(s.id)] = {
      name: s.name,
      kana: s.kana,
      highlight: !!s.highlight,
      watch: !!s.watch,
      note: s.note || null,
      evaluations: {}
    };
  }
  for (const r of active) {
    const sb = byStudent[String(r.studentId)];
    if (!sb) continue;
    if (!sb.evaluations[r.subject]) sb.evaluations[r.subject] = {};
    const subjEval = sb.evaluations[r.subject];
    if (!subjEval[r.viewpoint]) subjEval[r.viewpoint] = [];
    const u = getUnit(r.unitId);
    subjEval[r.viewpoint].push({
      unit: u ? u.name : '(削除済単元)',
      unitId: r.unitId,
      grade: r.grade,
      date: r.date,
      timestamp: r.timestamp
    });
  }
  // 各観点配列を date 降順でソート
  for (const sb of Object.values(byStudent)) {
    for (const subjEval of Object.values(sb.evaluations)) {
      for (const arr of Object.values(subjEval)) {
        arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      }
    }
  }
  const data = {
    type: 'evaluation_export',
    version: 1,
    exported_at: new Date().toISOString(),
    class: window.APP_DATA.class,
    school: window.APP_DATA.school,
    year: window.APP_DATA.year,
    subjects: state.subjects,
    viewpoints: state.viewpoints,
    units: state.units.filter(u => !u.archived),
    by_student: byStudent
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `evaluation-fukutannin-${todayISO()}.json`);
  showToast('AI副担任向けJSONをエクスポートしました');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try { data = JSON.parse(e.target.result); }
    catch (err) { showToast('JSONパース失敗: ' + err.message, 'error'); return; }
    if (!data || !Array.isArray(data.records)) {
      showToast('records 配列が見つかりません', 'error'); return;
    }
    const normalizedRecs = data.records.map(normalizeRecord).filter(Boolean);
    const normalizedUnits = Array.isArray(data.units) ? data.units.map(normalizeUnit).filter(Boolean) : [];
    if (normalizedRecs.length === 0 && normalizedUnits.length === 0) {
      showToast('有効なデータが見つかりません', 'error'); return;
    }
    const append = confirm(`記録${normalizedRecs.length}件 / 単元${normalizedUnits.length}件 が見つかりました。\n\n[OK] = 既存データに追加 (重複ID除外)\n[キャンセル] = 全置換 (既存データ削除)`);
    if (append) {
      const existingRecIds = new Set(state.records.map(r => r.id));
      const newRecs = normalizedRecs.filter(r => !existingRecIds.has(r.id));
      state.records.push(...newRecs);
      const existingUnitIds = new Set(state.units.map(u => u.id));
      const newUnits = normalizedUnits.filter(u => !existingUnitIds.has(u.id));
      state.units.push(...newUnits);
      saveState();
      ensureValidUnitSelection();
      refreshAll();
      updateHealthBadge();
      showToast(`✓ 記録${newRecs.length}件 / 単元${newUnits.length}件 を追加`);
    } else {
      if (!confirm('本当に既存データを全て置き換えますか？\n念のため、現在のデータを退避エクスポートします。')) return;
      try { exportJSON(); } catch (_) {}
      state.records = normalizedRecs;
      state.units = normalizedUnits;
      ensureDefaultUnits();
      ensureValidUnitSelection();
      saveState();
      refreshAll();
      updateHealthBadge();
      showToast(`✓ 記録${normalizedRecs.length}件 / 単元${normalizedUnits.length}件 で置換`);
    }
  };
  reader.readAsText(file);
}

function exportAllCSV() {
  const rows = [['record_id','timestamp','date','subject','subject_label','unit_id','unit_name','viewpoint','viewpoint_label','student_id','student_name','grade','superseded']];
  for (const r of state.records) {
    rows.push([
      r.id, r.timestamp, r.date,
      r.subject, getSubjectLabel(r.subject),
      r.unitId, getUnitName(r.unitId),
      r.viewpoint, getViewpointLabel(r.viewpoint),
      r.studentId, getStudentName(r.studentId),
      r.grade,
      r.superseded ? '1' : '0'
    ]);
  }
  const csv = '﻿' + rows.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadFile(csv, `evaluation-all-${todayISO()}.csv`, 'text/csv;charset=utf-8');
  showToast('全データCSVをエクスポートしました');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  downloadBlob(blob, filename);
}

function resetAll() {
  const lastBackup = parseInt(localStorage.getItem(LAST_BACKUP_KEY) || '0');
  const hoursSinceBackup = lastBackup ? (Date.now() - lastBackup) / 3600000 : 999;
  if (hoursSinceBackup > 24 && state.records.length > 0) {
    showToast('まずエクスポートしてください (直近24h以内のBU必須)', 'error');
    return;
  }
  const confirmInput = prompt('全データを削除します（記録・単元の両方）。\n確認のため「DELETE」と入力してください:');
  if (confirmInput !== 'DELETE') {
    showToast('削除をキャンセルしました', 'success');
    return;
  }
  state.records = [];
  state.units = [];
  ensureDefaultUnits();
  state.ui.currentUnitId = null;
  ensureValidUnitSelection();
  state.ui.lastBulkOp = null;
  saveState();
  refreshAll();
  updateHealthBadge();
  showToast('全データを削除しました');
}

// ========== Refresh All ==========
function refreshAll() {
  if (state.ui.currentTab === 'record') {
    renderUnitSelect();
    renderCriteriaCard();
    renderStudentGrid();
  } else if (state.ui.currentTab === 'summary') refreshSummary();
  else if (state.ui.currentTab === 'distribution') refreshDistribution();
  else if (state.ui.currentTab === 'heatmap') refreshHeatmap();
  else if (state.ui.currentTab === 'growth') refreshGrowth();
  else if (state.ui.currentTab === 'history') refreshHistory();
  else if (state.ui.currentTab === 'units') refreshUnitList();
  else if (state.ui.currentTab === 'settings') refreshSettings();
}

// ========== Keyboard Shortcuts ==========
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // モーダル類
    const helpModal = document.getElementById('helpModal');
    const unitModal = document.getElementById('unitModal');
    const popover = document.getElementById('studentPopoverBackdrop');

    if (helpModal && !helpModal.classList.contains('hidden')) {
      if (e.key === 'Escape') { helpModal.classList.add('hidden'); e.preventDefault(); }
      return;
    }
    if (unitModal && !unitModal.classList.contains('hidden')) {
      if (e.key === 'Escape') { closeUnitModal(); e.preventDefault(); }
      return;
    }
    if (popover && !popover.classList.contains('hidden')) {
      if (e.key === 'Escape') { closeStudentPopover(); e.preventDefault(); }
      return;
    }

    // Shift+? でヘルプ
    if (e.key === '?' && e.shiftKey) {
      e.preventDefault();
      helpModal.classList.remove('hidden');
      return;
    }

    // Ctrl+Z = 取消（全タブで有効）
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undoLastOp();
      return;
    }

    // 記録タブ以外はここまで
    if (state.ui.currentTab !== 'record') return;

    // Esc = フォーカスクリア
    if (e.key === 'Escape') {
      e.preventDefault();
      state.ui.focusStudentId = null;
      document.querySelectorAll('.student-card').forEach(c => c.classList.remove('kbd-focus'));
      state.ui.numBuf = '';
      clearTimeout(state.ui.numTimer);
      return;
    }

    // F1〜F3 = 観点切替
    if (/^F[1-3]$/.test(e.key)) {
      const idx = parseInt(e.key.slice(1)) - 1;
      const vp = state.viewpoints[idx];
      if (vp) {
        e.preventDefault();
        state.ui.currentViewpoint = vp.id;
        // 児童軸モードでは観点切替に意味があまりないので観点軸モードへ
        if (state.ui.currentMode !== 'viewpoint') {
          state.ui.currentMode = 'viewpoint';
          applyModeUI();
        }
        renderViewpointTabs();
        renderCriteriaCard();
        renderStudentGrid();
        saveState();
        showToast(`観点: ${vp.label}`, 'success');
      }
      return;
    }

    // Tab = モード切替
    if (e.key === 'Tab' && !e.ctrlKey) {
      e.preventDefault();
      state.ui.currentMode = state.ui.currentMode === 'viewpoint' ? 'student' : 'viewpoint';
      applyModeUI();
      renderStudentGrid();
      saveState();
      showToast(`モード: ${state.ui.currentMode === 'viewpoint' ? '観点軸' : '児童軸'}`, 'success');
      return;
    }

    // Space = 次の未評価へ
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      moveToNextUnevaluated();
      return;
    }

    // A/B/C = 評価入力（フォーカス児童）
    if (state.ui.focusStudentId !== null && /^[abcABC]$/.test(e.key)) {
      e.preventDefault();
      const g = e.key.toUpperCase();
      if (state.ui.currentMode === 'viewpoint') {
        setGrade(state.ui.focusStudentId, state.ui.currentViewpoint, g);
        // 入力後、次の未評価児童へ自動移動
        setTimeout(() => moveToNextUnevaluated(), 50);
      } else {
        // 児童軸モード: ポップオーバーがない場合は知識観点に入力（簡易）
        setGrade(state.ui.focusStudentId, 'knowledge', g);
      }
      return;
    }

    // 数字 = 児童選択
    if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      handleNumKey(e.key);
      return;
    }
  });
}

function moveToNextUnevaluated() {
  if (state.ui.currentMode !== 'viewpoint') return;
  const subj = state.ui.currentSubject;
  const unit = state.ui.currentUnitId;
  const vp = state.ui.currentViewpoint;
  if (!unit) return;
  const sortedStudents = state.students;
  let startIdx = 0;
  if (state.ui.focusStudentId !== null) {
    const i = sortedStudents.findIndex(s => s.id === state.ui.focusStudentId);
    if (i >= 0) startIdx = (i + 1) % sortedStudents.length;
  }
  // 未評価児童を startIdx から検索
  for (let off = 0; off < sortedStudents.length; off++) {
    const s = sortedStudents[(startIdx + off) % sortedStudents.length];
    const cur = getLatestRecord(subj, unit, vp, s.id);
    if (!cur) {
      setFocusStudent(s.id);
      // スクロール
      const card = document.querySelector(`.student-card[data-student-id="${s.id}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
  }
  showToast('全員評価済みです', 'success');
}

function handleNumKey(d) {
  state.ui.numBuf += d;
  clearTimeout(state.ui.numTimer);
  const n = parseInt(state.ui.numBuf);
  if (state.ui.numBuf.length === 1) {
    if (n >= 3 && n <= 9) {
      state.ui.numBuf = '';
      onStudentNumKey(n);
    } else {
      // 0,1,2 → 350ms待つ
      const buffered = state.ui.numBuf;
      state.ui.numTimer = setTimeout(() => {
        const id = parseInt(buffered);
        state.ui.numBuf = '';
        if (id >= 1 && id <= 28) onStudentNumKey(id);
      }, 350);
    }
  } else if (state.ui.numBuf.length === 2) {
    state.ui.numBuf = '';
    if (n >= 1 && n <= 28) onStudentNumKey(n);
  }
}

function onStudentNumKey(id) {
  if (state.ui.currentMode === 'student') {
    openStudentPopover(id);
  } else {
    setFocusStudent(id);
    const card = document.querySelector(`.student-card[data-student-id="${id}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ========== Help Modal ==========
function initHelpModal() {
  const modal = document.getElementById('helpModal');
  document.getElementById('helpBtn').addEventListener('click', () => {
    modal.classList.remove('hidden');
  });
  document.getElementById('closeHelpBtn').addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

// ========== C連続アラート ==========
function checkCAlerts() {
  const banner = document.getElementById('alertBanner');
  if (!banner) return;

  const alerts = [];

  // 1) 同教科・同観点で C が3回以上連続している場合
  // キーを subject|vp|studentId とし、各キーの時系列評価を取得
  const keyMap = {};
  for (const r of state.records) {
    if (r.superseded) continue;
    const key = `${r.subject}|${r.viewpoint}|${r.studentId}`;
    if (!keyMap[key]) keyMap[key] = [];
    keyMap[key].push(r);
  }
  for (const [key, recs] of Object.entries(keyMap)) {
    const [subj, vp, sid] = key.split('|');
    // 時系列昇順
    recs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let consecutive = 0;
    for (const r of recs) {
      if (r.grade === 'C') consecutive++;
      else consecutive = 0;
    }
    if (consecutive >= 3) {
      alerts.push({
        type: 'consecutive',
        name: getStudentName(parseInt(sid)),
        subjectLabel: getSubjectLabel(subj),
        vpLabel: getViewpointLabel(vp),
        count: consecutive,
        text: `${getStudentName(parseInt(sid))}さんは「${getSubjectLabel(subj)} ${getViewpointShort(vp)}」でCが${consecutive}回連続。要支援。`
      });
    }
  }

  // 2) 教科を超えて C が5件以上累積している児童
  const cByStudent = {};
  for (const r of state.records) {
    if (r.superseded || r.grade !== 'C') continue;
    if (!cByStudent[r.studentId]) cByStudent[r.studentId] = 0;
    cByStudent[r.studentId]++;
  }
  for (const [sid, cnt] of Object.entries(cByStudent)) {
    if (cnt >= 5) {
      const existing = alerts.find(a => a.name === getStudentName(parseInt(sid)) && a.type === 'cumulative');
      if (!existing) {
        alerts.push({
          type: 'cumulative',
          name: getStudentName(parseInt(sid)),
          count: cnt,
          text: `${getStudentName(parseInt(sid))}さんは教科横断でCが累計${cnt}件。全体的に要注意。`
        });
      }
    }
  }

  if (alerts.length === 0) {
    banner.className = 'alert-banner hidden';
    return;
  }

  const hasCritical = alerts.some(a => a.count >= 4 || a.type === 'cumulative');
  banner.className = 'alert-banner' + (hasCritical ? ' has-critical' : '');
  let html = '';
  for (const a of alerts) {
    html += `<div class="alert-item"><span class="alert-icon">⚠</span><span class="alert-text"><b>${escapeHtml(a.text)}</b></span></div>`;
  }
  html += `<div class="alert-item"><span class="alert-text muted" style="font-size:11px">（このバナーは起動時に自動検出。評価を記録するたびに更新されます）</span><button class="alert-dismiss" onclick="document.getElementById('alertBanner').classList.add('hidden')" title="バナーを閉じる">×</button></div>`;
  banner.innerHTML = html;
}

// ========== ヒートマップ ==========
function initHeatmapFilters() {
  const sel = document.getElementById('hmSubject');
  for (const subj of state.subjects) {
    const opt = document.createElement('option');
    opt.value = subj.id;
    opt.textContent = subj.label;
    sel.appendChild(opt);
  }
  sel.value = state.ui.currentSubject;
  sel.addEventListener('change', refreshHeatmap);
  document.getElementById('hmIncludeArchived').addEventListener('change', refreshHeatmap);
  document.getElementById('hmLatestOnly').addEventListener('change', refreshHeatmap);
}

function refreshHeatmap() {
  const subj = document.getElementById('hmSubject').value;
  const includeArchived = document.getElementById('hmIncludeArchived').checked;
  const latestOnly = document.getElementById('hmLatestOnly').checked;
  const wrap = document.getElementById('heatmapWrap');

  let units = state.units.filter(u => u.subject === subj);
  if (!includeArchived) units = units.filter(u => !u.archived);
  if (units.length === 0) {
    wrap.innerHTML = '<div class="muted" style="padding:24px;text-align:center">この教科に単元がありません</div>';
    document.getElementById('hmInfo').textContent = '0単元';
    return;
  }

  document.getElementById('hmInfo').textContent = `${units.length}単元 × 3観点 = ${units.length * 3}列`;

  // ヘッダ行1: 単元名（colspan=3）
  // ヘッダ行2: 知/思/態
  let html = '<table class="heatmap-table"><thead>';
  html += '<tr><th class="hm-name-col" rowspan="2">児童</th>';
  units.forEach((u, i) => {
    const sep = i > 0 ? 'style="border-left:2px solid var(--border)"' : '';
    html += `<th colspan="3" class="hm-unit-header" ${sep}>${escapeHtml(u.name)}</th>`;
  });
  html += '</tr><tr>';
  for (const u of units) {
    for (const vp of state.viewpoints) {
      const title = `${u.name} / ${vp.label}${u.criteria[vp.id] ? '\n' + u.criteria[vp.id] : ''}`;
      html += `<th class="hm-vp-header" title="${escapeHtml(title)}"><span class="hm-vp-label" style="color:${vpColorVar(vp.id) === 'var(--grade-b)' ? '#2f6db5' : vpColorVar(vp.id) === 'var(--grade-a)' ? '#3d8b40' : '#c98621'}">${escapeHtml(vp.short)}</span></th>`;
    }
  }
  html += '</tr></thead><tbody>';

  for (const s of state.students) {
    const rowCls = s.highlight ? 'hm-highlight' : (s.watch ? 'hm-watch' : '');
    html += `<tr class="${rowCls}"><td class="hm-name-col"><span class="hm-num">${s.id}</span>${escapeHtml(s.name)}</td>`;
    units.forEach((u, i) => {
      const sep = i > 0 ? ' hm-unit-sep' : '';
      for (const vp of state.viewpoints) {
        let grade = null;
        if (latestOnly) {
          const cur = getLatestRecord(subj, u.id, vp.id, s.id);
          grade = cur ? cur.grade : null;
        } else {
          // 全履歴の最後を使う（latestOnly=false でも最新1件）
          const cur = getLatestRecord(subj, u.id, vp.id, s.id);
          grade = cur ? cur.grade : null;
        }
        const cls = grade ? `hm-${grade}` : 'hm-none';
        const label = grade || '—';
        const title = `${s.name} / ${u.name} / ${vp.label}: ${grade || '未評価'}`;
        html += `<td class="hm-cell ${cls}${sep}" title="${escapeHtml(title)}">${label}</td>`;
      }
    });
    html += '</tr>';
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

// ========== 成長推移グラフ ==========
function initGrowthFilters() {
  const sel = document.getElementById('growthStudent');
  for (const s of state.students) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  }
  sel.value = state.students[0] ? state.students[0].id : '';

  const subjSel = document.getElementById('growthSubject');
  for (const subj of state.subjects) {
    const opt = document.createElement('option');
    opt.value = subj.id;
    opt.textContent = subj.label;
    subjSel.appendChild(opt);
  }
  sel.addEventListener('change', refreshGrowth);
  subjSel.addEventListener('change', refreshGrowth);
}

function refreshGrowth() {
  const sid = parseInt(document.getElementById('growthStudent').value);
  const subjFilter = document.getElementById('growthSubject').value;
  const s = getStudent(sid);
  if (!s) return;

  const area = document.getElementById('growthChartArea');
  area.innerHTML = '';

  // 対象教科
  const subjects = subjFilter ? state.subjects.filter(x => x.id === subjFilter) : state.subjects;

  // C連続・最近A増加の検出（アラートパネル）
  const alertPanel = document.getElementById('growthAlertPanel');
  const growthAlerts = detectGrowthAlerts(sid);
  if (growthAlerts.length > 0) {
    alertPanel.className = 'growth-alert-panel';
    alertPanel.innerHTML = `<h4>📊 ${escapeHtml(s.name)} さんの傾向アラート</h4><ul class="growth-alert-list">${growthAlerts.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`;
  } else {
    alertPanel.className = 'growth-alert-panel hidden';
  }

  // 全児童のCアラートランキングも表示
  if (!subjFilter) {
    renderGrowthRanking(area);
  }

  // 各教科のグラフ
  for (const subj of subjects) {
    const units = state.units.filter(u => u.subject === subj.id && !u.archived);
    if (units.length === 0) continue;

    // 時系列データ: 単元×観点 のポイント列（単元は created_at でソート）
    const sortedUnits = units.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));

    // 観点ごとのスコア列を構築
    const series = {}; // vp.id => [{label, score, unitName}]
    for (const vp of state.viewpoints) {
      series[vp.id] = [];
      for (const u of sortedUnits) {
        const cur = getLatestRecord(subj.id, u.id, vp.id, sid);
        const score = cur ? (cur.grade === 'A' ? 1 : cur.grade === 'B' ? 0 : -1) : null;
        series[vp.id].push({ label: u.name, score, grade: cur ? cur.grade : null });
      }
    }

    // データが全て null なら skip
    const hasData = state.viewpoints.some(vp => series[vp.id].some(p => p.score !== null));
    if (!hasData) continue;

    const card = document.createElement('div');
    card.className = 'growth-chart-card';
    const svgHtml = buildGrowthSVG(series, sortedUnits, subj);
    card.innerHTML = `<h4><span class="subj-dot" style="background:${escapeHtml(subj.color)}"></span>${escapeHtml(subj.label)}</h4>${svgHtml}`;
    area.appendChild(card);
  }

  if (area.children.length === 0) {
    area.innerHTML = '<div class="muted" style="padding:24px;text-align:center">評価データがありません</div>';
  }

  document.getElementById('growthInfo').textContent = `${s.name}`;
}

function buildGrowthSVG(series, sortedUnits, subj) {
  const W = Math.max(300, sortedUnits.length * 80 + 80);
  const H = 160;
  const PAD = { top: 20, right: 20, bottom: 50, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = sortedUnits.length;

  // Y軸: -1=C, 0=B, 1=A
  const yScale = (v) => PAD.top + innerH * (1 - (v + 1) / 2);
  const xScale = (i) => n <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (n - 1)) * innerW;

  const vpColors = { knowledge: '#2f6db5', thinking: '#3d8b40', attitude: '#c98621' };
  const vpLabels = { knowledge: '知', thinking: '思', attitude: '態' };

  let svg = `<div class="growth-svg-wrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  // グリッド線 + ラベル
  for (const [score, label] of [[1, 'A'], [0, 'B'], [-1, 'C']]) {
    const y = yScale(score);
    const color = score === 1 ? '#3d8b40' : score === 0 ? '#4a90e2' : '#c98621';
    svg += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" class="growth-grid-line"/>`;
    svg += `<text x="${PAD.left - 4}" y="${y + 4}" text-anchor="end" class="growth-axis-label" fill="${color}">${label}</text>`;
  }

  // X軸ラベル
  for (let i = 0; i < n; i++) {
    const x = xScale(i);
    const name = sortedUnits[i].name.length > 6 ? sortedUnits[i].name.slice(0, 5) + '…' : sortedUnits[i].name;
    svg += `<text x="${x}" y="${H - PAD.bottom + 14}" text-anchor="middle" class="growth-axis-label">${escapeHtml(name)}</text>`;
  }

  // 折れ線（観点ごと）
  for (const vp of state.viewpoints) {
    const points = series[vp.id];
    const color = vpColors[vp.id] || '#999';
    // 有効点のみで線を引く（null をスキップ）
    const validPts = points.map((p, i) => p.score !== null ? { x: xScale(i), y: yScale(p.score), p } : null).filter(Boolean);
    if (validPts.length < 1) continue;

    // 移動平均（窓2）
    const smoothed = validPts.map((pt, i) => {
      if (i === 0) return pt;
      const avg = (pt.p.score + validPts[i - 1].p.score) / 2;
      return { ...pt, ySm: yScale(avg) };
    });

    // 折れ線
    if (validPts.length >= 2) {
      const d = validPts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
      svg += `<path d="${d}" class="growth-trend-line" stroke="${color}" stroke-dasharray="none" opacity="0.8"/>`;
    }

    // ドット＆ラベル
    for (const pt of validPts) {
      svg += `<circle cx="${pt.x}" cy="${pt.y}" r="5" fill="${color}" stroke="white" stroke-width="1.5"/>`;
      svg += `<text x="${pt.x}" y="${pt.y - 9}" text-anchor="middle" class="growth-dot-label" fill="${color}">${pt.p.grade}</text>`;
    }
  }

  svg += '</svg></div>';

  // 凡例
  svg += '<div class="growth-legend">';
  for (const vp of state.viewpoints) {
    const color = vpColors[vp.id] || '#999';
    svg += `<span class="growth-legend-item"><span class="growth-legend-swatch" style="background:${color}"></span>${escapeHtml(getViewpointLabel(vp.id))}</span>`;
  }
  svg += '</div>';

  return svg;
}

function detectGrowthAlerts(sid) {
  const alerts = [];
  const active = state.records.filter(r => !r.superseded && r.studentId === sid);

  for (const subj of state.subjects) {
    for (const vp of state.viewpoints) {
      const recs = active.filter(r => r.subject === subj.id && r.viewpoint === vp.id)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      if (recs.length < 2) continue;

      // 最近C連続
      let consecutive = 0;
      for (const r of recs) {
        if (r.grade === 'C') consecutive++;
        else consecutive = 0;
      }
      if (consecutive >= 2) {
        alerts.push(`${getSubjectLabel(subj.id)} ${getViewpointShort(vp.id)}: Cが${consecutive}回連続 → 要支援`);
      }

      // 最近Aが増えた
      if (recs.length >= 3) {
        const recent = recs.slice(-3);
        const aCount = recent.filter(r => r.grade === 'A').length;
        if (aCount >= 2 && recs[recs.length - 1].grade === 'A') {
          alerts.push(`${getSubjectLabel(subj.id)} ${getViewpointShort(vp.id)}: 最近Aが増えています（直近${aCount}/3件）→ 成長中`);
        }
      }
    }
  }
  return alerts;
}

function renderGrowthRanking(area) {
  // 「最近Cが続く子」上位5名
  const cRanking = [];
  for (const s of state.students) {
    let maxConsec = 0;
    const active = state.records.filter(r => !r.superseded && r.studentId === s.id);
    for (const subj of state.subjects) {
      for (const vp of state.viewpoints) {
        const recs = active.filter(r => r.subject === subj.id && r.viewpoint === vp.id)
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        let consec = 0;
        for (const r of recs) {
          if (r.grade === 'C') consec++;
          else consec = 0;
        }
        if (consec > maxConsec) maxConsec = consec;
      }
    }
    if (maxConsec >= 2) cRanking.push({ s, maxConsec });
  }
  cRanking.sort((a, b) => b.maxConsec - a.maxConsec);

  // 「最近Aが増えた子」
  const aRanking = [];
  for (const s of state.students) {
    const active = state.records.filter(r => !r.superseded && r.studentId === s.id)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const recent3 = active.slice(-5);
    const aCount = recent3.filter(r => r.grade === 'A').length;
    if (aCount >= 3) aRanking.push({ s, aCount });
  }
  aRanking.sort((a, b) => b.aCount - a.aCount);

  if (cRanking.length === 0 && aRanking.length === 0) return;

  const card = document.createElement('div');
  card.className = 'growth-chart-card';
  let html = '<h4>📊 クラス全体ランキング</h4>';
  if (cRanking.length > 0) {
    html += '<div class="dist-attention" style="border-left-color:#e74c3c;margin-bottom:8px"><h3 style="color:#c0392b">⚠ C連続が多い児童（要支援上位）</h3><ul class="att-list">';
    for (const { s, maxConsec } of cRanking.slice(0, 5)) {
      html += `<li><b>${escapeHtml(s.name)}</b>: 最大${maxConsec}回連続C</li>`;
    }
    html += '</ul></div>';
  }
  if (aRanking.length > 0) {
    html += '<div class="dist-attention" style="border-left-color:#3d8b40;margin-bottom:8px"><h3 style="color:#3d8b40">✓ 最近A評価が増えた児童（成長中）</h3><ul class="att-list">';
    for (const { s, aCount } of aRanking.slice(0, 5)) {
      html += `<li><b>${escapeHtml(s.name)}</b>: 直近5件中${aCount}件A</li>`;
    }
    html += '</ul></div>';
  }
  card.innerHTML = html;
  area.insertBefore(card, area.firstChild);
}

// ========== 印刷レポート ==========
function initSummaryPrint() {
  document.getElementById('summaryPrintBtn').addEventListener('click', printStudentReports);
}

function printStudentReports() {
  const active = state.records.filter(r => !r.superseded);

  // 全教科の単元一覧（アーカイブ含む）
  const allUnits = state.units;

  let reportHtml = '<div class="print-report-area" id="printReportArea">';

  for (const s of state.students) {
    reportHtml += `<div class="report-page">`;
    reportHtml += `<div class="report-header"><h2>${escapeHtml(s.name)} <small style="font-size:12pt;font-weight:normal">（No.${s.id}）</small></h2><div class="report-meta">5年4組 観点別評価レポート　${todayISO()}${s.note ? '　備考: ' + escapeHtml(s.note) : ''}</div></div>`;

    // 教科ごとのテーブル
    for (const subj of state.subjects) {
      const units = allUnits.filter(u => u.subject === subj.id);
      const recs = active.filter(r => r.studentId === s.id && r.subject === subj.id);
      if (recs.length === 0) continue;

      reportHtml += `<div class="report-section"><h3>${escapeHtml(subj.label)}</h3>`;
      reportHtml += '<table class="report-table"><thead><tr><th class="name-col">単元</th>';
      for (const vp of state.viewpoints) {
        reportHtml += `<th>${escapeHtml(vp.short)}</th>`;
      }
      reportHtml += '</tr></thead><tbody>';

      for (const u of units) {
        const unitRecs = recs.filter(r => r.unitId === u.id);
        if (unitRecs.length === 0) continue;
        reportHtml += `<tr><td class="name-col">${escapeHtml(u.name)}</td>`;
        for (const vp of state.viewpoints) {
          const cur = getLatestRecord(subj.id, u.id, vp.id, s.id);
          reportHtml += cur
            ? `<td class="grade-${cur.grade}">${cur.grade}</td>`
            : '<td>—</td>';
        }
        reportHtml += '</tr>';
      }
      reportHtml += '</tbody></table></div>';
    }

    // 特徴コメント
    const allRecs = active.filter(r => r.studentId === s.id);
    const aCount = allRecs.filter(r => r.grade === 'A').length;
    const bCount = allRecs.filter(r => r.grade === 'B').length;
    const cCount = allRecs.filter(r => r.grade === 'C').length;
    const total = allRecs.length;
    if (total > 0) {
      const aRate = Math.round(aCount / total * 100);
      const cRate = Math.round(cCount / total * 100);
      let comment = `全${total}件評価：A ${aCount}件(${aRate}%) / B ${bCount}件 / C ${cCount}件(${cRate}%)`;
      if (aRate >= 60) comment += '　→ 全体的に高評価';
      if (cRate >= 30) comment += '　→ C評価が多め。要支援確認を。';
      const alerts = detectGrowthAlerts(s.id);
      if (alerts.length > 0) {
        comment += '<br>傾向: ' + alerts.map(escapeHtml).join('、');
      }
      reportHtml += `<div class="report-highlight">${comment}</div>`;
    }

    reportHtml += '</div>'; // report-page
  }
  reportHtml += '</div>';

  // 既存の印刷エリアを削除して置き換え
  const old = document.getElementById('printReportArea');
  if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', reportHtml);
  window.print();
  // 印刷後にクリーンアップ
  setTimeout(() => {
    const el = document.getElementById('printReportArea');
    if (el) el.remove();
  }, 2000);
  showToast('印刷ダイアログを開きました（PDFとして保存可）');
}

// ========== 交友関係データ ==========
const STORAGE_INTERACTION_KEY = 'evaluationApp_interaction_data';

function initInteractionEvents() {
  document.getElementById('importInteractionBtn').addEventListener('click', () => {
    document.getElementById('importInteractionFile').click();
  });
  document.getElementById('importInteractionFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) importInteractionData(f);
    e.target.value = '';
  });
  document.getElementById('clearInteractionBtn').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_INTERACTION_KEY);
    updateInteractionStatus();
    showToast('交友関係データをクリアしました');
  });
  updateInteractionStatus();
}

function importInteractionData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try { data = JSON.parse(e.target.result); }
    catch (err) { showToast('JSONパース失敗: ' + err.message, 'error'); return; }
    // interaction-enriched の形式を確認（students 配列 or students オブジェクトを想定）
    if (!data || typeof data !== 'object') { showToast('不正なJSON形式です', 'error'); return; }
    try {
      localStorage.setItem(STORAGE_INTERACTION_KEY, JSON.stringify(data));
    } catch (e) {
      showToast('保存失敗（容量超過の可能性）', 'error'); return;
    }
    updateInteractionStatus();
    showToast('交友関係データを取り込みました');
  };
  reader.readAsText(file);
}

function updateInteractionStatus() {
  const status = document.getElementById('interactionStatus');
  if (!status) return;
  const raw = localStorage.getItem(STORAGE_INTERACTION_KEY);
  if (!raw) {
    status.textContent = '未取り込み';
    return;
  }
  try {
    const data = JSON.parse(raw);
    const imported = data.exported_at || data.generated_at || '（日時不明）';
    status.textContent = `取込済: ${String(imported).slice(0, 10)} — 集計タブの児童欄に孤立度が表示されます`;
  } catch (_) {
    status.textContent = 'データ破損（クリアして再取り込みを推奨）';
  }
}

function getInteractionData() {
  try {
    const raw = localStorage.getItem(STORAGE_INTERACTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function getStudentInteractionInfo(studentId) {
  const data = getInteractionData();
  if (!data) return null;
  // interaction-enriched-*.json の学生データを探す
  // 形式: { students: { "1": {...}, ... } } or { students: [{id:1, ...}] }
  let entry = null;
  if (data.students) {
    if (Array.isArray(data.students)) {
      entry = data.students.find(s => String(s.id) === String(studentId) || String(s.student_id) === String(studentId));
    } else {
      entry = data.students[String(studentId)];
    }
  }
  if (!entry) return null;
  return entry;
}

// ========== Boot ==========
document.addEventListener('DOMContentLoaded', init);
