'use strict';

/* ==========================================================================
 * 5年4組 交友関係記録アプリ
 * - localStorageで記録を保管
 * - 主役→メンバー複数選択→保存(双方向反映は集計時に展開)
 * - シンプルモード / 相手×活動モード
 * ========================================================================== */

const STORAGE_KEY = 'interactionApp_v1';
const STORAGE_BACKUP_KEY = 'interactionApp_v1_backup';
const LAST_BACKUP_KEY = 'interactionApp_lastBackup';
const APP_VERSION = 1;
const ALERT_DAYS = 5;       // 未観察アラート日数
let isSaving = false;        // saveBtn連打防止

const SPECIAL_LABELS = {
  alone: '一人で',
  with_teacher: '先生と',
  other_class: '他クラスと'
};

// ========== State ==========
if (!window.APP_DATA || !Array.isArray(window.APP_DATA.students)) {
  document.body.innerHTML = '<p style="padding:20px;color:#c00">データ読込失敗。students.jsを確認してください。</p>';
  throw new Error('APP_DATA missing');
}
const state = {
  students: window.APP_DATA.students.map(s => ({ ...s })),
  scenes: window.APP_DATA.scenes.map(s => ({ ...s })),
  activities: [...window.APP_DATA.activities],
  settings: {
    sceneLabels: {},
    customActivities: null
  },
  records: [],
  praises: [],         // [{id, studentId, content, date, timestamp, scene?, deviceId?}]
  evaluations: [],     // [{id, studentId, subjectId, unitId, viewpoint, grade, scale, date, timestamp, deviceId?}]
  abaRecords: [],      // [{id, studentId, date, timestamp, slot, subject, behaviors[], antecedent, consequence, response}]
  seatingSnapshots: [],// [{id, date, label, groups: [[ids],...]}]
  subjects: (window.EVAL_DATA && window.EVAL_DATA.subjects) || [],
  viewpoints: (window.EVAL_DATA && window.EVAL_DATA.viewpoints) || [],
  units: (window.EVAL_DATA && window.EVAL_DATA.units) || [],
  ui: {
    currentTab: 'record',
    currentScene: 'break1',
    currentMode: 'simple',
    recordMode: 'interaction',  // 'interaction' | 'praise' | 'evaluation'
    praiseMarkPeriod: 'all',    // 記録グリッドの■判定基準: 'today' | 'week' | 'all'
    praiseListPeriod: 'week',   // ほめたい一覧タブのフィルタ
    praiseTargetIds: new Set(), // ほめたい複数選択中の児童ID
    editingPraiseId: null,      // 既存ほめ編集モード時のID
    evalSubjectId: '',
    evalUnitId: '',
    evalViewpoint: 'knowledge',
    evalScale: 3,               // 3 | 5
    evalActiveGrade: null,      // 'A'|'B'|'C'|'1'..'5' (評価値先行モード)
    evalActiveStudent: null,    // 児童先行モード時の選択児童ID
    abaDate: '',
    abaSlot: '',
    abaSubjectId: '',
    abaTargetId: null,
    abaBehaviors: new Set(),    // 選択中の行動
    abaOtherText: '',           // その他選択時の記述
    abaStep: 'date',            // 現在のステップ: date/slot/subject/student/behavior/input
    subjectId: null,
    selectedMembers: [],
    specialState: null,
    selectedActivity: null,
    selectedHistoryIds: new Set(),
    numBuf: '',
    numTimer: null,
    recordDate: '',    // 観察日。空なら todayISO() を使う
    centerId: null     // 中心人物のID（任意指定）
  },
  events: [],          // [{date:'YYYY-MM-DD', label:'席替え'}]
  attributes: {}       // {studentId: {gender:'M|F', group: 1|2|...}}
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
    if (Array.isArray(data.praises)) {
      state.praises = data.praises.map(normalizePraise).filter(Boolean);
    }
    if (Array.isArray(data.evaluations)) {
      state.evaluations = data.evaluations.map(normalizeEvaluation).filter(Boolean);
    }
    if (Array.isArray(data.abaRecords)) {
      state.abaRecords = data.abaRecords.map(normalizeAba).filter(Boolean);
    }
    if (Array.isArray(data.seatingSnapshots)) {
      state.seatingSnapshots = data.seatingSnapshots.filter(s => s && Array.isArray(s.groups));
    }
    if (data.lastEvalSubject) state.ui.evalSubjectId = data.lastEvalSubject;
    if (data.lastEvalUnit) state.ui.evalUnitId = data.lastEvalUnit;
    if (data.lastEvalViewpoint) state.ui.evalViewpoint = data.lastEvalViewpoint;
    if (data.lastEvalScale === 3 || data.lastEvalScale === 5) state.ui.evalScale = data.lastEvalScale;
    state.settings = mergeSettings(data.settings);
    if (data.lastScene) state.ui.currentScene = data.lastScene;
    if (data.lastMode) state.ui.currentMode = data.lastMode;
    if (Array.isArray(data.events)) state.events = data.events;
    if (data.attributes && typeof data.attributes === 'object') state.attributes = data.attributes;
    if (state.settings.customActivities) {
      state.activities = state.settings.customActivities;
    }
  } catch (e) {
    console.error('保存データのパース失敗', e);
    showToast('保存データの読み込みに失敗。バックアップから復元してください', 'error');
  }
}

function saveState() {
  const data = {
    version: APP_VERSION,
    records: state.records,
    praises: state.praises,
    evaluations: state.evaluations,
    abaRecords: state.abaRecords,
    seatingSnapshots: state.seatingSnapshots,
    settings: state.settings,
    events: state.events,
    attributes: state.attributes,
    lastScene: state.ui.currentScene,
    lastMode: state.ui.currentMode,
    lastEvalSubject: state.ui.evalSubjectId,
    lastEvalUnit: state.ui.evalUnitId,
    lastEvalViewpoint: state.ui.evalViewpoint,
    lastEvalScale: state.ui.evalScale
  };
  const json = JSON.stringify(data);
  try {
    // 二重化: メイン → バックアップへ前回分を退避
    const prev = localStorage.getItem(STORAGE_KEY);
    if (prev) {
      try { localStorage.setItem(STORAGE_BACKUP_KEY, prev); } catch (_) { /* バックアップ失敗は無視 */ }
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
  const subject = parseInt(r.subject);
  if (!subject || subject < 1) return null;
  let members = Array.isArray(r.members)
    ? r.members.map(Number).filter(m => Number.isFinite(m) && m !== subject && m >= 1)
    : [];
  members = [...new Set(members)];
  const timestamp = r.timestamp || new Date().toISOString();
  let date = r.date;
  if (!date) {
    try { date = new Date(timestamp).toISOString().slice(0, 10); }
    catch { date = todayISO(); }
  }
  const scene = r.scene || 'other';
  return {
    id: r.id || uuid(),
    timestamp,
    date,
    scene,
    category: r.category || getSceneCategory(scene),
    mode: r.mode === 'activity' ? 'activity' : 'simple',
    subject,
    members,
    special: r.special && SPECIAL_LABELS[r.special] ? r.special : null,
    activity: r.activity || null,
    note: typeof r.note === 'string' ? r.note.slice(0, 500) : '',
    center: (r.center && Number.isFinite(parseInt(r.center))) ? parseInt(r.center) : null
  };
}

// ABA(応用行動分析)記録の正規化
function normalizeAba(a) {
  if (!a || typeof a !== 'object') return null;
  const studentId = parseInt(a.studentId);
  if (!studentId || studentId < 1) return null;
  const behaviors = Array.isArray(a.behaviors) ? a.behaviors.map(String) : (a.behavior ? [String(a.behavior)] : []);
  if (!behaviors.length) return null;
  const timestamp = a.timestamp || new Date().toISOString();
  let date = a.date;
  if (!date) {
    try { date = new Date(timestamp).toISOString().slice(0, 10); }
    catch { date = todayISO(); }
  }
  return {
    id: a.id || uuid(),
    studentId,
    date,
    timestamp,
    slot: a.slot || '',
    subject: a.subject || '',
    behaviors,
    antecedent: typeof a.antecedent === 'string' ? a.antecedent.slice(0, 500) : '',
    consequence: typeof a.consequence === 'string' ? a.consequence.slice(0, 500) : '',
    response: typeof a.response === 'string' ? a.response.slice(0, 500) : ''
  };
}

function normalizeEvaluation(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const studentId = parseInt(ev.studentId);
  if (!studentId || studentId < 1) return null;
  if (!ev.subjectId || !ev.unitId || !ev.viewpoint) return null;
  const grade = String(ev.grade || '').trim();
  if (!grade) return null;
  const scale = (ev.scale === 5 || String(ev.scale) === '5') ? 5 : 3;
  const timestamp = ev.timestamp || new Date().toISOString();
  let date = ev.date;
  if (!date) {
    try { date = new Date(timestamp).toISOString().slice(0, 10); }
    catch { date = todayISO(); }
  }
  return {
    id: ev.id || uuid(),
    studentId,
    subjectId: String(ev.subjectId),
    unitId: String(ev.unitId),
    viewpoint: String(ev.viewpoint),
    grade,
    scale,
    date,
    timestamp
  };
}

function normalizePraise(p) {
  if (!p || typeof p !== 'object') return null;
  const studentId = parseInt(p.studentId);
  if (!studentId || studentId < 1) return null;
  const content = typeof p.content === 'string' ? p.content.trim().slice(0, 500) : '';
  if (!content) return null;
  const timestamp = p.timestamp || new Date().toISOString();
  let date = p.date;
  if (!date) {
    try { date = new Date(timestamp).toISOString().slice(0, 10); }
    catch { date = todayISO(); }
  }
  return {
    id: p.id || uuid(),
    studentId,
    content,
    date,
    timestamp,
    scene: p.scene || null
  };
}

function mergeSettings(incoming) {
  const safe = { sceneLabels: {}, customActivities: null };
  if (incoming && typeof incoming === 'object') {
    if (incoming.sceneLabels && typeof incoming.sceneLabels === 'object') {
      for (const [k, v] of Object.entries(incoming.sceneLabels)) {
        if (typeof v === 'string') safe.sceneLabels[k] = v;
      }
    }
    if (Array.isArray(incoming.customActivities)) {
      safe.customActivities = incoming.customActivities.filter(s => typeof s === 'string');
    }
  }
  return safe;
}

// ========== Helpers ==========
function getStudent(id) {
  return state.students.find(s => s.id === id);
}
function getStudentName(id) {
  return getStudent(id)?.name || `(ID:${id})`;
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function getSceneLabel(id) {
  if (state.settings.sceneLabels[id]) return state.settings.sceneLabels[id];
  const s = state.scenes.find(x => x.id === id);
  return s ? s.label : id;
}
function getSceneCategory(id) {
  const s = state.scenes.find(x => x.id === id);
  return s ? s.category : 'other';
}
function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function formatTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

// ========== Init ==========
function init() {
  if (!checkLocalStorage()) return;
  loadState();
  renderToday();
  initRecordDatePicker();
  renderSceneButtons();
  renderStudentGrid();
  renderActivityButtons();
  initTabs();
  initRecordEvents();
  initSummaryFilters();
  initSocioFilters();
  initCentralityFilters();
  initTimelineFilters();
  initHistoryFilters();
  initSettingsEvents();
  initPraiseEvents();
  renderPraiseStudentGrid();
  initEvaluationEvents();
  initAbaEvents();
  initSeatingSnapshotEvents();
  initKeyboardShortcuts();
  initHelpModal();
  updateHealthBadge();
  showStartupBanners();
  refreshAll();
  maybeShowOnboarding();
}

function showStartupBanners() {
  const banners = [];
  // 最終BUからの日数チェック
  const lastBackup = parseInt(localStorage.getItem(LAST_BACKUP_KEY) || '0');
  const days = lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : 999;
  if (state.records.length >= 10) {
    if (!lastBackup) {
      banners.push({ type: 'warn', text: `⚠ まだ一度もバックアップしていません (${state.records.length}件)。設定タブからJSONエクスポートを実行してください。` });
    } else if (days >= 14) {
      banners.push({ type: 'danger', text: `⚠ 最終バックアップから${days}日経過しています。設定タブからエクスポートしてください。` });
    } else if (days >= 7) {
      banners.push({ type: 'warn', text: `最終バックアップから${days}日経過。週末にエクスポートを推奨。` });
    }
  }
  // 5日以上未観察の児童数
  const { daysAgo } = computeCoverageMap();
  const longUnseen = state.students.filter(s => daysAgo[s.id] >= ALERT_DAYS && daysAgo[s.id] !== 999);
  if (longUnseen.length >= 3 && state.records.length >= 30) {
    const names = longUnseen.slice(0, 3).map(s => s.name).join('・');
    banners.push({ type: 'warn', text: `${ALERT_DAYS}日以上未観察 ${longUnseen.length}名: ${names} ...` });
  }
  renderBanners(banners);
}

function renderBanners(banners) {
  let cont = document.getElementById('startupBanners');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'startupBanners';
    cont.className = 'startup-banners';
    document.body.insertBefore(cont, document.body.children[1]);
  }
  cont.innerHTML = '';
  for (const b of banners) {
    const div = document.createElement('div');
    div.className = `banner ${b.type}`;
    div.textContent = b.text;
    const x = document.createElement('button');
    x.className = 'banner-close';
    x.textContent = '×';
    x.addEventListener('click', () => div.remove());
    div.appendChild(x);
    cont.appendChild(div);
  }
}

function maybeShowOnboarding() {
  if (localStorage.getItem('interactionApp_onboarded')) return;
  if (state.records.length > 0) {
    localStorage.setItem('interactionApp_onboarded', '1');
    return;
  }
  const modal = document.getElementById('onboardingModal');
  if (modal) modal.classList.remove('hidden');
}

function updateHealthBadge() {
  const badge = document.getElementById('healthBadge');
  if (!badge) return;
  const total = state.records.length;
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

function initRecordDatePicker() {
  const inp = document.getElementById('recordDate');
  const btn = document.getElementById('recordDateTodayBtn');
  if (!inp) return;
  inp.value = state.ui.recordDate || todayISO();
  state.ui.recordDate = inp.value;
  refreshRecordDateStyle();
  inp.addEventListener('change', () => {
    state.ui.recordDate = inp.value || todayISO();
    refreshRecordDateStyle();
    if (state.ui.recordDate !== todayISO()) {
      const [y,m,d] = state.ui.recordDate.split('-').map(Number);
      const wd = ['日','月','火','水','木','金','土'][new Date(y,m-1,d).getDay()];
      showToast(`📅 観察日: ${m}/${d} (${wd}) で記録します`, 'success');
    } else {
      showToast('📅 今日の日付で記録します', 'success');
    }
  });
  btn?.addEventListener('click', () => {
    inp.value = todayISO();
    state.ui.recordDate = inp.value;
    refreshRecordDateStyle();
    showToast('📅 今日に戻しました', 'success');
  });
}

function refreshRecordDateStyle() {
  const inp = document.getElementById('recordDate');
  if (!inp) return;
  inp.classList.toggle('past-date', inp.value !== todayISO());
}

// ========== Scene Buttons ==========
function renderSceneButtons() {
  const container = document.getElementById('sceneButtons');
  container.innerHTML = '';
  for (const sc of state.scenes) {
    const btn = document.createElement('button');
    btn.className = 'scene-btn' + (sc.id === state.ui.currentScene ? ' active' : '');
    btn.dataset.sceneId = sc.id;
    btn.dataset.category = sc.category;
    btn.textContent = getSceneLabel(sc.id);
    btn.addEventListener('click', () => {
      state.ui.currentScene = sc.id;
      renderSceneButtons();
      saveState();
    });
    container.appendChild(btn);
  }
}

// ========== Student Grid ==========
function renderStudentGrid() {
  const grid = document.getElementById('studentGrid');
  grid.innerHTML = '';
  for (const s of state.students) {
    const btn = document.createElement('button');
    btn.className = 'student-btn';
    btn.dataset.studentId = s.id;
    btn.title = `${s.kana}${s.note ? ' / ' + s.note : ''} (出席番号 ${s.id}) — 右クリックで個別分析`;
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = s.id;
    btn.appendChild(num);
    btn.appendChild(document.createTextNode(s.name));
    btn.addEventListener('click', () => onStudentClick(s.id));
    btn.addEventListener('contextmenu', e => {
      e.preventDefault();
      openStudentDashboard(s.id);
    });
    grid.appendChild(btn);
  }
  refreshGridState();
}

function computeCoverageMap() {
  // 今日記録済みID + 児童IDごとの最終観察日数を返す
  const today = todayISO();
  const todaySet = new Set();
  const lastSeenMs = {};
  const now = Date.now();
  for (const r of state.records) {
    if (r.date === today) {
      todaySet.add(r.subject);
      for (const m of r.members) todaySet.add(m);
    }
    const t = new Date(r.timestamp).getTime();
    const ids = [r.subject, ...r.members];
    for (const id of ids) {
      if (!lastSeenMs[id] || lastSeenMs[id] < t) lastSeenMs[id] = t;
    }
  }
  const daysAgo = {};
  for (const s of state.students) {
    daysAgo[s.id] = lastSeenMs[s.id]
      ? Math.max(0, Math.floor((now - lastSeenMs[s.id]) / 86400000))
      : 999;
  }
  return { todaySet, daysAgo };
}

// 動的判定: 記録された「日数(distinct dates)」が下位1/3に入る児童IDのSet。
// 全体記録が少ない初期段階(最大日数<3)では誰もマークしない。
function computeUndercountedSet() {
  const dayMap = new Map();
  for (const r of state.records) {
    if (!r || !r.date) continue;
    const ids = [r.subject, ...(r.members || [])].filter(x => x != null);
    for (const id of ids) {
      if (!dayMap.has(id)) dayMap.set(id, new Set());
      dayMap.get(id).add(r.date);
    }
  }
  const counts = state.students.map(s => (dayMap.get(s.id) || new Set()).size);
  const max = counts.length ? Math.max(...counts) : 0;
  if (max < 3) return new Set();
  const sorted = [...counts].sort((a, b) => a - b);
  const cutoffIdx = Math.max(1, Math.floor(state.students.length / 3));
  const threshold = sorted[cutoffIdx - 1];
  const result = new Set();
  state.students.forEach((s, i) => {
    if (counts[i] <= threshold && counts[i] < max) result.add(s.id);
  });
  return result;
}

function refreshGridState() {
  const { todaySet, daysAgo } = computeCoverageMap();
  const lowCountSet = computeUndercountedSet();
  document.querySelectorAll('.student-btn').forEach(btn => {
    const id = parseInt(btn.dataset.studentId);
    btn.classList.remove('subject', 'selected', 'disabled', 'covered-today', 'alert', 'center-marked', 'watch');
    if (state.ui.subjectId === id) {
      btn.classList.add('subject');
    } else if (state.ui.selectedMembers.includes(id)) {
      btn.classList.add('selected');
    } else if (state.ui.specialState && state.ui.subjectId !== null) {
      btn.classList.add('disabled');
    }
    if (state.ui.centerId === id) btn.classList.add('center-marked');
    if (todaySet.has(id)) btn.classList.add('covered-today');
    if (lowCountSet.has(id)) btn.classList.add('watch');
    if (daysAgo[id] >= ALERT_DAYS && daysAgo[id] !== 999) btn.classList.add('alert');
    else if (daysAgo[id] === 999 && state.records.length > 30) btn.classList.add('alert');
  });
}

function onStudentClick(id) {
  // 主役未選択 → 主役にする (selectedMembersから自分を除外して維持)
  if (state.ui.subjectId === null) {
    state.ui.subjectId = id;
    state.ui.selectedMembers = state.ui.selectedMembers.filter(m => m !== id);
    state.ui.specialState = null;
    refreshAfterSelectionChange();
    return;
  }
  // 主役本人をクリック → 主役のみ解除（メンバーは保持）
  if (state.ui.subjectId === id) {
    state.ui.subjectId = null;
    refreshAfterSelectionChange();
    return;
  }
  // 特殊状態の場合は解除してから選択
  if (state.ui.specialState) {
    state.ui.specialState = null;
    refreshSpecialButtons();
  }
  // 既に選択済み → 解除
  const idx = state.ui.selectedMembers.indexOf(id);
  if (idx >= 0) {
    state.ui.selectedMembers.splice(idx, 1);
  } else {
    state.ui.selectedMembers.push(id);
  }
  refreshAfterSelectionChange();
}

function refreshAfterSelectionChange() {
  refreshGridState();
  refreshSelectedChips();
  refreshStatusLine();
  refreshActivityVisibility();
  refreshSaveButton();
}

function refreshSelectedChips() {
  const cont = document.getElementById('selectedChips');
  cont.innerHTML = '';
  // 特殊状態
  if (state.ui.specialState) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = SPECIAL_LABELS[state.ui.specialState];
    cont.appendChild(chip);
    return;
  }
  // 通常メンバー: 各チップに「★中心指定」ボタン
  for (const id of state.ui.selectedMembers) {
    const s = getStudent(id);
    if (!s) continue;
    const chip = document.createElement('span');
    chip.className = 'chip' + (state.ui.centerId === id ? ' chip-center' : '');
    chip.appendChild(document.createTextNode(s.name));
    const star = document.createElement('button');
    star.className = 'chip-star';
    star.title = state.ui.centerId === id ? '中心指定を外す' : 'この子を中心人物に指定';
    star.textContent = state.ui.centerId === id ? '★' : '☆';
    star.addEventListener('click', e => {
      e.stopPropagation();
      state.ui.centerId = (state.ui.centerId === id) ? null : id;
      refreshAfterSelectionChange();
    });
    chip.appendChild(star);
    cont.appendChild(chip);
  }
}

function refreshStatusLine() {
  const line = document.getElementById('statusLine');
  line.innerHTML = '';
  if (state.ui.subjectId === null) {
    const memberCount = state.ui.selectedMembers.length;
    const span = document.createElement('span');
    span.className = 'status-label muted';
    if (memberCount > 0) {
      span.textContent = `グループに追加する子を選んでください（${memberCount}人選択中）`;
    } else {
      span.textContent = '一緒にいた子を選んでください（複数可・順序は集計に影響しません）';
    }
    line.appendChild(span);
    return;
  }
  const s = getStudent(state.ui.subjectId);
  const isCenter = state.ui.centerId === state.ui.subjectId;
  // 起点チップ
  const wrap = document.createElement('span');
  wrap.className = 'subject-name-wrap' + (isCenter ? ' is-center' : '');
  wrap.title = '最初に選択した子（便宜上の起点。中心人物とは限りません）';
  wrap.appendChild(document.createTextNode(s ? s.name : `(ID:${state.ui.subjectId})`));
  // 起点にも中心指定ボタン
  const star = document.createElement('button');
  star.className = 'chip-star';
  star.textContent = isCenter ? '★' : '☆';
  star.title = isCenter ? '中心指定を外す' : 'この子を中心人物に指定';
  star.addEventListener('click', e => {
    e.stopPropagation();
    state.ui.centerId = isCenter ? null : state.ui.subjectId;
    refreshAfterSelectionChange();
  });
  wrap.appendChild(star);
  const x = document.createElement('button');
  x.className = 'subject-clear';
  x.textContent = '×';
  x.title = 'この子をグループから外す';
  x.addEventListener('click', () => {
    state.ui.subjectId = null;
    if (state.ui.centerId === state.ui.subjectId) state.ui.centerId = null;
    refreshAfterSelectionChange();
  });
  wrap.appendChild(x);
  line.appendChild(wrap);
  // 矢印 + 補足
  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = ' + ';
  line.appendChild(arrow);
  const suffix = document.createElement('span');
  suffix.className = 'muted';
  if (state.ui.specialState) {
    suffix.textContent = SPECIAL_LABELS[state.ui.specialState];
  } else if (state.ui.selectedMembers.length === 0) {
    suffix.textContent = '一緒にいた子を追加 (複数可)';
  } else {
    const centerInfo = state.ui.centerId ? ` ★中心: ${getStudentName(state.ui.centerId)}` : '';
    suffix.textContent = `計${state.ui.selectedMembers.length + 1}人 → 保存可 (Enter)${centerInfo}`;
  }
  line.appendChild(suffix);
}

// ========== Special Buttons ==========
function initRecordEvents() {
  // 特殊状態
  document.querySelectorAll('.special-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.ui.subjectId === null) {
        showToast('まず主役の児童を選んでください', 'error');
        return;
      }
      const sp = btn.dataset.special;
      if (state.ui.specialState === sp) {
        state.ui.specialState = null;
      } else {
        state.ui.specialState = sp;
        state.ui.selectedMembers = [];
      }
      refreshSpecialButtons();
      refreshAfterSelectionChange();
    });
  });

  // モード切替
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.ui.currentMode = btn.dataset.mode;
      refreshActivityVisibility();
      refreshSaveButton();
      saveState();
    });
  });

  // クリア
  document.getElementById('clearBtn').addEventListener('click', clearSelection);

  // 保存
  document.getElementById('saveBtn').addEventListener('click', saveRecord);

  // Undo
  document.getElementById('undoBtn').addEventListener('click', undoLastRecord);

  // 同じ組合せで続ける
  document.getElementById('quickRepeatBtn').addEventListener('click', quickRepeat);

  // タブ切替
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 初期モード反映
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.ui.currentMode);
  });
  refreshActivityVisibility();
}

function refreshSpecialButtons() {
  document.querySelectorAll('.special-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.special === state.ui.specialState);
  });
}

// ========== Activity ==========
function renderActivityButtons() {
  const cont = document.getElementById('activityButtons');
  cont.innerHTML = '';
  for (const act of state.activities) {
    const btn = document.createElement('button');
    btn.className = 'activity-btn';
    btn.dataset.activity = act;
    btn.textContent = act;
    btn.addEventListener('click', () => {
      if (state.ui.selectedActivity === act) {
        state.ui.selectedActivity = null;
      } else {
        state.ui.selectedActivity = act;
      }
      refreshActivityButtons();
      refreshSaveButton();
    });
    cont.appendChild(btn);
  }
}

function refreshActivityButtons() {
  document.querySelectorAll('.activity-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.activity === state.ui.selectedActivity);
  });
}

function refreshActivityVisibility() {
  const row = document.getElementById('activityRow');
  if (state.ui.currentMode === 'activity') {
    row.classList.remove('hidden');
  } else {
    row.classList.add('hidden');
    state.ui.selectedActivity = null;
    refreshActivityButtons();
  }
}

// ========== Save ==========
function refreshSaveButton() {
  const btn = document.getElementById('saveBtn');
  const ok = state.ui.subjectId !== null &&
             (state.ui.specialState !== null || state.ui.selectedMembers.length > 0) &&
             (state.ui.currentMode === 'simple' || state.ui.selectedActivity !== null);
  btn.disabled = !ok;
}

function saveRecord() {
  if (isSaving) return;
  if (state.ui.subjectId === null) return;
  if (state.ui.currentMode === 'activity' && !state.ui.selectedActivity) {
    showToast('活動を選んでください', 'error');
    return;
  }
  if (!state.ui.specialState && state.ui.selectedMembers.length === 0) {
    showToast('一緒にいた子を選ぶか、特殊状態を選んでください', 'error');
    return;
  }
  // 同一集まり重複検出: 5分以内に同シーン+同集合(主役+メンバー sorted)があれば確認
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const newGroup = state.ui.specialState
    ? `special-${state.ui.subjectId}-${state.ui.specialState}`
    : [state.ui.subjectId, ...state.ui.selectedMembers].sort((a,b)=>a-b).join(',');
  const dup = state.records.find(r => {
    if (new Date(r.timestamp).getTime() < fiveMinAgo) return false;
    if (r.scene !== state.ui.currentScene) return false;
    const grp = r.special
      ? `special-${r.subject}-${r.special}`
      : [r.subject, ...r.members].sort((a,b)=>a-b).join(',');
    return grp === newGroup;
  });
  if (dup) {
    if (!confirm(`5分以内に同じ集まりの記録があります(${formatTime(dup.timestamp)})。\n\n本当に追加しますか？\n[OK]=追加 [キャンセル]=やめる`)) {
      showToast('保存をキャンセル', 'success');
      return;
    }
  }
  isSaving = true;
  try {
    const sceneId = state.ui.currentScene;
    // 主役自身がmembersに混入しないよう除外
    const safeMembers = state.ui.specialState
      ? []
      : [...new Set(state.ui.selectedMembers.filter(m => m !== state.ui.subjectId))];
    const noteEl = document.getElementById('noteInput');
    const noteVal = noteEl ? noteEl.value.trim() : '';
    const recordDate = state.ui.recordDate || todayISO();
    let timestamp = new Date().toISOString();
    if (recordDate !== todayISO()) {
      const now = new Date();
      const [y, m, d] = recordDate.split('-').map(Number);
      timestamp = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
    }
    // center が選択中グループ (subject + safeMembers) に含まれていなければ無効化
    const allIds = [state.ui.subjectId, ...safeMembers];
    const center = (state.ui.centerId && allIds.includes(state.ui.centerId)) ? state.ui.centerId : null;
    const rec = {
      id: uuid(),
      timestamp,
      date: recordDate,
      scene: sceneId,
      category: getSceneCategory(sceneId),
      mode: state.ui.currentMode,
      subject: state.ui.subjectId,    // 便宜上の起点（最初に選んだ子・中心とは限らない）
      members: safeMembers,
      center,                          // 中心人物（指定時のみ）
      special: state.ui.specialState,
      activity: state.ui.currentMode === 'activity' ? state.ui.selectedActivity : null,
      note: noteVal
    };
    if (noteEl) noteEl.value = '';
    state.records.push(rec);
    saveState();

    const subjectName = getStudentName(rec.subject);
    let summary = '';
    if (rec.special) {
      summary = `${subjectName}：${SPECIAL_LABELS[rec.special]}`;
    } else {
      summary = `${subjectName}：${rec.members.map(getStudentName).join('・')}`;
    }
    if (rec.activity) summary += ` (${rec.activity})`;
    showToast(`✓ 保存: ${summary}`);

    // 起点とメンバーをクリア（次のグループを選びやすくする）
    state.ui.subjectId = null;
    state.ui.selectedMembers = [];
    state.ui.specialState = null;
    state.ui.centerId = null;
    // 活動は維持（連続記録を高速化）
    refreshAfterSelectionChange();
    refreshSpecialButtons();
    refreshSidePanel();
    updateHealthBadge();
  } finally {
    isSaving = false;
    refreshSaveButton();
  }
}

function clearSelection() {
  state.ui.subjectId = null;
  state.ui.selectedMembers = [];
  state.ui.specialState = null;
  state.ui.selectedActivity = null;
  state.ui.centerId = null;
  refreshAfterSelectionChange();
  refreshSpecialButtons();
  refreshActivityButtons();
}

function undoLastRecord() {
  if (state.records.length === 0) {
    showToast('取り消す記録がありません', 'error');
    return;
  }
  const removed = state.records.pop();
  saveState();
  showToast(`↶ 取り消し: ${getStudentName(removed.subject)}`, 'success');
  refreshSidePanel();
  refreshGridState();
  updateHealthBadge();
}

function quickRepeat() {
  if (state.records.length === 0) {
    showToast('直前の記録がありません', 'error');
    return;
  }
  const last = state.records[state.records.length - 1];
  if (last.special) {
    showToast('特殊状態の記録は再記録できません', 'error');
    return;
  }
  // 直前メンバーを保持。次に押した児童が主役、残りが自動的にメンバーに
  state.ui.subjectId = null;
  state.ui.selectedMembers = [last.subject, ...last.members];
  state.ui.specialState = null;
  state.ui.selectedActivity = last.activity;
  refreshAfterSelectionChange();
  refreshSpecialButtons();
  refreshActivityButtons();
  showToast(`↻ ${state.ui.selectedMembers.length}人保持中。次の主役を選択`, 'success');
}

// ========== Tabs ==========
function initTabs() {
  // tab init handled in initRecordEvents
}

function switchTab(name) {
  state.ui.currentTab = name;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  // タブごとの再描画
  if (name === 'summary') refreshSummary();
  else if (name === 'compare') refreshCompare();
  else if (name === 'socio') refreshSocio();
  else if (name === 'history') refreshHistory();
  else if (name === 'settings') refreshSettings();
  else if (name === 'praise-list') refreshPraiseList();
  else if (name === 'eval-list') refreshEvalList();
  else if (name === 'aba-list') refreshAbaList();
}

// ========== Side Panel ==========
function refreshSidePanel() {
  const today = todayISO();
  const todayRecs = state.records.filter(r => r.date === today);
  document.getElementById('todayCount').textContent = todayRecs.length;
  const coveredSet = new Set();
  for (const r of todayRecs) {
    coveredSet.add(r.subject);
    for (const m of r.members) coveredSet.add(m);
  }
  document.getElementById('todayCovered').textContent = coveredSet.size;

  // 最近観察してない子 TOP3 (tie-breaker: watch優先 → 同値はランダム)
  const lastSeen = {};
  for (const r of state.records) {
    const t = new Date(r.timestamp).getTime();
    const ids = [r.subject, ...r.members];
    for (const id of ids) {
      if (!lastSeen[id] || lastSeen[id] < t) lastSeen[id] = t;
    }
  }
  const now = Date.now();
  const ranking = state.students.map(s => {
    const seen = lastSeen[s.id];
    const days = seen ? Math.max(0, Math.floor((now - seen) / 86400000)) : 999;
    return { student: s, days, seen, rand: Math.random() };
  }).sort((a, b) => {
    if (b.days !== a.days) return b.days - a.days;
    if (!!b.student.watch !== !!a.student.watch) return b.student.watch ? 1 : -1;
    return a.rand - b.rand;
  }).slice(0, 3);

  const ol = document.getElementById('watchList');
  ol.innerHTML = '';
  for (const r of ranking) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = 'days' + (r.days >= ALERT_DAYS ? ' alert-day' : '');
    span.textContent = r.days === 999 ? ' (未記録)' : ` (${r.days}日前)`;
    li.textContent = r.student.name;
    li.appendChild(span);
    ol.appendChild(li);
  }

  // 直近の記録（各行に編集ボタン）
  const recent = state.records.slice(-10).reverse();
  const ul = document.getElementById('recentList');
  ul.innerHTML = '';
  for (const r of recent) {
    const li = document.createElement('li');
    li.className = 'recent-item';
    const subj = escapeHtml(getStudentName(r.subject));
    let body = '';
    if (r.special) {
      body = escapeHtml(SPECIAL_LABELS[r.special] || '');
    } else {
      body = r.members.map(id => escapeHtml(getStudentName(id))).join('・');
    }
    const act = r.activity ? ` [${escapeHtml(r.activity)}]` : '';
    li.innerHTML = `<span class="recent-body"><span class="time">${escapeHtml(formatTime(r.timestamp))}</span> <span class="subject">${subj}</span> ▶ ${body}${act}</span>` +
      `<span class="recent-actions">` +
        `<button class="recent-btn" data-edit-id="${escapeHtml(r.id)}" title="編集">✏</button>` +
        `<button class="recent-btn" data-del-id="${escapeHtml(r.id)}" title="削除">🗑</button>` +
      `</span>`;
    ul.appendChild(li);
  }
  ul.querySelectorAll('button[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openEditModal(btn.dataset.editId); });
  });
  ul.querySelectorAll('button[data-del-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const rec = state.records.find(r => r.id === btn.dataset.delId);
      if (!rec) return;
      if (!confirm(`削除しますか?\n${formatDateTime(rec.timestamp)} ${getStudentName(rec.subject)}`)) return;
      state.records = state.records.filter(r => r.id !== btn.dataset.delId);
      pushUndo({ type: 'delete', rec });
      saveState();
      refreshAll();
      showToast('🗑 削除しました (Ctrl+Zで復元)');
    });
  });
}

// ========== Records filter helper ==========
function filterRecords({ scene, category, period, studentId } = {}) {
  let recs = state.records.slice();
  if (scene) recs = recs.filter(r => r.scene === scene);
  if (category) recs = recs.filter(r => r.category === category);
  if (period && period !== 'all') {
    if (period === 'today') {
      const today = todayISO();
      recs = recs.filter(r => r.date === today);
    } else {
      const days = parseInt(period);
      const cutoff = Date.now() - days * 86400000;
      recs = recs.filter(r => new Date(r.timestamp).getTime() >= cutoff);
    }
  }
  if (studentId) {
    recs = recs.filter(r => r.subject === studentId || r.members.includes(studentId));
  }
  return recs;
}

// 児童X視点で関わった相手の出現回数を計算
// レコード {subject:A, members:[B,C]} は A↔B, A↔C, B↔C を1回ずつカウントとして展開する
function computePartnerCounts(studentId, records) {
  const count = {};
  for (const r of records) {
    if (r.special) continue; // 特殊状態は対人関係としてカウントしない
    let partners = null;
    if (r.subject === studentId) {
      partners = r.members;
    } else if (r.members.includes(studentId)) {
      partners = [r.subject, ...r.members.filter(m => m !== studentId)];
    }
    if (partners) {
      for (const p of partners) {
        count[p] = (count[p] || 0) + 1;
      }
    }
  }
  return count;
}

function computeSpecialCounts(studentId, records) {
  const count = { alone: 0, with_teacher: 0, other_class: 0 };
  for (const r of records) {
    if (r.subject === studentId && r.special) {
      count[r.special]++;
    }
  }
  return count;
}

// ========== Summary tab ==========
function initSummaryFilters() {
  const sel = document.getElementById('summaryScene');
  for (const sc of state.scenes) {
    const opt = document.createElement('option');
    opt.value = sc.id;
    opt.textContent = getSceneLabel(sc.id);
    sel.appendChild(opt);
  }
  // 並列比較用シーンoptgroup埋め
  ['summaryAScenes', 'summaryBScenes'].forEach(gid => {
    const grp = document.getElementById(gid);
    if (!grp) return;
    for (const sc of state.scenes) {
      const opt = document.createElement('option');
      opt.value = 'sc:' + sc.id;
      opt.textContent = getSceneLabel(sc.id);
      grp.appendChild(opt);
    }
  });
  ['summaryScene', 'summaryCategory', 'summaryPeriod', 'summaryMode', 'summaryA', 'summaryB']
    .forEach(id => document.getElementById(id)?.addEventListener('change', refreshSummary));
  document.getElementById('summaryMode')?.addEventListener('change', () => {
    const mode = document.getElementById('summaryMode').value;
    document.getElementById('summarySingleFilters').classList.toggle('hidden', mode !== 'single');
    document.getElementById('summaryCompareFilters').classList.toggle('hidden', mode !== 'compare');
  });
  document.getElementById('printSummaryBtn')?.addEventListener('click', () => window.print());
}

function parseSummaryFilter(val) {
  // "cat:rest" / "sc:break1" → {category} or {scene}
  if (!val) return {};
  if (val.startsWith('cat:')) return { category: val.slice(4) };
  if (val.startsWith('sc:'))  return { scene: val.slice(3) };
  return {};
}

function summaryFilterLabel(val) {
  if (!val) return 'すべて';
  if (val.startsWith('cat:')) {
    return ({rest:'休み時間', class:'授業時間', other:'その他'})[val.slice(4)] || val;
  }
  if (val.startsWith('sc:')) return getSceneLabel(val.slice(3));
  return val;
}

function refreshSummary() {
  const mode = document.getElementById('summaryMode')?.value || 'single';
  const gridEl = document.getElementById('summaryGrid');
  if (mode === 'compare') {
    gridEl.classList.add('compare');
    return refreshSummaryCompare();
  }
  gridEl.classList.remove('compare');
  const scene = document.getElementById('summaryScene').value;
  const category = document.getElementById('summaryCategory').value;
  const period = document.getElementById('summaryPeriod').value;
  const recs = filterRecords({ scene, category, period });
  document.getElementById('summaryInfo').textContent = `対象記録: ${recs.length}件`;

  const grid = document.getElementById('summaryGrid');
  grid.innerHTML = '';
  for (const s of state.students) {
    const partners = computePartnerCounts(s.id, recs);
    const specials = computeSpecialCounts(s.id, recs);
    const total = Object.values(partners).reduce((a, b) => a + b, 0);
    const card = document.createElement('div');
    card.className = 'summary-card';
    if (s.highlight) card.classList.add('highlight');
    if (s.watch) card.classList.add('watch');
    if (total === 0 && Object.values(specials).every(v => v === 0)) card.classList.add('empty');

    const sortedPartners = Object.entries(partners)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const maxCount = sortedPartners.length > 0 ? sortedPartners[0][1] : 1;

    let partnersHtml = '';
    if (sortedPartners.length === 0) {
      partnersHtml = '<li class="muted">記録なし</li>';
    } else {
      partnersHtml = sortedPartners.map(([pid, cnt]) => {
        const partner = getStudent(parseInt(pid));
        if (!partner) return '';
        const w = Math.max(8, Math.round((cnt / maxCount) * 80));
        return `<li><span><span class="bar" style="width:${w}px"></span>${escapeHtml(partner.name)}</span><span class="count">${cnt}</span></li>`;
      }).join('');
    }

    let specialsHtml = '';
    const spParts = [];
    if (specials.alone > 0) spParts.push(`一人で ${specials.alone}`);
    if (specials.with_teacher > 0) spParts.push(`先生と ${specials.with_teacher}`);
    if (specials.other_class > 0) spParts.push(`他クラス ${specials.other_class}`);
    const totalObs = total + specials.alone + specials.with_teacher + specials.other_class;
    let isolationHtml = '';
    if (totalObs >= 3 && specials.alone > 0) {
      const rate = Math.round((specials.alone / totalObs) * 100);
      isolationHtml = `<div class="isolation">⚠ 孤立率 ${rate}% (${specials.alone}/${totalObs})</div>`;
    }
    if (spParts.length > 0) specialsHtml = `<div class="specials">${spParts.join(' / ')}</div>`;

    card.innerHTML = `
      <h4>${escapeHtml(s.name)}<span class="total">${total} 回 / 観察${totalObs}</span></h4>
      <ul class="partner-list">${partnersHtml}</ul>
      ${specialsHtml}${isolationHtml}
    `;
    grid.appendChild(card);
  }
}

// ========== Summary 並列比較モード ==========
function refreshSummaryCompare() {
  const aVal = document.getElementById('summaryA').value;
  const bVal = document.getElementById('summaryB').value;
  const period = document.getElementById('summaryPeriod').value;
  const aFilter = { ...parseSummaryFilter(aVal), period };
  const bFilter = { ...parseSummaryFilter(bVal), period };
  const recsA = filterRecords(aFilter);
  const recsB = filterRecords(bFilter);
  const aLabel = summaryFilterLabel(aVal);
  const bLabel = summaryFilterLabel(bVal);
  document.getElementById('summaryInfo').textContent =
    `A: ${aLabel} ${recsA.length}件 / B: ${bLabel} ${recsB.length}件`;

  const grid = document.getElementById('summaryGrid');
  grid.innerHTML = '';
  for (const s of state.students) {
    const partnersA = computePartnerCounts(s.id, recsA);
    const partnersB = computePartnerCounts(s.id, recsB);
    const totalA = Object.values(partnersA).reduce((a,b)=>a+b, 0);
    const totalB = Object.values(partnersB).reduce((a,b)=>a+b, 0);
    if (totalA === 0 && totalB === 0) continue; // 完全に記録なしの子は省略

    const setA = new Set(Object.keys(partnersA).map(Number));
    const setB = new Set(Object.keys(partnersB).map(Number));
    const onlyA = [...setA].filter(x => !setB.has(x));
    const onlyB = [...setB].filter(x => !setA.has(x));
    const common = [...setA].filter(x => setB.has(x));
    const unionN = setA.size + setB.size - common.length;
    const jaccard = unionN > 0 ? common.length / unionN : 0;

    const card = document.createElement('div');
    card.className = 'summary-card compare-card';
    if (s.highlight) card.classList.add('highlight');
    if (s.watch) card.classList.add('watch');

    const renderList = (partners, onlySet) =>
      Object.entries(partners).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([pid, cnt]) => {
        const p = getStudent(parseInt(pid));
        const cls = onlySet.has(parseInt(pid)) ? ' class="only"' : '';
        return `<li${cls}><span>${escapeHtml(p?.name||'?')}</span><span class="muted">${cnt}</span></li>`;
      }).join('') || '<li class="muted">記録なし</li>';

    const fmtNames = (ids, max=4) =>
      ids.slice(0, max).map(id => escapeHtml(getStudentName(id))).join('・') +
      (ids.length > max ? ` 他${ids.length-max}名` : '');

    // 「同じ仲間か違うか」の判定ラベル
    let verdict, verdictCls;
    if (totalA === 0 || totalB === 0) {
      verdict = '片方の場面で記録なし';
      verdictCls = 'verdict-na';
    } else if (jaccard >= 0.67) {
      verdict = `🟣 ほぼ同じ仲間と過ごしている (${Math.round(jaccard*100)}%一致)`;
      verdictCls = 'verdict-same';
    } else if (jaccard >= 0.34) {
      verdict = `🟡 一部だけ重なる仲間 (${Math.round(jaccard*100)}%一致)`;
      verdictCls = 'verdict-mixed';
    } else {
      verdict = `🔴 ほぼ違う相手と過ごしている (${Math.round(jaccard*100)}%一致)`;
      verdictCls = 'verdict-different';
    }

    card.innerHTML = `
      <h4>${escapeHtml(s.name)}<span class="muted small">A:${totalA} / B:${totalB}</span></h4>
      <div class="compare-verdict ${verdictCls}">${verdict}</div>
      <div class="compare-cols">
        <div class="compare-col col-a">
          <h5>${escapeHtml(aLabel)} <span class="cnt">${totalA}回</span></h5>
          <ul>${renderList(partnersA, new Set(onlyA))}</ul>
        </div>
        <div class="compare-col col-b">
          <h5>${escapeHtml(bLabel)} <span class="cnt">${totalB}回</span></h5>
          <ul>${renderList(partnersB, new Set(onlyB))}</ul>
        </div>
      </div>
      <dl class="compare-diff">
        <dt>共通</dt>     <dd class="diff-common">${common.length===0 ? '<span class="muted">—</span>' : fmtNames(common)}</dd>
        <dt>Aだけ</dt>    <dd class="diff-only-a">${onlyA.length===0 ? '<span class="muted">—</span>' : fmtNames(onlyA)}</dd>
        <dt>Bだけ</dt>    <dd class="diff-only-b">${onlyB.length===0 ? '<span class="muted">—</span>' : fmtNames(onlyB)}</dd>
        <dt>類似度</dt>   <dd>${jaccard.toFixed(2)} <span class="muted">(共通${common.length}/和集合${unionN})</span></dd>
      </dl>
    `;
    grid.appendChild(card);
  }
}

// ========== Compare tab (休み×授業) ==========
function refreshCompare() {
  const restRecs = filterRecords({ category: 'rest' });
  const classRecs = filterRecords({ category: 'class' });
  refreshSeatingCorrelation(restRecs, classRecs);
  const table = document.getElementById('compareTable');

  let html = `
    <thead>
      <tr>
        <th>児童</th>
        <th>休み時間 主な相手 (上位3)</th>
        <th>授業時間 主な相手 (上位3)</th>
        <th>共通</th>
        <th>類似度 (Jaccard)</th>
      </tr>
    </thead><tbody>
  `;

  for (const s of state.students) {
    const restP = computePartnerCounts(s.id, restRecs);
    const classP = computePartnerCounts(s.id, classRecs);
    const restSet = new Set(Object.keys(restP).map(Number));
    const classSet = new Set(Object.keys(classP).map(Number));
    const intersect = [...restSet].filter(x => classSet.has(x));
    const unionSize = new Set([...restSet, ...classSet]).size;
    const jaccard = unionSize === 0 ? 0 : intersect.length / unionSize;

    const top = (counts) => Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pid, c]) => {
        const p = getStudent(parseInt(pid));
        return p ? `${escapeHtml(p.name)}(${c})` : '';
      }).join(', ') || '<span class="muted">—</span>';

    const commonNames = intersect.map(id => escapeHtml(getStudent(id)?.name || '')).filter(Boolean).slice(0, 5).join(', ');
    // サンプルサイズ表示 + 信頼性ガード
    const restN = Object.values(restP).reduce((a,b)=>a+b, 0);
    const classN = Object.values(classP).reduce((a,b)=>a+b, 0);
    // 重み付きJaccard (Ruzicka): 共通相手の頻度の最小/最大の和
    let weightedJ = 0;
    if (restN > 0 && classN > 0) {
      const allKeys = new Set([...Object.keys(restP), ...Object.keys(classP)]);
      let numer = 0, denom = 0;
      for (const k of allKeys) {
        const r = restP[k] || 0, c = classP[k] || 0;
        numer += Math.min(r, c);
        denom += Math.max(r, c);
      }
      weightedJ = denom === 0 ? 0 : numer / denom;
    }
    const jacDisplay = (restN < 3 || classN < 3)
      ? `<span class="insufficient">記録不足 (休${restN}/授${classN})</span>`
      : `<span class="jaccard-bar"><span class="jaccard-fill" style="width:${Math.round(jaccard*100)}%"></span></span>${jaccard.toFixed(2)} <span class="muted small">/重${weightedJ.toFixed(2)} (休${restN}/授${classN})</span>`;
    const jacBar = jacDisplay;

    const rowClass = s.highlight ? 'highlight-row' : '';
    html += `
      <tr class="${rowClass}">
        <td><b>${escapeHtml(s.name)}</b></td>
        <td>${top(restP)}</td>
        <td>${top(classP)}</td>
        <td>${commonNames || '<span class="muted">—</span>'}</td>
        <td class="num">${jacBar}</td>
      </tr>
    `;
  }
  html += '</tbody>';
  table.innerHTML = html;
}

// 席替え経験と交友関係の相関分析
function refreshSeatingCorrelation(restRecs, classRecs) {
  const cont = document.getElementById('seatingCorrelation');
  if (!cont) return;
  const snaps = state.seatingSnapshots || [];
  if (!snaps.length) {
    cont.innerHTML = '<span class="muted">席替えタブで「💾 この座席を履歴保存」を実行すると分析が表示されます</span>';
    return;
  }
  const coGroup = computeCoGroupCounts();
  // 全ペア: 同班経験あり (count>=1) と 無し
  const ids = state.students.map(s => s.id);
  const restPairs = computePairs(restRecs); // {key: count}
  const classPairs = computePairs(classRecs);
  const havePairsRest = [], notPairsRest = [], havePairsClass = [], notPairsClass = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i+1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      const k = `${Math.min(a,b)}-${Math.max(a,b)}`;
      const inGroup = (coGroup[k] || 0) >= 1;
      const r = restPairs[k] || 0;
      const c = classPairs[k] || 0;
      (inGroup ? havePairsRest : notPairsRest).push(r);
      (inGroup ? havePairsClass : notPairsClass).push(c);
    }
  }
  const avg = arr => arr.length ? (arr.reduce((a,b) => a+b, 0) / arr.length) : 0;
  const haveR = avg(havePairsRest), notR = avg(notPairsRest);
  const haveC = avg(havePairsClass), notC = avg(notPairsClass);
  const ratioR = notR > 0 ? (haveR / notR) : (haveR > 0 ? Infinity : 0);
  const ratioC = notC > 0 ? (haveC / notC) : (haveC > 0 ? Infinity : 0);
  const verdict = (r) => {
    if (!isFinite(r) || r === 0) return '比較不可';
    if (r >= 2.0) return '🟢 強い正の相関 (席替えで作った繋がりが交友に発展)';
    if (r >= 1.3) return '🟡 弱い正の相関';
    if (r >= 0.8) return '⚪ ほぼ相関なし';
    return '🔴 負の相関 (同班経験が逆に距離を生んでいる可能性)';
  };
  // 児童ごとの「同班経験率→実際関わりに発展」率
  const sMap = new Map(state.students.map(s => [s.id, s]));
  const perStudent = state.students.map(s => {
    const myCoIds = new Set();
    for (const snap of snaps) for (const g of snap.groups) {
      if (g.includes(s.id)) g.forEach(x => { if (x !== s.id) myCoIds.add(x); });
    }
    const restPartners = new Set(restRecs.filter(r => r.subject === s.id || r.members.includes(s.id))
      .flatMap(r => [r.subject, ...r.members].filter(x => x !== s.id)));
    const classPartners = new Set(classRecs.filter(r => r.subject === s.id || r.members.includes(s.id))
      .flatMap(r => [r.subject, ...r.members].filter(x => x !== s.id)));
    const restHit = [...myCoIds].filter(x => restPartners.has(x)).length;
    const classHit = [...myCoIds].filter(x => classPartners.has(x)).length;
    return { s, total: myCoIds.size, restHit, classHit };
  }).filter(x => x.total > 0)
    .sort((a, b) => (b.restHit + b.classHit) / Math.max(1, b.total) - (a.restHit + a.classHit) / Math.max(1, a.total))
    .slice(0, 10);

  const perRows = perStudent.map(x => {
    const restPct = Math.round(x.restHit / x.total * 100);
    const classPct = Math.round(x.classHit / x.total * 100);
    return `<tr>
      <td>${escapeHtml(x.s.name)}</td>
      <td class="num">${x.total}人</td>
      <td class="num">${x.restHit} (${restPct}%)</td>
      <td class="num">${x.classHit} (${classPct}%)</td>
    </tr>`;
  }).join('');

  cont.innerHTML = `
    <div style="display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start;">
      <div style="min-width:340px;">
        <div><b>履歴された席替え:</b> ${snaps.length}回 (${snaps.map(s => escapeHtml(s.label)).join(' / ')})</div>
        <div style="margin-top:6px;">
          <b>同班経験ありペア vs 無しペアの平均共起回数:</b>
          <table style="margin-top:4px; border-collapse:collapse; font-size:12px;">
            <tr style="background:#f0f0f5;"><th style="padding:3px 8px; border:1px solid #ddd;">場面</th><th style="padding:3px 8px; border:1px solid #ddd;">同班経験あり</th><th style="padding:3px 8px; border:1px solid #ddd;">経験なし</th><th style="padding:3px 8px; border:1px solid #ddd;">比率</th></tr>
            <tr><td style="padding:3px 8px; border:1px solid #ddd;">休み時間</td><td class="num" style="padding:3px 8px; border:1px solid #ddd;">${haveR.toFixed(2)}</td><td class="num" style="padding:3px 8px; border:1px solid #ddd;">${notR.toFixed(2)}</td><td class="num" style="padding:3px 8px; border:1px solid #ddd;"><b>${isFinite(ratioR) ? ratioR.toFixed(2) + 'x' : '−'}</b></td></tr>
            <tr><td style="padding:3px 8px; border:1px solid #ddd;">授業時間</td><td class="num" style="padding:3px 8px; border:1px solid #ddd;">${haveC.toFixed(2)}</td><td class="num" style="padding:3px 8px; border:1px solid #ddd;">${notC.toFixed(2)}</td><td class="num" style="padding:3px 8px; border:1px solid #ddd;"><b>${isFinite(ratioC) ? ratioC.toFixed(2) + 'x' : '−'}</b></td></tr>
          </table>
          <div class="muted small" style="margin-top:6px;">休み時間: ${verdict(ratioR)}<br>授業時間: ${verdict(ratioC)}</div>
        </div>
      </div>
      <div style="flex:1; min-width:380px;">
        <b>児童別「同班だった子と実際に関わっている率」 TOP10:</b>
        <table style="border-collapse:collapse; font-size:12px; margin-top:4px; width:100%;">
          <tr style="background:#f0f0f5;"><th style="padding:3px 6px; border:1px solid #ddd;">児童</th><th style="padding:3px 6px; border:1px solid #ddd;">同班経験</th><th style="padding:3px 6px; border:1px solid #ddd;">休でも</th><th style="padding:3px 6px; border:1px solid #ddd;">授業でも</th></tr>
          ${perRows || '<tr><td colspan="4" class="muted">データなし</td></tr>'}
        </table>
      </div>
    </div>
  `;
}

// ========== Sociogram ==========
function initSocioFilters() {
  const sel = document.getElementById('socioScene');
  for (const sc of state.scenes) {
    const opt = document.createElement('option');
    opt.value = sc.id;
    opt.textContent = getSceneLabel(sc.id);
    sel.appendChild(opt);
  }
  ['socioScene', 'socioCategory', 'socioMin'].forEach(id => {
    document.getElementById(id).addEventListener('change', refreshSocio);
  });
  document.getElementById('socioRedraw').addEventListener('click', refreshSocio);
}

function refreshSocio() {
  const scene = document.getElementById('socioScene').value;
  const category = document.getElementById('socioCategory').value;
  const minCount = parseInt(document.getElementById('socioMin').value) || 1;
  const recs = filterRecords({ scene, category });

  // ペアの共起回数集計
  const pairs = {}; // "minId-maxId" => count
  for (const r of recs) {
    if (r.special) continue;
    const ids = [r.subject, ...r.members];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = Math.min(ids[i], ids[j]);
        const b = Math.max(ids[i], ids[j]);
        const key = `${a}-${b}`;
        pairs[key] = (pairs[key] || 0) + 1;
      }
    }
  }

  drawSociogram(pairs, minCount);
}

function drawSociogram(pairs, minCount) {
  const svg = document.getElementById('socioSvg');
  const w = svg.clientWidth || 900;
  const h = svg.clientHeight || 700;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = '';

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 60;
  const N = state.students.length;

  // 児童の位置を円形に配置
  const positions = {};
  state.students.forEach((s, i) => {
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    positions[s.id] = {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };
  });

  // エッジ（最低共起回数以上のペアのみ）
  const filteredPairs = Object.entries(pairs).filter(([_, c]) => c >= minCount);
  const maxCount = filteredPairs.reduce((m, [_, c]) => Math.max(m, c), 1);

  const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  for (const [key, count] of filteredPairs) {
    const [a, b] = key.split('-').map(Number);
    const pa = positions[a];
    const pb = positions[b];
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', pa.x);
    line.setAttribute('y1', pa.y);
    line.setAttribute('x2', pb.x);
    line.setAttribute('y2', pb.y);
    const sw = 1 + (count / maxCount) * 6;
    line.setAttribute('stroke-width', sw);
    line.setAttribute('class', 'socio-edge');
    line.dataset.a = a;
    line.dataset.b = b;
    edgeGroup.appendChild(line);
    // ホバー時のツールチップ
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${getStudentName(a)} - ${getStudentName(b)}: ${count}回`;
    line.appendChild(title);
  }
  svg.appendChild(edgeGroup);

  // ノード
  for (const s of state.students) {
    const p = positions[s.id];
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'socio-node');
    g.setAttribute('transform', `translate(${p.x}, ${p.y})`);
    g.dataset.studentId = s.id;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', 22);
    let fill = '#ffffff', stroke = '#4a90e2';
    if (s.highlight) { fill = '#fff3c4'; stroke = '#d4a017'; }
    if (s.watch) { fill = '#e8e0f3'; stroke = '#7e57c2'; }
    circle.setAttribute('fill', fill);
    circle.setAttribute('stroke', stroke);
    circle.setAttribute('stroke-width', 2);
    g.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dy', '0.35em');
    text.textContent = s.name.split(' ')[1] || s.name;
    g.appendChild(text);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = s.name + (s.note ? ` (${s.note})` : '');
    g.appendChild(title);

    g.addEventListener('mouseenter', () => highlightNode(s.id));
    g.addEventListener('mouseleave', () => clearHighlight());

    svg.appendChild(g);
  }
}

function highlightNode(id) {
  const svg = document.getElementById('socioSvg');
  svg.querySelectorAll('.socio-edge').forEach(line => {
    const a = parseInt(line.dataset.a);
    const b = parseInt(line.dataset.b);
    if (a === id || b === id) {
      line.classList.add('highlight-edge');
      line.classList.remove('dimmed');
    } else {
      line.classList.add('dimmed');
      line.classList.remove('highlight-edge');
    }
  });
}
function clearHighlight() {
  document.querySelectorAll('.socio-edge').forEach(line => {
    line.classList.remove('highlight-edge', 'dimmed');
  });
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
  const sel2 = document.getElementById('historyScene');
  for (const sc of state.scenes) {
    const opt = document.createElement('option');
    opt.value = sc.id;
    opt.textContent = getSceneLabel(sc.id);
    sel2.appendChild(opt);
  }
  ['historyStudent', 'historyScene'].forEach(id => {
    document.getElementById(id).addEventListener('change', refreshHistory);
  });
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedRecords);
}

function refreshHistory() {
  const sid = document.getElementById('historyStudent').value;
  const scene = document.getElementById('historyScene').value;
  let recs = state.records.slice().reverse();
  if (sid) {
    const id = parseInt(sid);
    recs = recs.filter(r => r.subject === id || r.members.includes(id));
  }
  if (scene) recs = recs.filter(r => r.scene === scene);
  document.getElementById('historyInfo').textContent = `${recs.length}件`;

  state.ui.selectedHistoryIds.clear();
  document.getElementById('deleteSelectedBtn').disabled = true;

  // 大量データ対策: 最大500件まで表示
  const LIMIT = 500;
  const displayed = recs.slice(0, LIMIT);
  const truncated = recs.length > LIMIT;

  let html = `
    <thead>
      <tr>
        <th><input type="checkbox" id="histAll"></th>
        <th>日時</th>
        <th>シーン</th>
        <th>主役</th>
        <th>一緒にいた子</th>
        <th>活動</th>
      </tr>
    </thead><tbody>
  `;
  for (const r of displayed) {
    const subj = escapeHtml(getStudentName(r.subject));
    let body = '';
    if (r.special) {
      body = `<i>${escapeHtml(SPECIAL_LABELS[r.special] || '')}</i>`;
    } else {
      body = r.members.map(id => escapeHtml(getStudentName(id))).join('・');
    }
    html += `
      <tr>
        <td><input type="checkbox" class="hist-check" data-id="${escapeHtml(r.id)}"></td>
        <td>${escapeHtml(formatDateTime(r.timestamp))}</td>
        <td>${escapeHtml(getSceneLabel(r.scene))}</td>
        <td><b>${subj}</b></td>
        <td class="members-cell">${body}</td>
        <td>${escapeHtml(r.activity || '')}</td>
      </tr>
    `;
  }
  if (truncated) {
    html += `<tr><td colspan="6" class="muted" style="text-align:center;padding:10px">…他${recs.length - LIMIT}件（フィルタで絞り込んでください）</td></tr>`;
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
  if (!confirm(`${n}件の記録を削除します。よろしいですか？`)) return;
  state.records = state.records.filter(r => !state.ui.selectedHistoryIds.has(r.id));
  state.ui.selectedHistoryIds.clear();
  saveState();
  showToast(`${n}件削除しました`);
  refreshHistory();
  refreshSidePanel();
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
  document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
  document.getElementById('exportCrossBtn')?.addEventListener('click', exportCrossCSV);
  document.getElementById('exportEnrichedBtn')?.addEventListener('click', exportForAIFukutannin);
  document.getElementById('archiveYearBtn')?.addEventListener('click', archiveCurrentYear);
  document.getElementById('viewArchivesBtn')?.addEventListener('click', listArchives);
  document.getElementById('resetBtn').addEventListener('click', resetAll);
  document.getElementById('saveActivitiesBtn').addEventListener('click', saveActivities);
}

function refreshSettings() {
  document.getElementById('statsTotal').textContent = state.records.length;
  const dates = new Set(state.records.map(r => r.date));
  document.getElementById('statsDays').textContent = dates.size;
  const studentSet = new Set();
  for (const r of state.records) {
    studentSet.add(r.subject);
    for (const m of r.members) studentSet.add(m);
  }
  document.getElementById('statsStudents').textContent = studentSet.size;
  if (state.records.length > 0) {
    const sorted = state.records.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    document.getElementById('statsFirstDate').textContent = sorted[0].date;
    document.getElementById('statsLastDate').textContent = sorted[sorted.length - 1].date;
  } else {
    document.getElementById('statsFirstDate').textContent = '—';
    document.getElementById('statsLastDate').textContent = '—';
  }

  // シーン編集 (XSS対策: createElement経由)
  const sceneTable = document.getElementById('sceneSettings');
  sceneTable.innerHTML = '';
  for (const sc of state.scenes) {
    const cur = state.settings.sceneLabels[sc.id] || sc.label;
    const tr = document.createElement('tr');
    const tdCat = document.createElement('td');
    tdCat.style.width = '80px';
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = sc.category;
    tdCat.appendChild(span);
    const tdInp = document.createElement('td');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.dataset.sceneId = sc.id;
    inp.value = cur;
    inp.addEventListener('change', () => {
      state.settings.sceneLabels[inp.dataset.sceneId] = inp.value;
      saveState();
      renderSceneButtons();
      showToast('シーン名を更新しました');
    });
    tdInp.appendChild(inp);
    tr.appendChild(tdCat);
    tr.appendChild(tdInp);
    sceneTable.appendChild(tr);
  }

  document.getElementById('activitySettings').value = state.activities.join('\n');
}

function saveActivities() {
  const text = document.getElementById('activitySettings').value;
  const list = text.split('\n').map(s => s.trim()).filter(Boolean);
  if (list.length === 0) { showToast('1つ以上入力してください', 'error'); return; }
  state.settings.customActivities = list;
  state.activities = list;
  saveState();
  renderActivityButtons();
  showToast('活動リストを保存しました');
}

function exportJSON() {
  const data = {
    version: APP_VERSION,
    exported_at: new Date().toISOString(),
    class: window.APP_DATA.class,
    students: state.students,
    settings: state.settings,
    records: state.records
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().slice(0, 10);
  a.download = `interaction-${ts}.json`;
  a.click();
  URL.revokeObjectURL(url);
  try { localStorage.setItem(LAST_BACKUP_KEY, String(Date.now())); } catch (_) {}
  updateHealthBadge();
  showToast(`JSONをエクスポートしました (${state.records.length}件)`);
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
    const normalized = data.records.map(normalizeRecord).filter(Boolean);
    if (normalized.length === 0) {
      showToast('有効な記録が見つかりません', 'error'); return;
    }
    const append = confirm(`${normalized.length}件のデータが見つかりました。\n\n[OK] = 既存データに追加 (重複ID除外)\n[キャンセル] = 全置換 (既存データ削除)`);
    if (append) {
      const existingIds = new Set(state.records.map(r => r.id));
      const newRecs = normalized.filter(r => !existingIds.has(r.id));
      state.records.push(...newRecs);
      saveState();
      refreshAll();
      updateHealthBadge();
      showToast(`✓ ${newRecs.length}件を追加 (重複${normalized.length - newRecs.length}件除外)`);
    } else {
      // 全置換: 自動退避
      if (!confirm('本当に既存データを全て置き換えますか？\n念のため、現在のデータを退避エクスポートします。')) return;
      try { exportJSON(); } catch (_) {}
      state.records = normalized;
      if (data.settings) {
        state.settings = mergeSettings(data.settings);
        if (state.settings.customActivities) state.activities = state.settings.customActivities;
        else state.activities = [...window.APP_DATA.activities];
        renderActivityButtons();
        renderSceneButtons();
      }
      saveState();
      refreshAll();
      updateHealthBadge();
      showToast(`✓ ${normalized.length}件で置換`);
    }
  };
  reader.readAsText(file);
}

function exportCSV() {
  const rows = [['id','timestamp','date','scene','category','mode','subject_id','subject_name','member_ids','member_names','special','activity']];
  for (const r of state.records) {
    rows.push([
      r.id, r.timestamp, r.date, r.scene, r.category, r.mode,
      r.subject, getStudentName(r.subject),
      r.members.join('|'),
      r.members.map(getStudentName).join('|'),
      r.special || '', r.activity || ''
    ]);
  }
  downloadCSV(rows, 'interaction-records');
  showToast('CSVをエクスポートしました');
}

function downloadCSV(rows, baseName) {
  const csv = '﻿' + rows.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().slice(0, 10);
  a.download = `${baseName}-${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// クロス集計CSV: 行=児童、列=相手 で共起回数マトリクス
function exportCrossCSV() {
  // ペアの共起カウントを児童×児童マトリクスに展開
  const matrix = {};
  for (const s of state.students) {
    matrix[s.id] = {};
    for (const t of state.students) matrix[s.id][t.id] = 0;
  }
  for (const r of state.records) {
    if (r.special) continue;
    const ids = [r.subject, ...r.members];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        matrix[a][b]++;
        matrix[b][a]++;
      }
    }
  }
  const header = ['児童', ...state.students.map(s => s.name)];
  const rows = [header];
  for (const s of state.students) {
    rows.push([s.name, ...state.students.map(t => matrix[s.id][t.id])]);
  }
  downloadCSV(rows, 'interaction-cross');
  showToast('クロス集計CSVを出力しました (Excel条件付き書式で可視化)');
}

function resetAll() {
  // 直近24時間以内にエクスポートしていない場合は強制ガード
  const lastBackup = parseInt(localStorage.getItem(LAST_BACKUP_KEY) || '0');
  const hoursSinceBackup = lastBackup ? (Date.now() - lastBackup) / 3600000 : 999;
  if (hoursSinceBackup > 24 && state.records.length > 0) {
    showToast('まずエクスポートしてください (直近24h以内のBU必須)', 'error');
    return;
  }
  const confirmInput = prompt('全データを削除します。確認のため「DELETE」と入力してください:');
  if (confirmInput !== 'DELETE') {
    showToast('削除をキャンセルしました', 'success');
    return;
  }
  state.records = [];
  saveState();
  clearSelection();
  refreshAll();
  updateHealthBadge();
  showToast('全データを削除しました');
  refreshAll();
}

// ========== Refresh All ==========
// ========== ほめたいモード ==========

function initPraiseEvents() {
  // モード切替
  document.querySelectorAll('.record-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchRecordMode(btn.dataset.recordMode));
  });

  // 日付ピッカー
  const dateInp = document.getElementById('praiseDate');
  if (dateInp) {
    dateInp.value = todayISO();
    dateInp.addEventListener('change', () => refreshPraiseSidePanel());
    document.getElementById('praiseDateTodayBtn').addEventListener('click', () => {
      dateInp.value = todayISO();
      refreshPraiseSidePanel();
    });
  }

  // ■判定基準ボタン群
  initPeriodBtnGroup('praiseMarkPeriodBtns', state.ui.praiseMarkPeriod, val => {
    state.ui.praiseMarkPeriod = val;
    refreshPraiseGridState();
  });

  // クイックタグ
  document.querySelectorAll('#praiseQuickTags .praise-tag-btn').forEach(b => {
    b.addEventListener('click', () => {
      const tag = b.dataset.tag;
      const ta = document.getElementById('praiseInput');
      if (!tag) { ta.focus(); return; }
      ta.value = ta.value ? (ta.value + ' / ' + tag) : tag;
      // フラッシュ
      b.classList.add('active');
      setTimeout(() => b.classList.remove('active'), 350);
    });
  });

  // 保存・キャンセル
  const saveBtn = document.getElementById('savePraiseBtn');
  if (saveBtn) saveBtn.addEventListener('click', savePraise);
  const cancelBtn = document.getElementById('cancelPraiseBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', cancelPraiseInput);

  // 今日のほめカード→今日のほめ一覧タブへ
  const todayCard = document.getElementById('todayPraiseCard');
  if (todayCard) todayCard.addEventListener('click', () => {
    switchTab('praise-list');
    const periodInp = document.getElementById('praiseListPeriod');
    if (periodInp) {
      periodInp.value = 'today';
      const grp = document.getElementById('praiseListPeriodBtns');
      if (grp) grp.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.value === 'today'));
    }
    refreshPraiseList();
  });

  // テキスト入力: Ctrl+Enterで保存
  const inp = document.getElementById('praiseInput');
  if (inp) {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        savePraise();
      }
    });
  }

  // ほめたい一覧タブの期間ボタン
  initPeriodBtnGroup('praiseListPeriodBtns', state.ui.praiseListPeriod, val => {
    state.ui.praiseListPeriod = val;
    const inp = document.getElementById('praiseListPeriod');
    if (inp) inp.value = val;
    refreshPraiseList();
  });

  const ls = document.getElementById('praiseListStudent');
  if (ls) {
    state.students.forEach(s => {
      const o = document.createElement('option');
      o.value = String(s.id);
      o.textContent = `${s.id}. ${s.name}`;
      ls.appendChild(o);
    });
    ls.addEventListener('change', refreshPraiseList);
  }
  const lk = document.getElementById('praiseListKeyword');
  if (lk) lk.addEventListener('input', refreshPraiseList);
  const exportBtn = document.getElementById('exportPraiseCsvBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportPraiseCsv);
}

// 期間ボタン群の汎用初期化
function initPeriodBtnGroup(groupId, initValue, onChange) {
  const grp = document.getElementById(groupId);
  if (!grp) return;
  grp.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.value === initValue);
    b.addEventListener('click', () => {
      grp.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      onChange(b.dataset.value);
    });
  });
}

function switchRecordMode(mode) {
  if (!['interaction', 'praise', 'evaluation', 'aba'].includes(mode)) mode = 'interaction';
  state.ui.recordMode = mode;
  document.querySelectorAll('.record-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.recordMode === mode);
  });
  document.getElementById('interactionRecordView').classList.toggle('hidden', mode !== 'interaction');
  document.getElementById('praiseRecordView').classList.toggle('hidden', mode !== 'praise');
  document.getElementById('evaluationRecordView').classList.toggle('hidden', mode !== 'evaluation');
  document.getElementById('abaRecordView').classList.toggle('hidden', mode !== 'aba');
  if (mode === 'praise') {
    refreshPraiseGridState();
    refreshPraiseSidePanel();
  } else if (mode === 'evaluation') {
    refreshEvalGridState();
    refreshEvalSidePanel();
  } else if (mode === 'aba') {
    refreshAbaSidePanel();
  }
}

function renderPraiseStudentGrid() {
  const grid = document.getElementById('praiseStudentGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const s of state.students) {
    const btn = document.createElement('button');
    btn.className = 'student-btn';
    btn.dataset.studentId = s.id;
    btn.title = `${s.kana}${s.note ? ' / ' + s.note : ''} (出席番号 ${s.id})`;
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = s.id;
    btn.appendChild(num);
    btn.appendChild(document.createTextNode(s.name));
    btn.addEventListener('click', () => onPraiseStudentClick(s.id));
    grid.appendChild(btn);
  }
}

// 期間判定: 'today' / 'week' / 'all'
function isInPraisePeriod(p, period) {
  if (period === 'all') return true;
  const today = todayISO();
  if (period === 'today') return p.date === today;
  if (period === 'week') {
    // 今週 = 今日を含む過去7日間
    const t = new Date(p.date + 'T00:00:00').getTime();
    const todayMs = new Date(today + 'T00:00:00').getTime();
    return (todayMs - t) <= 6 * 86400000 && (todayMs - t) >= 0;
  }
  return true;
}

function computePraisedTodaySet() {
  const today = todayISO();
  const set = new Set();
  for (const p of state.praises) {
    if (p.date === today) set.add(p.studentId);
  }
  return set;
}

function computePraiseUndercountedSet(period) {
  // 期間内のほめ件数を児童ごとに集計し、下位1/3を返す。
  // 全員0件 or 全体最大が0 ならマークしない。
  const counts = new Map();
  for (const s of state.students) counts.set(s.id, 0);
  for (const p of state.praises) {
    if (!isInPraisePeriod(p, period)) continue;
    counts.set(p.studentId, (counts.get(p.studentId) || 0) + 1);
  }
  const arr = state.students.map(s => counts.get(s.id) || 0);
  const max = arr.length ? Math.max(...arr) : 0;
  if (max < 1) return new Set();  // ほめ記録がまだ無い
  const sorted = [...arr].sort((a, b) => a - b);
  const cutoffIdx = Math.max(1, Math.floor(state.students.length / 3));
  const threshold = sorted[cutoffIdx - 1];
  const result = new Set();
  state.students.forEach((s, i) => {
    if (arr[i] <= threshold && arr[i] < max) result.add(s.id);
  });
  return result;
}

function refreshPraiseGridState() {
  const todaySet = computePraisedTodaySet();
  const lowSet = computePraiseUndercountedSet(state.ui.praiseMarkPeriod);
  document.querySelectorAll('#praiseStudentGrid .student-btn').forEach(btn => {
    const id = parseInt(btn.dataset.studentId);
    btn.classList.remove('subject', 'selected', 'covered-today', 'watch');
    if (todaySet.has(id)) btn.classList.add('covered-today');
    if (lowSet.has(id)) btn.classList.add('watch');
    if (state.ui.praiseTargetIds.has(id)) btn.classList.add('selected');
  });
  refreshPraiseChips();
  refreshPraiseSaveBtn();
}

function refreshPraiseChips() {
  const cont = document.getElementById('praiseSelectedChips');
  const title = document.getElementById('praiseTargetName');
  if (!cont) return;
  const ids = [...state.ui.praiseTargetIds];
  if (title) title.textContent = `対象児童 (${ids.length}人選択中)`;
  if (!ids.length) { cont.innerHTML = ''; return; }
  cont.innerHTML = ids.map(id => {
    const s = state.students.find(x => x.id === id);
    return `<span class="chip" data-id="${id}">${s ? s.name : id} <button data-remove="${id}" type="button">×</button></span>`;
  }).join('');
  cont.querySelectorAll('button[data-remove]').forEach(b => {
    b.addEventListener('click', () => {
      state.ui.praiseTargetIds.delete(parseInt(b.dataset.remove));
      refreshPraiseGridState();
    });
  });
}

function refreshPraiseSaveBtn() {
  const btn = document.getElementById('savePraiseBtn');
  if (!btn) return;
  btn.disabled = state.ui.praiseTargetIds.size === 0;
  btn.textContent = state.ui.editingPraiseId
    ? '💾 編集を保存'
    : `💾 ${state.ui.praiseTargetIds.size > 0 ? state.ui.praiseTargetIds.size + '人に' : ''}保存`;
}

function onPraiseStudentClick(id) {
  // 編集モード中は通常クリックを無効化
  if (state.ui.editingPraiseId) {
    showToast('編集モード中です。先にキャンセルまたは保存してください', 'error');
    return;
  }
  if (state.ui.praiseTargetIds.has(id)) {
    state.ui.praiseTargetIds.delete(id);
  } else {
    state.ui.praiseTargetIds.add(id);
  }
  refreshPraiseGridState();
}

function cancelPraiseInput() {
  state.ui.praiseTargetIds = new Set();
  state.ui.editingPraiseId = null;
  const inp = document.getElementById('praiseInput');
  inp.value = '';
  refreshPraiseGridState();
  refreshTodayPraiseEditList();
}

function savePraise() {
  const inp = document.getElementById('praiseInput');
  const content = (inp.value || '').trim();
  if (!content) { showToast('タグまたは詳細を入力してください', 'error'); inp.focus(); return; }
  const dateInp = document.getElementById('praiseDate');
  const date = (dateInp && dateInp.value) ? dateInp.value : todayISO();

  // 編集モード: 既存の1件を更新
  if (state.ui.editingPraiseId) {
    const ex = state.praises.find(p => p.id === state.ui.editingPraiseId);
    if (ex) {
      ex.content = content;
      saveState();
      if (typeof pushPraiseToGas === 'function') pushPraiseToGas(ex, 'edit').catch(() => {});
      showToast(`「${ex.content.slice(0, 20)}」を更新`);
    }
    state.ui.editingPraiseId = null;
    inp.value = '';
    refreshPraiseGridState();
    refreshPraiseSidePanel();
    refreshTodayPraiseEditList();
    if (state.ui.currentTab === 'praise-list') refreshPraiseList();
    return;
  }

  const ids = [...state.ui.praiseTargetIds];
  if (!ids.length) { showToast('児童を1人以上選んでください', 'error'); return; }
  let saved = 0;
  for (const id of ids) {
    const p = normalizePraise({ studentId: id, content, date });
    if (!p) continue;
    state.praises.push(p);
    if (typeof pushPraiseToGas === 'function') pushPraiseToGas(p, 'add').catch(() => {});
    saved++;
  }
  saveState();
  showToast(`${saved}人 にほめを記録しました`);
  // 児童選択は解除、テキストはクリアして次の連続記録へ
  state.ui.praiseTargetIds = new Set();
  inp.value = '';
  refreshPraiseGridState();
  refreshPraiseSidePanel();
  refreshTodayPraiseEditList();
  if (state.ui.currentTab === 'praise-list') refreshPraiseList();
}

function refreshPraiseSidePanel() {
  const today = todayISO();
  const todays = state.praises.filter(p => p.date === today);
  const cnt = document.getElementById('todayPraiseCount');
  if (cnt) cnt.textContent = todays.length;
  const cov = document.getElementById('todayPraiseCovered');
  if (cov) cov.textContent = new Set(todays.map(p => p.studentId)).size;
  refreshTodayPraiseEditList();
}

function refreshTodayPraiseEditList() {
  const ul = document.getElementById('todayPraiseEditList');
  if (!ul) return;
  const today = todayISO();
  const todays = state.praises.filter(p => p.date === today)
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  if (!todays.length) {
    ul.innerHTML = '<li class="muted">今日の記録はまだありません</li>';
    return;
  }
  const sMap = new Map(state.students.map(s => [s.id, s]));
  ul.innerHTML = todays.map(p => {
    const s = sMap.get(p.studentId);
    return `<li style="padding:4px 6px; border-bottom:1px solid #eee; cursor:pointer;" data-pid="${p.id}" title="クリックで詳細追加・編集">
      <b>${s ? s.name : '?'}:</b> ${escapeHtml(p.content)}
    </li>`;
  }).join('');
  ul.querySelectorAll('li[data-pid]').forEach(li => {
    li.addEventListener('click', () => beginEditPraise(li.dataset.pid));
  });
}

function beginEditPraise(praiseId) {
  const p = state.praises.find(x => x.id === praiseId);
  if (!p) return;
  state.ui.editingPraiseId = praiseId;
  state.ui.praiseTargetIds = new Set();
  const s = state.students.find(x => x.id === p.studentId);
  document.getElementById('praiseTargetName').textContent = `編集中: ${s ? s.name : ''}`;
  const inp = document.getElementById('praiseInput');
  inp.value = p.content;
  inp.focus();
  refreshPraiseGridState();
  refreshPraiseSaveBtn();
  showToast(`「${(p.content || '').slice(0, 20)}」を編集中。保存ボタンで確定`);
}

// ========== ほめたい一覧タブ ==========

function refreshPraiseList() {
  const period = (document.getElementById('praiseListPeriod') || {}).value || 'week';
  const studentIdRaw = (document.getElementById('praiseListStudent') || {}).value || '';
  const kw = ((document.getElementById('praiseListKeyword') || {}).value || '').trim().toLowerCase();
  const studentId = studentIdRaw ? parseInt(studentIdRaw) : null;

  const filtered = state.praises.filter(p => {
    if (!isInPraisePeriod(p, period)) return false;
    if (studentId && p.studentId !== studentId) return false;
    if (kw && !p.content.toLowerCase().includes(kw)) return false;
    return true;
  }).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  const info = document.getElementById('praiseListInfo');
  if (info) info.textContent = `${filtered.length}件`;

  // 児童別ランキング
  renderPraiseSummary(period);

  const ul = document.getElementById('praiseList');
  if (!ul) return;
  if (!filtered.length) {
    ul.innerHTML = '<li class="empty">該当するほめ記録はありません</li>';
    return;
  }
  const sMap = new Map(state.students.map(s => [s.id, s]));
  ul.innerHTML = filtered.map(p => {
    const s = sMap.get(p.studentId);
    const name = s ? `${s.id}. ${s.name}` : `(ID:${p.studentId})`;
    const time = p.timestamp ? new Date(p.timestamp).toLocaleString('ja-JP', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : p.date;
    return `<li data-id="${p.id}">
      <div class="praise-meta">
        <div>${time}</div>
        <div class="praise-name">${escapeHtml(name)}</div>
      </div>
      <div class="praise-content">${escapeHtml(p.content)}</div>
      <div class="praise-actions">
        <button class="ghost danger" data-action="delete" data-id="${p.id}">削除</button>
      </div>
    </li>`;
  }).join('');

  // 削除イベント
  ul.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deletePraise(btn.dataset.id));
  });
}

function renderPraiseSummary(period) {
  const cont = document.getElementById('praiseSummary');
  if (!cont) return;
  const counts = new Map();
  for (const s of state.students) counts.set(s.id, 0);
  for (const p of state.praises) {
    if (!isInPraisePeriod(p, period)) continue;
    counts.set(p.studentId, (counts.get(p.studentId) || 0) + 1);
  }
  const periodLabel = period === 'today' ? '今日' : period === 'week' ? '今週' : '累計';
  // ほめ0件の児童 (期間内)
  const zero = state.students.filter(s => (counts.get(s.id) || 0) === 0);
  const top = state.students
    .map(s => ({ s, n: counts.get(s.id) || 0 }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  const topHtml = top.map(x => `<li><b>${x.s.name}</b> ${x.n}件</li>`).join('');
  const zeroHtml = zero.length
    ? zero.slice(0, 28).map(s => `<li class="zero">${s.name}</li>`).join('')
    : '<li class="muted">なし（全員ほめ済）</li>';
  cont.innerHTML = `
    <h3>${periodLabel}のサマリ</h3>
    <div style="margin-bottom:6px;"><b>ほめ件数 上位:</b></div>
    <ul class="praise-rank-list">${topHtml || '<li class="muted">記録なし</li>'}</ul>
    <div style="margin:8px 0 6px;"><b>${periodLabel}内でまだほめていない子 (${zero.length}人):</b></div>
    <ul class="praise-rank-list">${zeroHtml}</ul>
  `;
}

function deletePraise(id) {
  if (!confirm('このほめ記録を削除しますか？')) return;
  const idx = state.praises.findIndex(p => p.id === id);
  if (idx < 0) return;
  state.praises.splice(idx, 1);
  saveState();
  if (typeof pushPraiseToGas === 'function') pushPraiseToGas({ id }, 'delete').catch(() => {});
  refreshPraiseList();
  refreshPraiseGridState();
  refreshPraiseSidePanel();
  showToast('削除しました');
}

function exportPraiseCsv() {
  if (!state.praises.length) { showToast('ほめ記録がありません', 'error'); return; }
  const sMap = new Map(state.students.map(s => [s.id, s]));
  const rows = [['date', 'time', 'student_id', 'student_name', 'content']];
  for (const p of state.praises) {
    const s = sMap.get(p.studentId);
    const time = p.timestamp ? new Date(p.timestamp).toLocaleTimeString('ja-JP') : '';
    rows.push([p.date, time, p.studentId, s ? s.name : '', p.content.replace(/[\r\n]+/g, ' ')]);
  }
  const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `praises_${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ========== 評価モード ==========

function initEvaluationEvents() {
  if (!state.subjects || state.subjects.length === 0) return;

  // 教科プルダウン
  const subjSel = document.getElementById('evalSubject');
  if (subjSel) {
    subjSel.innerHTML = '';
    state.subjects.forEach(sub => {
      const o = document.createElement('option');
      o.value = sub.id;
      o.textContent = sub.label;
      subjSel.appendChild(o);
    });
    if (!state.ui.evalSubjectId) state.ui.evalSubjectId = state.subjects[0].id;
    subjSel.value = state.ui.evalSubjectId;
    subjSel.addEventListener('change', () => {
      state.ui.evalSubjectId = subjSel.value;
      state.ui.evalUnitId = ''; // 単元リセット
      renderEvalUnitOptions();
      refreshEvalUI();
      saveState();
    });
  }

  // 単元プルダウン
  renderEvalUnitOptions();
  const unitSel = document.getElementById('evalUnit');
  if (unitSel) {
    unitSel.addEventListener('change', () => {
      state.ui.evalUnitId = unitSel.value;
      refreshEvalUI();
      saveState();
    });
  }

  // 観点ボタン
  const vpCont = document.getElementById('evalViewpoints');
  if (vpCont) {
    vpCont.innerHTML = '';
    state.viewpoints.forEach(vp => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-btn';
      b.dataset.viewpoint = vp.id;
      b.innerHTML = `${vp.short || vp.label[0]}<small>${vp.label}</small>`;
      if (vp.id === state.ui.evalViewpoint) b.classList.add('active');
      b.addEventListener('click', () => {
        state.ui.evalViewpoint = vp.id;
        vpCont.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.viewpoint === vp.id));
        refreshEvalUI();
        saveState();
      });
      vpCont.appendChild(b);
    });
  }

  // 尺度切替
  document.querySelectorAll('[data-eval-scale]').forEach(b => {
    if (parseInt(b.dataset.evalScale) === state.ui.evalScale) b.classList.add('active');
    else b.classList.remove('active');
    b.addEventListener('click', () => {
      state.ui.evalScale = parseInt(b.dataset.evalScale);
      document.querySelectorAll('[data-eval-scale]').forEach(x =>
        x.classList.toggle('active', parseInt(x.dataset.evalScale) === state.ui.evalScale)
      );
      state.ui.evalActiveGrade = null;
      renderEvalGradeButtons();
      saveState();
    });
  });

  renderEvalGradeButtons();
  renderEvalStudentGrid();
  refreshEvalUI();

  // 評価一覧タブのフィルタ
  const lsubj = document.getElementById('evalListSubject');
  if (lsubj) {
    state.subjects.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.label;
      lsubj.appendChild(o);
    });
    lsubj.addEventListener('change', () => { populateEvalListUnits(); refreshEvalList(); });
  }
  populateEvalListUnits();
  const lunit = document.getElementById('evalListUnit');
  if (lunit) lunit.addEventListener('change', refreshEvalList);
  const lvp = document.getElementById('evalListViewpoint');
  if (lvp) lvp.addEventListener('change', refreshEvalList);
  const lp = document.getElementById('evalListPeriod');
  if (lp) lp.addEventListener('change', refreshEvalList);
  const matrixBtn = document.getElementById('evalMatrixBtn');
  if (matrixBtn) matrixBtn.addEventListener('click', toggleEvalMatrix);
  const exportBtn = document.getElementById('exportEvalCsvBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportEvalCsv);
}

function renderEvalUnitOptions() {
  const sel = document.getElementById('evalUnit');
  if (!sel) return;
  sel.innerHTML = '';
  const units = state.units.filter(u => u.subject === state.ui.evalSubjectId && !u.archived);
  units.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  units.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id;
    o.textContent = `${u.sequence ? u.sequence + '. ' : ''}${u.name}${u.period ? ' (' + u.period + ')' : ''}`;
    sel.appendChild(o);
  });
  if (!state.ui.evalUnitId && units.length) state.ui.evalUnitId = units[0].id;
  if (state.ui.evalUnitId) sel.value = state.ui.evalUnitId;
}

function populateEvalListUnits() {
  const sel = document.getElementById('evalListUnit');
  if (!sel) return;
  const subj = (document.getElementById('evalListSubject') || {}).value || '';
  sel.innerHTML = '<option value="">すべて</option>';
  const units = state.units.filter(u => !subj || u.subject === subj);
  units.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  units.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id;
    o.textContent = `[${(state.subjects.find(s => s.id === u.subject) || {}).label || u.subject}] ${u.name}`;
    sel.appendChild(o);
  });
}

function getEvalGrades() {
  return state.ui.evalScale === 5 ? ['5','4','3','2','1'] : ['A','B','C'];
}

function renderEvalGradeButtons() {
  const cont = document.getElementById('evalGradeButtons');
  if (!cont) return;
  cont.innerHTML = '';
  const grades = getEvalGrades();
  grades.forEach(g => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'eval-grade-btn grade-' + g;
    b.dataset.grade = g;
    b.textContent = g;
    if (state.ui.evalActiveGrade === g) b.classList.add('active');
    b.addEventListener('click', () => {
      // 児童先行モード中: 選択児童に対してこの評価値を保存
      if (state.ui.evalActiveStudent) {
        applyEvaluation(state.ui.evalActiveStudent, g);
        state.ui.evalActiveStudent = null;
        refreshEvalGridState();
        return;
      }
      // 通常モード: トグル
      state.ui.evalActiveGrade = (state.ui.evalActiveGrade === g) ? null : g;
      cont.querySelectorAll('.eval-grade-btn').forEach(x => x.classList.toggle('active', x.dataset.grade === state.ui.evalActiveGrade));
      updateEvalStatusLabel();
    });
    cont.appendChild(b);
  });
}

function updateEvalStatusLabel() {
  refreshEvalGridState();
}

function renderEvalStudentGrid() {
  const grid = document.getElementById('evalStudentGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const s of state.students) {
    const btn = document.createElement('button');
    btn.className = 'student-btn';
    btn.dataset.studentId = s.id;
    btn.title = `${s.kana} (出席番号 ${s.id})`;
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = s.id;
    btn.appendChild(num);
    btn.appendChild(document.createTextNode(s.name));
    btn.addEventListener('click', () => onEvalStudentClick(s.id));
    grid.appendChild(btn);
  }
}

// 全件取得 (補助簿: 同じ単元×観点に複数記録あり得る)
function findEvaluations(studentId, subjectId, unitId, viewpoint) {
  return state.evaluations
    .filter(e => e.studentId === studentId && e.subjectId === subjectId &&
                 e.unitId === unitId && e.viewpoint === viewpoint)
    .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
}

// 最新1件 (表示用)。後方互換として findEvaluation 名を維持
function findEvaluation(studentId, subjectId, unitId, viewpoint) {
  const list = findEvaluations(studentId, subjectId, unitId, viewpoint);
  return list.length ? list[list.length - 1] : null;
}

function refreshEvalGridState() {
  const subj = state.ui.evalSubjectId, unit = state.ui.evalUnitId, vp = state.ui.evalViewpoint;
  document.querySelectorAll('#evalStudentGrid .student-btn').forEach(btn => {
    const id = parseInt(btn.dataset.studentId);
    btn.classList.remove('covered-today', 'watch', 'subject', 'eval-active-student');
    btn.querySelectorAll('.eval-grade-tag, .eval-count-badge').forEach(t => t.remove());
    const list = findEvaluations(id, subj, unit, vp);
    const ev = list.length ? list[list.length - 1] : null;
    if (ev) {
      btn.classList.add('covered-today');
      const tag = document.createElement('span');
      tag.className = 'eval-grade-tag';
      tag.textContent = ev.grade;
      btn.appendChild(tag);
      if (list.length >= 2) {
        const badge = document.createElement('span');
        badge.className = 'eval-count-badge';
        badge.textContent = list.length;
        badge.title = `${list.length}回記録 (補助簿)`;
        btn.appendChild(badge);
      }
    } else {
      btn.classList.add('watch');
    }
    if (id === state.ui.evalActiveStudent) {
      btn.classList.add('eval-active-student');
    }
  });
  // 評価値ボタン側の表示更新（児童先行時にヒント）
  const lbl = document.getElementById('evalStatusLabel');
  if (lbl) {
    if (state.ui.evalActiveStudent) {
      const s = state.students.find(x => x.id === state.ui.evalActiveStudent);
      lbl.textContent = `${s ? s.name : ''} の評価値を選択 → タップで保存`;
      lbl.style.color = '#c62828';
    } else if (state.ui.evalActiveGrade) {
      lbl.textContent = `評価値「${state.ui.evalActiveGrade}」選択中 — 児童をタップで一括記録`;
      lbl.style.color = '#2f6db5';
    } else {
      lbl.textContent = '評価値を選んで児童をタップ、または児童を選んで評価値をタップ';
      lbl.style.color = '';
    }
  }
}

function refreshEvalUI() {
  refreshEvalGridState();
  refreshEvalSidePanel();
  refreshEvalCriteriaText();
}

function refreshEvalCriteriaText() {
  const u = state.units.find(x => x.id === state.ui.evalUnitId);
  const text = document.getElementById('evalCriteriaText');
  const hint = document.getElementById('evalCriteriaHint');
  if (!u || !u.criteria) {
    if (text) text.textContent = '単元を選択すると評価基準を表示';
    if (hint) hint.textContent = '';
    return;
  }
  const vp = state.ui.evalViewpoint;
  const c = u.criteria[vp] || '';
  const vpLabel = (state.viewpoints.find(v => v.id === vp) || {}).label || vp;
  if (text) text.textContent = `[${vpLabel}]\n${c}`;
  if (hint) hint.textContent = `${u.name}（${u.period || ''}）`;
}

function refreshEvalSidePanel() {
  const today = todayISO();
  const todays = state.evaluations.filter(e => e.date === today);
  const cnt = document.getElementById('todayEvalCount');
  if (cnt) cnt.textContent = todays.length;

  const subj = state.ui.evalSubjectId, unit = state.ui.evalUnitId;
  const prog = document.getElementById('evalUnitProgress');
  if (prog) {
    const lines = state.viewpoints.map(vp => {
      const done = state.students.filter(s => findEvaluation(s.id, subj, unit, vp.id)).length;
      const pct = Math.round(done / state.students.length * 100);
      return `<div style="display:flex;justify-content:space-between;font-size:12px;margin:2px 0;">
        <span>${vp.short || vp.label}</span>
        <span><b>${done}</b>/${state.students.length} (${pct}%)</span>
      </div>`;
    }).join('');
    prog.innerHTML = lines;
  }
}

function onEvalStudentClick(studentId) {
  if (!state.ui.evalSubjectId || !state.ui.evalUnitId || !state.ui.evalViewpoint) {
    showToast('教科・単元・観点を選択してください', 'error');
    return;
  }
  // 評価値先行モード: クリック即記録
  if (state.ui.evalActiveGrade) {
    applyEvaluation(studentId, state.ui.evalActiveGrade);
    return;
  }
  // 児童先行モード: 児童をハイライト → 評価値ボタン待ち
  if (state.ui.evalActiveStudent === studentId) {
    state.ui.evalActiveStudent = null; // 同児童再タップでキャンセル
  } else {
    state.ui.evalActiveStudent = studentId;
  }
  refreshEvalGridState();
}

// 評価記録を **必ず append** (補助簿として何度でも記録可能)。既存編集はしない。
function applyEvaluation(studentId, grade) {
  const ev = normalizeEvaluation({
    studentId,
    subjectId: state.ui.evalSubjectId,
    unitId: state.ui.evalUnitId,
    viewpoint: state.ui.evalViewpoint,
    grade,
    scale: state.ui.evalScale,
    date: todayISO()
  });
  if (!ev) { showToast('保存に失敗', 'error'); return; }
  state.evaluations.push(ev);
  saveState();
  if (typeof pushEvaluationToGas === 'function') pushEvaluationToGas(ev, 'add').catch(() => {});
  const s = state.students.find(x => x.id === studentId);
  const list = findEvaluations(studentId, ev.subjectId, ev.unitId, ev.viewpoint);
  showToast(`${s ? s.name : ''}: ${grade}（この単元観点で${list.length}件目）`);
  refreshEvalUI();
  if (state.ui.currentTab === 'eval-list') refreshEvalList();
}

// ========== 評価一覧タブ ==========

function refreshEvalList() {
  const subj = (document.getElementById('evalListSubject') || {}).value || '';
  const unit = (document.getElementById('evalListUnit') || {}).value || '';
  const vp = (document.getElementById('evalListViewpoint') || {}).value || '';
  const period = (document.getElementById('evalListPeriod') || {}).value || 'all';

  const filtered = state.evaluations.filter(e => {
    if (subj && e.subjectId !== subj) return false;
    if (unit && e.unitId !== unit) return false;
    if (vp && e.viewpoint !== vp) return false;
    if (!isInPraisePeriod(e, period)) return false;
    return true;
  }).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  const info = document.getElementById('evalListInfo');
  if (info) info.textContent = `${filtered.length}件`;

  // サマリ: 教科×観点別件数
  const summary = document.getElementById('evalListSummary');
  if (summary) {
    const counts = new Map();
    for (const e of filtered) {
      const k = `${e.subjectId}/${e.viewpoint}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const lines = [];
    state.subjects.forEach(s => {
      state.viewpoints.forEach(v => {
        const k = `${s.id}/${v.id}`;
        const c = counts.get(k) || 0;
        if (c > 0) lines.push(`<li><b>${s.label}/${v.short}</b> ${c}件</li>`);
      });
    });
    summary.innerHTML = `<h3>件数サマリ</h3><ul class="praise-rank-list">${lines.join('') || '<li class="muted">なし</li>'}</ul>`;
  }

  const ul = document.getElementById('evalList');
  if (!ul) return;
  if (!filtered.length) {
    ul.innerHTML = '<li class="empty">該当する評価記録はありません</li>';
    return;
  }
  const sMap = new Map(state.students.map(s => [s.id, s]));
  const subjMap = new Map(state.subjects.map(s => [s.id, s]));
  const unitMap = new Map(state.units.map(u => [u.id, u]));
  const vpMap = new Map(state.viewpoints.map(v => [v.id, v]));
  ul.innerHTML = filtered.slice(0, 500).map(e => {
    const s = sMap.get(e.studentId);
    const sub = subjMap.get(e.subjectId);
    const u = unitMap.get(e.unitId);
    const v = vpMap.get(e.viewpoint);
    const name = s ? `${s.id}. ${s.name}` : `(ID:${e.studentId})`;
    const time = e.timestamp ? new Date(e.timestamp).toLocaleString('ja-JP', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : e.date;
    return `<li data-id="${e.id}">
      <div class="praise-meta">
        <div>${time}</div>
        <div class="praise-name">${escapeHtml(name)}</div>
      </div>
      <div class="praise-content">
        <b>${sub ? sub.label : e.subjectId}</b> / ${u ? u.name : e.unitId} / ${v ? v.short : e.viewpoint} →
        <span class="eval-grade-inline grade-${e.grade}">${e.grade}</span>
        <span class="muted small">(${e.scale}段階)</span>
      </div>
      <div class="praise-actions">
        <button class="ghost danger" data-action="delete-eval" data-id="${e.id}">削除</button>
      </div>
    </li>`;
  }).join('');
  ul.querySelectorAll('button[data-action="delete-eval"]').forEach(btn => {
    btn.addEventListener('click', () => deleteEvaluation(btn.dataset.id));
  });
}

function deleteEvaluation(id) {
  if (!confirm('この評価記録を削除しますか？')) return;
  const idx = state.evaluations.findIndex(e => e.id === id);
  if (idx < 0) return;
  state.evaluations.splice(idx, 1);
  saveState();
  if (typeof pushEvaluationToGas === 'function') pushEvaluationToGas({ id }, 'delete').catch(() => {});
  refreshEvalList();
  refreshEvalGridState();
  showToast('削除しました');
}

function toggleEvalMatrix() {
  const main = document.getElementById('evalListContent');
  const mat = document.getElementById('evalMatrixContent');
  if (mat.classList.contains('hidden')) {
    mat.classList.remove('hidden');
    main.classList.add('hidden');
    renderEvalMatrix();
    document.getElementById('evalMatrixBtn').textContent = '📋 一覧表示に戻す';
  } else {
    mat.classList.add('hidden');
    main.classList.remove('hidden');
    document.getElementById('evalMatrixBtn').textContent = '📋 マトリクス表示';
  }
}

function renderEvalMatrix() {
  const subj = (document.getElementById('evalListSubject') || {}).value || (state.subjects[0] && state.subjects[0].id) || '';
  const table = document.getElementById('evalMatrixTable');
  if (!table || !subj) { table.innerHTML = '<tr><td>教科を選んでください</td></tr>'; return; }
  const subject = state.subjects.find(s => s.id === subj);
  const units = state.units.filter(u => u.subject === subj && !u.archived).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  // header rows
  let header1 = '<tr><th rowspan="2">出席</th><th rowspan="2">児童名</th>';
  units.forEach(u => {
    header1 += `<th colspan="3" style="background:#fff8e0;border-left:2px solid #999;">${u.name}</th>`;
  });
  header1 += '</tr>';
  let header2 = '<tr>';
  units.forEach(() => {
    header2 += '<th style="background:#eef;border-left:2px solid #999;">知</th><th style="background:#efe;">思</th><th style="background:#fed;">態</th>';
  });
  header2 += '</tr>';

  let rows = '';
  state.students.forEach(s => {
    let r = `<tr><td style="text-align:right;">${s.id}</td><td style="white-space:nowrap;">${escapeHtml(s.name)}</td>`;
    units.forEach(u => {
      ['knowledge', 'thinking', 'attitude'].forEach((vp, i) => {
        const ev = findEvaluation(s.id, subj, u.id, vp);
        const border = i === 0 ? 'border-left:2px solid #999;' : '';
        const bg = ev ? 'background:#e8f5e9;font-weight:600;' : 'background:#fff5f5;color:#bbb;';
        r += `<td style="text-align:center;${border}${bg}">${ev ? escapeHtml(ev.grade) : '−'}</td>`;
      });
    });
    r += '</tr>';
    rows += r;
  });
  table.innerHTML = `<thead>${header1}${header2}</thead><tbody>${rows}</tbody>`;
  table.style.borderCollapse = 'collapse';
  table.querySelectorAll('th, td').forEach(c => c.style.border = '1px solid #ddd');
  table.querySelectorAll('th').forEach(c => { c.style.padding = '4px 6px'; c.style.background = c.style.background || '#f0f0f5'; });
  table.querySelectorAll('td').forEach(c => c.style.padding = '4px 6px');
}

function exportEvalCsv() {
  if (!state.evaluations.length) { showToast('評価記録がありません', 'error'); return; }
  const sMap = new Map(state.students.map(s => [s.id, s]));
  const subjMap = new Map(state.subjects.map(s => [s.id, s]));
  const unitMap = new Map(state.units.map(u => [u.id, u]));
  const rows = [['date', 'student_id', 'student_name', 'subject', 'unit', 'viewpoint', 'grade', 'scale']];
  for (const e of state.evaluations) {
    const s = sMap.get(e.studentId);
    const sub = subjMap.get(e.subjectId);
    const u = unitMap.get(e.unitId);
    rows.push([e.date, e.studentId, s ? s.name : '', sub ? sub.label : e.subjectId, u ? u.name : e.unitId, e.viewpoint, e.grade, e.scale]);
  }
  const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `evaluations_${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ========== ABAアセスメントモード ==========

const ABA_BEHAVIORS = [
  { id: 'leave',    label: '離席',    color: '#e74c3c' },
  { id: 'verbal',   label: '暴言',    color: '#c0392b' },
  { id: 'physical', label: '暴力',    color: '#922b21' },
  { id: 'sleep',    label: '寝る',    color: '#7f8c8d' },
  { id: 'reading',  label: '読書',    color: '#16a085' },
  { id: 'refuse',   label: '課題放棄', color: '#d35400' },
  { id: 'shout',    label: '叫ぶ',    color: '#e67e22' },
  { id: 'cry',      label: '泣く',    color: '#9b59b6' },
  { id: 'other',    label: 'その他',  color: '#34495e' }
];

const ABA_SLOT_LABELS = {
  morning: '朝の会前', kaikai: '朝の会', p1: '1限', b1: '1限休', p2: '2限', b2: '2限休',
  p3: '3限', b3: '3限休', p4: '4限', lunch: '給食', lbreak: '昼休み', cleaning: '掃除',
  p5: '5限', b5: '5限休', p6: '6限', hr: '帰りの会', after: '放課後'
};

function initAbaEvents() {
  state.ui.abaDate = state.ui.abaDate || todayISO();

  // 日付ステップ
  const dateInput = document.getElementById('abaDateInput');
  if (dateInput) {
    dateInput.value = state.ui.abaDate;
    dateInput.addEventListener('change', () => {
      state.ui.abaDate = dateInput.value || todayISO();
      updateAbaStatusBar();
      setAbaStep('slot');
    });
  }
  document.querySelectorAll('.aba-date-btn').forEach(b => {
    b.addEventListener('click', () => {
      const offset = parseInt(b.dataset.dateOffset) || 0;
      const d = new Date();
      d.setDate(d.getDate() + offset);
      state.ui.abaDate = d.toISOString().slice(0, 10);
      if (dateInput) dateInput.value = state.ui.abaDate;
      updateAbaStatusBar();
      setAbaStep('slot');
    });
  });

  // 時間帯ステップ - グリッド
  const slotGrid = document.getElementById('abaSlotGrid');
  if (slotGrid) {
    slotGrid.innerHTML = '';
    Object.entries(ABA_SLOT_LABELS).forEach(([id, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aba-slot-btn';
      btn.dataset.slotId = id;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        state.ui.abaSlot = id;
        updateAbaStatusBar();
        setAbaStep('subject');
      });
      slotGrid.appendChild(btn);
    });
  }

  // 教科ステップ - グリッド
  const subjGrid = document.getElementById('abaSubjectGrid');
  if (subjGrid) {
    subjGrid.innerHTML = '';
    state.subjects.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aba-subject-btn';
      btn.dataset.subjectId = s.id;
      btn.style.borderColor = s.color;
      btn.style.color = s.color;
      btn.textContent = s.label;
      btn.addEventListener('click', () => {
        state.ui.abaSubjectId = s.id;
        updateAbaStatusBar();
        setAbaStep('student');
      });
      subjGrid.appendChild(btn);
    });
  }
  document.getElementById('abaSkipSubjectBtn')?.addEventListener('click', () => {
    state.ui.abaSubjectId = '';
    updateAbaStatusBar();
    setAbaStep('student');
  });

  // 児童ステップ - 既存と同じ student-grid
  const stGrid = document.getElementById('abaStudentGrid');
  if (stGrid) {
    stGrid.innerHTML = '';
    state.students.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'student-btn';
      btn.dataset.studentId = s.id;
      btn.title = `${s.kana}${s.note ? ' / ' + s.note : ''} (${s.id})`;
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = s.id;
      btn.appendChild(num);
      btn.appendChild(document.createTextNode(s.name));
      btn.addEventListener('click', () => {
        state.ui.abaTargetId = s.id;
        updateAbaStatusBar();
        setAbaStep('behavior');
      });
      stGrid.appendChild(btn);
    });
  }

  // 行動ステップ
  const behGrid = document.getElementById('abaBehaviorGrid');
  if (behGrid) {
    behGrid.innerHTML = '';
    ABA_BEHAVIORS.forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aba-behavior-btn';
      btn.dataset.behaviorId = b.id;
      btn.style.borderColor = b.color;
      btn.style.color = b.color;
      btn.innerHTML = `${b.label}<small>${b.id}</small>`;
      btn.addEventListener('click', () => {
        if (state.ui.abaBehaviors.has(b.id)) {
          state.ui.abaBehaviors.delete(b.id);
          btn.classList.remove('active');
          btn.style.background = '';
          btn.style.color = b.color;
        } else {
          state.ui.abaBehaviors.add(b.id);
          btn.classList.add('active');
          btn.style.background = b.color;
          btn.style.color = 'white';
        }
        renderAbaOtherInput();
        updateAbaStatusBar();
      });
      behGrid.appendChild(btn);
    });
  }

  // 「その他」記述欄エリア (動的に出現)
  // → renderAbaOtherInput() で挿入

  document.getElementById('abaProceedToInput')?.addEventListener('click', () => {
    if (state.ui.abaBehaviors.size === 0) {
      showToast('行動を1つ以上選択してください', 'error'); return;
    }
    if (state.ui.abaBehaviors.has('other') && !state.ui.abaOtherText.trim()) {
      showToast('「その他」を選んだ場合は内容を記述してください', 'error');
      const oi = document.getElementById('abaOtherText');
      if (oi) oi.focus();
      return;
    }
    setAbaStep('input');
  });

  document.getElementById('abaBackBtn')?.addEventListener('click', () => setAbaStep('behavior'));

  // ステータスバーのアイテムをクリックで該当ステップへ
  document.querySelectorAll('#abaStatusBar .aba-status-item').forEach(it => {
    it.addEventListener('click', () => setAbaStep(it.dataset.step));
  });
  document.getElementById('abaResetBtn')?.addEventListener('click', resetAbaAll);

  // クイック挿入
  document.querySelectorAll('.aba-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.fill);
      if (!target) return;
      target.value = target.value ? (target.value + ' / ' + btn.dataset.text) : btn.dataset.text;
      target.focus();
    });
  });

  document.getElementById('saveAbaBtn').addEventListener('click', saveAbaRecord);

  // 初期表示
  setAbaStep('date');
  updateAbaStatusBar();

  // ABA一覧タブ
  const lstSt = document.getElementById('abaListStudent');
  if (lstSt) {
    state.students.forEach(s => {
      const o = document.createElement('option');
      o.value = String(s.id); o.textContent = `${s.id}. ${s.name}`;
      lstSt.appendChild(o);
    });
    lstSt.addEventListener('change', refreshAbaList);
  }
  const lstSlot = document.getElementById('abaListSlot');
  if (lstSlot) {
    Object.entries(ABA_SLOT_LABELS).forEach(([k, v]) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = v;
      lstSlot.appendChild(o);
    });
    lstSlot.addEventListener('change', refreshAbaList);
  }
  const lstBh = document.getElementById('abaListBehavior');
  if (lstBh) {
    ABA_BEHAVIORS.forEach(b => {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = b.label;
      lstBh.appendChild(o);
    });
    lstBh.addEventListener('change', refreshAbaList);
  }
  const lstP = document.getElementById('abaListPeriod');
  if (lstP) lstP.addEventListener('change', refreshAbaList);
  const expBtn = document.getElementById('exportAbaCsvBtn');
  if (expBtn) expBtn.addEventListener('click', exportAbaCsv);
}

// ステップ式UIの遷移
function setAbaStep(step) {
  state.ui.abaStep = step;
  document.querySelectorAll('.aba-step').forEach(el => {
    el.classList.toggle('hidden', el.dataset.step !== step);
  });
  document.getElementById('abaInputArea').classList.toggle('hidden', step !== 'input');
  // ステータスバーの強調
  document.querySelectorAll('#abaStatusBar .aba-status-item').forEach(el => {
    el.classList.toggle('active', el.dataset.step === step);
  });
  // 行動ステップ表示時に行動グリッドのアクティブ状態を反映
  if (step === 'behavior') {
    document.querySelectorAll('#abaBehaviorGrid .aba-behavior-btn').forEach(btn => {
      const id = btn.dataset.behaviorId;
      const beh = ABA_BEHAVIORS.find(b => b.id === id);
      const active = state.ui.abaBehaviors.has(id);
      btn.classList.toggle('active', active);
      btn.style.background = active && beh ? beh.color : '';
      btn.style.color = active ? 'white' : (beh ? beh.color : '');
    });
    renderAbaOtherInput();
  }
  // 児童ステップ表示時にハイライト
  if (step === 'student') {
    document.querySelectorAll('#abaStudentGrid .student-btn').forEach(btn => {
      btn.classList.toggle('subject', parseInt(btn.dataset.studentId) === state.ui.abaTargetId);
    });
  }
  // 時間帯ステップ表示時にハイライト
  if (step === 'slot') {
    document.querySelectorAll('#abaSlotGrid .aba-slot-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.slotId === state.ui.abaSlot);
    });
  }
  // 教科ステップ
  if (step === 'subject') {
    document.querySelectorAll('#abaSubjectGrid .aba-subject-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.subjectId === state.ui.abaSubjectId);
    });
  }
}

function updateAbaStatusBar() {
  const dEl = document.getElementById('abaStatusDate');
  if (dEl) dEl.textContent = state.ui.abaDate === todayISO() ? '今日' : (state.ui.abaDate || '今日');
  const sEl = document.getElementById('abaStatusSlot');
  if (sEl) sEl.textContent = ABA_SLOT_LABELS[state.ui.abaSlot] || '未選択';
  const subEl = document.getElementById('abaStatusSubject');
  if (subEl) {
    const sub = state.subjects.find(x => x.id === state.ui.abaSubjectId);
    subEl.textContent = sub ? sub.label : '—';
  }
  const stEl = document.getElementById('abaStatusStudent');
  if (stEl) {
    const st = state.students.find(x => x.id === state.ui.abaTargetId);
    stEl.textContent = st ? `${st.id}.${st.name}` : '未選択';
  }
  const bEl = document.getElementById('abaStatusBehavior');
  if (bEl) {
    const labels = [...state.ui.abaBehaviors].map(id => (ABA_BEHAVIORS.find(b => b.id === id) || {}).label || id);
    if (labels.length === 0) bEl.textContent = '未選択';
    else if (state.ui.abaBehaviors.has('other') && state.ui.abaOtherText) {
      bEl.textContent = labels.join('+') + ` (${state.ui.abaOtherText.slice(0, 12)})`;
    } else {
      bEl.textContent = labels.join('+');
    }
  }
}

// 「その他」選択時の記述欄
function renderAbaOtherInput() {
  const grid = document.getElementById('abaBehaviorGrid');
  if (!grid) return;
  let cont = document.getElementById('abaOtherWrap');
  if (state.ui.abaBehaviors.has('other')) {
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'abaOtherWrap';
      cont.style.marginTop = '8px';
      cont.innerHTML = `<label style="font-size:12px; font-weight:600; color:#555;">「その他」の内容を記述:
        <input type="text" id="abaOtherText" placeholder="例: 物投げ・自傷など" maxlength="100"
               style="width:100%; padding:6px 8px; font-size:13px; border:2px solid #34495e; border-radius:4px; margin-top:3px;">
      </label>`;
      grid.parentNode.insertBefore(cont, grid.nextSibling);
      const oi = cont.querySelector('#abaOtherText');
      oi.value = state.ui.abaOtherText || '';
      oi.addEventListener('input', () => {
        state.ui.abaOtherText = oi.value;
        updateAbaStatusBar();
      });
      oi.focus();
    }
  } else {
    if (cont) cont.remove();
    state.ui.abaOtherText = '';
  }
}

function resetAbaAll() {
  state.ui.abaSlot = '';
  state.ui.abaSubjectId = '';
  state.ui.abaTargetId = null;
  state.ui.abaBehaviors = new Set();
  state.ui.abaOtherText = '';
  document.querySelectorAll('#abaBehaviorGrid .aba-behavior-btn').forEach(b => {
    b.classList.remove('active');
    b.style.background = '';
    const beh = ABA_BEHAVIORS.find(x => x.id === b.dataset.behaviorId);
    if (beh) b.style.color = beh.color;
  });
  ['abaAntecedent','abaConsequence','abaResponse'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  renderAbaOtherInput();
  updateAbaStatusBar();
  setAbaStep('date');
}

function saveAbaRecord() {
  if (!state.ui.abaTargetId || state.ui.abaBehaviors.size === 0 || !state.ui.abaSlot) {
    showToast('時間帯・児童・行動を選択してください', 'error'); return;
  }
  if (state.ui.abaBehaviors.has('other') && !state.ui.abaOtherText.trim()) {
    showToast('「その他」の内容を記述してください', 'error'); return;
  }
  const ant = document.getElementById('abaAntecedent').value || '';
  const cons = document.getElementById('abaConsequence').value || '';
  const resp = document.getElementById('abaResponse').value || '';
  // 「その他」の内容を behaviors の付帯情報として保存
  let antWithOther = ant;
  if (state.ui.abaBehaviors.has('other') && state.ui.abaOtherText) {
    antWithOther = `[その他: ${state.ui.abaOtherText}]` + (ant ? ' / ' + ant : '');
  }
  const rec = normalizeAba({
    studentId: state.ui.abaTargetId,
    date: state.ui.abaDate || todayISO(),
    slot: state.ui.abaSlot,
    subject: state.ui.abaSubjectId || '',
    behaviors: [...state.ui.abaBehaviors],
    antecedent: antWithOther,
    consequence: cons,
    response: resp
  });
  if (!rec) { showToast('保存に失敗', 'error'); return; }
  state.abaRecords.push(rec);
  saveState();
  if (typeof pushAbaToGas === 'function') pushAbaToGas(rec, 'add').catch(() => {});
  const s = state.students.find(x => x.id === rec.studentId);
  showToast(`${s ? s.name : ''} のABA記録を保存`);
  // 行動・テキストはクリア。日付/時間帯/教科/児童は維持で連続記録
  state.ui.abaBehaviors = new Set();
  state.ui.abaOtherText = '';
  document.querySelectorAll('.aba-behavior-btn').forEach(b => {
    b.classList.remove('active');
    const beh = ABA_BEHAVIORS.find(x => x.id === b.dataset.behaviorId);
    b.style.background = '';
    if (beh) b.style.color = beh.color;
  });
  ['abaAntecedent','abaConsequence','abaResponse'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  renderAbaOtherInput();
  updateAbaStatusBar();
  setAbaStep('behavior'); // 同じ児童で次の行動を記録できるように
  if (state.ui.currentTab === 'aba-list') refreshAbaList();
}

function refreshAbaSidePanel() {
  // V2: 記録画面からは削除。ABA一覧タブで参照。互換のため空関数として残す
}

function refreshAbaList() {
  const period = (document.getElementById('abaListPeriod') || {}).value || 'week';
  const sid = (document.getElementById('abaListStudent') || {}).value;
  const slot = (document.getElementById('abaListSlot') || {}).value;
  const beh = (document.getElementById('abaListBehavior') || {}).value;

  const today = todayISO();
  const todayMs = new Date(today + 'T00:00:00').getTime();
  const filtered = state.abaRecords.filter(r => {
    if (period === 'today' && r.date !== today) return false;
    if (period === 'week') {
      const rMs = new Date(r.date + 'T00:00:00').getTime();
      if ((todayMs - rMs) > 6 * 86400000 || (todayMs - rMs) < 0) return false;
    }
    if (period === 'month') {
      const rMs = new Date(r.date + 'T00:00:00').getTime();
      if ((todayMs - rMs) > 30 * 86400000 || (todayMs - rMs) < 0) return false;
    }
    if (sid && r.studentId !== parseInt(sid)) return false;
    if (slot && r.slot !== slot) return false;
    if (beh && !(r.behaviors || []).includes(beh)) return false;
    return true;
  }).sort((a,b) => (b.timestamp||'').localeCompare(a.timestamp||''));

  const info = document.getElementById('abaListInfo');
  if (info) info.textContent = `${filtered.length}件`;

  // サマリ: 行動別件数 + 児童別件数 + 時間帯別件数
  const behCount = {}, stCount = {}, slotCount = {};
  filtered.forEach(r => {
    r.behaviors.forEach(b => behCount[b] = (behCount[b]||0)+1);
    stCount[r.studentId] = (stCount[r.studentId]||0)+1;
    if (r.slot) slotCount[r.slot] = (slotCount[r.slot]||0)+1;
  });
  const sMap = new Map(state.students.map(s => [s.id, s]));
  const summary = document.getElementById('abaSummary');
  if (summary) {
    const behLines = Object.entries(behCount).sort((a,b) => b[1]-a[1]).map(([k,v]) =>
      `<li><b>${(ABA_BEHAVIORS.find(x => x.id === k) || {}).label || k}</b> ${v}件</li>`).join('');
    const stLines = Object.entries(stCount).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k,v]) => {
      const s = sMap.get(parseInt(k)); return `<li>${s ? s.name : k}: ${v}件</li>`;
    }).join('');
    const slotLines = Object.entries(slotCount).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k,v]) =>
      `<li>${ABA_SLOT_LABELS[k] || k}: ${v}件</li>`).join('');
    summary.innerHTML = `
      <h3>サマリ (${filtered.length}件)</h3>
      <div style="display:flex; gap:18px; flex-wrap:wrap;">
        <div><b>行動別:</b><ul class="praise-rank-list">${behLines || '<li class="muted">なし</li>'}</ul></div>
        <div><b>児童別 TOP5:</b><ul class="praise-rank-list">${stLines || '<li class="muted">なし</li>'}</ul></div>
        <div><b>時間帯 TOP5:</b><ul class="praise-rank-list">${slotLines || '<li class="muted">なし</li>'}</ul></div>
      </div>`;
  }

  const ul = document.getElementById('abaList');
  if (!ul) return;
  if (!filtered.length) {
    ul.innerHTML = '<li class="empty">該当するABA記録はありません</li>'; return;
  }
  ul.innerHTML = filtered.slice(0, 300).map(r => {
    const s = sMap.get(r.studentId);
    const time = r.timestamp ? new Date(r.timestamp).toLocaleString('ja-JP', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : r.date;
    const labels = r.behaviors.map(id => `<span class="eval-grade-inline grade-C">${(ABA_BEHAVIORS.find(b => b.id === id) || {}).label || id}</span>`).join(' ');
    const subj = (state.subjects.find(x => x.id === r.subject) || {}).label || '';
    return `<li data-id="${r.id}">
      <div class="praise-meta">
        <div>${time}</div>
        <div class="praise-name">${s ? s.id+'. '+s.name : '?'}</div>
        <div class="muted small">${ABA_SLOT_LABELS[r.slot] || ''}${subj ? ' / ' + subj : ''}</div>
      </div>
      <div class="praise-content">
        ${labels}
        ${r.antecedent ? `<div><b>A:</b> ${escapeHtml(r.antecedent)}</div>` : ''}
        ${r.consequence ? `<div><b>C:</b> ${escapeHtml(r.consequence)}</div>` : ''}
        ${r.response ? `<div><b>対応:</b> ${escapeHtml(r.response)}</div>` : ''}
      </div>
      <div class="praise-actions">
        <button class="ghost danger" data-action="delete-aba" data-id="${r.id}">削除</button>
      </div>
    </li>`;
  }).join('');
  ul.querySelectorAll('button[data-action="delete-aba"]').forEach(btn => {
    btn.addEventListener('click', () => deleteAbaRecord(btn.dataset.id));
  });
}

function deleteAbaRecord(id) {
  if (!confirm('このABA記録を削除しますか？')) return;
  const idx = state.abaRecords.findIndex(r => r.id === id);
  if (idx < 0) return;
  state.abaRecords.splice(idx, 1);
  saveState();
  if (typeof pushAbaToGas === 'function') pushAbaToGas({ id }, 'delete').catch(() => {});
  refreshAbaList();
  refreshAbaSidePanel();
  showToast('削除しました');
}

function exportAbaCsv() {
  if (!state.abaRecords.length) { showToast('ABA記録がありません', 'error'); return; }
  const sMap = new Map(state.students.map(s => [s.id, s]));
  const rows = [['date','time','student_id','student_name','slot','subject','behaviors','antecedent','consequence','response']];
  for (const r of state.abaRecords) {
    const s = sMap.get(r.studentId);
    const time = r.timestamp ? new Date(r.timestamp).toLocaleTimeString('ja-JP') : '';
    const beh = (r.behaviors || []).map(id => (ABA_BEHAVIORS.find(b => b.id === id) || {}).label || id).join('+');
    const subj = (state.subjects.find(x => x.id === r.subject) || {}).label || '';
    rows.push([r.date, time, r.studentId, s ? s.name : '', ABA_SLOT_LABELS[r.slot] || r.slot, subj, beh,
      (r.antecedent||'').replace(/[\r\n]+/g,' '),
      (r.consequence||'').replace(/[\r\n]+/g,' '),
      (r.response||'').replace(/[\r\n]+/g,' ')]);
  }
  const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `aba_${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ========== 席替えスナップショット ==========

function initSeatingSnapshotEvents() {
  const btn = document.createElement('button');
  btn.id = 'saveSeatingSnapshotBtn';
  btn.className = 'primary';
  btn.style.marginLeft = '8px';
  btn.textContent = '💾 この座席を履歴保存';
  btn.title = '現在の班分けを履歴に保存。後で集計や交友分析に活用';
  btn.addEventListener('click', saveSeatingSnapshot);
  // generateSeatingBtn の隣に挿入
  const gen = document.getElementById('generateSeatingBtn');
  if (gen && gen.parentNode) gen.parentNode.insertBefore(btn, gen.nextSibling);
}

function getCurrentSeatingGroups() {
  // generateSeating の HTML から復元: .seating-group div の中の .member span(s.id)
  const groups = [];
  document.querySelectorAll('#seatingResult .seating-group').forEach(g => {
    const ids = [...g.querySelectorAll('.member .muted')].map(el => parseInt(el.textContent)).filter(Number.isFinite);
    if (ids.length) groups.push(ids);
  });
  return groups;
}

function saveSeatingSnapshot() {
  const groups = getCurrentSeatingGroups();
  if (!groups.length) { showToast('まず「班案を生成」を実行してください', 'error'); return; }
  const label = prompt('この座席に名前を付けてください（例: 5月席替え）', `${todayISO()} 席替え`);
  if (!label) return;
  const snap = {
    id: 'seat-' + Date.now(),
    date: todayISO(),
    label,
    groups
  };
  state.seatingSnapshots.push(snap);
  saveState();
  showToast(`座席「${label}」を保存しました（履歴 ${state.seatingSnapshots.length}件）`);
}

// 同班経験ペアスコア: {pairKey: count}
function computeCoGroupCounts() {
  const counts = {};
  for (const snap of state.seatingSnapshots || []) {
    for (const g of snap.groups || []) {
      for (let i = 0; i < g.length; i++) {
        for (let j = i+1; j < g.length; j++) {
          const a = g[i], b = g[j];
          const k = `${Math.min(a,b)}-${Math.max(a,b)}`;
          counts[k] = (counts[k] || 0) + 1;
        }
      }
    }
  }
  return counts;
}

function getCoGroupCount(a, b) {
  const counts = computeCoGroupCounts();
  return counts[`${Math.min(a,b)}-${Math.max(a,b)}`] || 0;
}

function refreshAll() {
  refreshSidePanel();
  refreshAfterSelectionChange();
  if (state.ui.recordMode === 'praise') {
    refreshPraiseGridState();
    refreshPraiseSidePanel();
  } else if (state.ui.recordMode === 'evaluation') {
    refreshEvalUI();
  } else if (state.ui.recordMode === 'aba') {
    refreshAbaSidePanel();
  }
  if (state.ui.currentTab === 'summary') refreshSummary();
  else if (state.ui.currentTab === 'compare') refreshCompare();
  else if (state.ui.currentTab === 'socio') refreshSocio();
  else if (state.ui.currentTab === 'history') refreshHistory();
  else if (state.ui.currentTab === 'settings') refreshSettings();
  else if (state.ui.currentTab === 'praise-list') refreshPraiseList();
}

// ========== Keyboard Shortcuts ==========
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    // 入力フィールドではキーボード操作を無視
    const tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // モーダル開いてる間はEscのみ受け付ける
    const modal = document.getElementById('helpModal');
    if (modal && !modal.classList.contains('hidden')) {
      if (e.key === 'Escape') { modal.classList.add('hidden'); e.preventDefault(); }
      return;
    }
    // Shift+? でヘルプ
    if (e.key === '?' && e.shiftKey) {
      e.preventDefault();
      modal.classList.remove('hidden');
      return;
    }
    // 記録タブ以外はEnterだけ無効化（誤操作防止）
    if (state.ui.currentTab !== 'record') {
      if (e.key === 'Escape') { /* タブ切替時のみ */ }
      return;
    }

    // Ctrl+Z / Cmd+Z = 取消
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undoLastRecord();
      return;
    }
    // Enter = 保存
    if (e.key === 'Enter') {
      const saveBtn = document.getElementById('saveBtn');
      if (!saveBtn.disabled) { e.preventDefault(); saveRecord(); }
      return;
    }
    // Esc = クリア
    if (e.key === 'Escape') {
      e.preventDefault();
      clearSelection();
      state.ui.numBuf = '';
      clearTimeout(state.ui.numTimer);
      return;
    }
    // A/T/O = 特殊状態 (主役選択中のみ)
    if (state.ui.subjectId !== null && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const map = { 'a': 'alone', 'A': 'alone', 't': 'with_teacher', 'T': 'with_teacher', 'o': 'other_class', 'O': 'other_class' };
      if (map[e.key]) {
        e.preventDefault();
        const sp = map[e.key];
        if (state.ui.specialState === sp) state.ui.specialState = null;
        else { state.ui.specialState = sp; state.ui.selectedMembers = []; }
        refreshSpecialButtons();
        refreshAfterSelectionChange();
        return;
      }
    }
    // F1〜F8 = シーン切替
    if (/^F[1-8]$/.test(e.key)) {
      const idx = parseInt(e.key.slice(1)) - 1;
      const sc = state.scenes[idx];
      if (sc) {
        e.preventDefault();
        state.ui.currentScene = sc.id;
        renderSceneButtons();
        saveState();
        showToast(`シーン: ${getSceneLabel(sc.id)}`, 'success');
      }
      return;
    }
    // Tab = モード切替
    if (e.key === 'Tab' && !e.ctrlKey) {
      e.preventDefault();
      state.ui.currentMode = state.ui.currentMode === 'simple' ? 'activity' : 'simple';
      document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === state.ui.currentMode);
      });
      refreshActivityVisibility();
      refreshSaveButton();
      saveState();
      showToast(`モード: ${state.ui.currentMode === 'simple' ? 'シンプル' : '相手×活動'}`, 'success');
      return;
    }
    // 数字 = 児童選択 (1〜2 は2桁待ち、3〜9は即確定 or 2桁目で確定)
    if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      handleNumKey(e.key);
      return;
    }
  });
}

function handleNumKey(d) {
  state.ui.numBuf += d;
  clearTimeout(state.ui.numTimer);
  const n = parseInt(state.ui.numBuf);
  // 1桁目が3〜9なら即確定 (10〜は2桁必要)
  if (state.ui.numBuf.length === 1) {
    if (n >= 3 && n <= 9) {
      state.ui.numBuf = '';
      onStudentClick(n);
    } else {
      // 0,1,2 → 350ms待つ
      const buffered = state.ui.numBuf;
      state.ui.numTimer = setTimeout(() => {
        const id = parseInt(buffered);
        state.ui.numBuf = '';
        if (id >= 1 && id <= 28) onStudentClick(id);
      }, 350);
    }
  } else if (state.ui.numBuf.length === 2) {
    state.ui.numBuf = '';
    if (n >= 1 && n <= 28) onStudentClick(n);
  }
}

// ========== Help & Onboarding Modal ==========
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
  // オンボーディング
  const onb = document.getElementById('onboardingModal');
  document.getElementById('closeOnboardingBtn')?.addEventListener('click', () => {
    onb.classList.add('hidden');
    localStorage.setItem('interactionApp_onboarded', '1');
  });
  // 編集モーダル
  document.getElementById('cancelEditBtn')?.addEventListener('click', closeEditModal);
  document.getElementById('saveEditBtn')?.addEventListener('click', saveEditModal);
  document.getElementById('editModal')?.addEventListener('click', e => {
    if (e.target.id === 'editModal') closeEditModal();
  });
}

// ========== Multi-step Undo / Edit ==========
const undoStack = [];   // {type:'add'|'delete'|'edit', rec, oldRec?}
const redoStack = [];
const UNDO_LIMIT = 20;

function pushUndo(action) {
  undoStack.push(action);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function undoAction() {
  if (undoStack.length === 0) {
    showToast('取り消す操作がありません', 'error');
    return;
  }
  const a = undoStack.pop();
  redoStack.push(a);
  if (a.type === 'add') {
    state.records = state.records.filter(r => r.id !== a.rec.id);
    showToast(`↶ 追加を取消: ${getStudentName(a.rec.subject)}`);
  } else if (a.type === 'delete') {
    state.records.push(a.rec);
    showToast(`↶ 削除を取消: ${getStudentName(a.rec.subject)}`);
  } else if (a.type === 'edit') {
    const i = state.records.findIndex(r => r.id === a.newRec.id);
    if (i >= 0) state.records[i] = a.oldRec;
    showToast(`↶ 編集を取消: ${getStudentName(a.oldRec.subject)}`);
  } else if (a.type === 'bulk') {
    for (const rec of a.recs) {
      state.records = state.records.filter(r => r.id !== rec.id);
    }
    showToast(`↶ 一括追加を取消: ${a.recs.length}件`);
  }
  saveState();
  refreshAll();
  updateHealthBadge();
}

function redoAction() {
  if (redoStack.length === 0) {
    showToast('やり直す操作がありません', 'error');
    return;
  }
  const a = redoStack.pop();
  undoStack.push(a);
  if (a.type === 'add') state.records.push(a.rec);
  else if (a.type === 'delete') state.records = state.records.filter(r => r.id !== a.rec.id);
  else if (a.type === 'edit') {
    const i = state.records.findIndex(r => r.id === a.oldRec.id);
    if (i >= 0) state.records[i] = a.newRec;
  } else if (a.type === 'bulk') state.records.push(...a.recs);
  saveState();
  refreshAll();
  updateHealthBadge();
  showToast('↷ やり直し');
}

let editingRecordId = null;
function openEditModal(recId) {
  const rec = state.records.find(r => r.id === recId);
  if (!rec) return;
  editingRecordId = recId;
  const body = document.getElementById('editModalBody');
  body.innerHTML = '';
  // 日時 (読み取り専用)
  const meta = document.createElement('div');
  meta.className = 'muted small';
  meta.textContent = `${formatDateTime(rec.timestamp)} / ${getSceneLabel(rec.scene)}`;
  body.appendChild(meta);
  // 主役選択
  const subjLbl = document.createElement('label');
  subjLbl.textContent = '主役: ';
  const subjSel = document.createElement('select');
  subjSel.id = 'editSubject';
  for (const s of state.students) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.id}. ${s.name}`;
    if (s.id === rec.subject) opt.selected = true;
    subjSel.appendChild(opt);
  }
  subjLbl.appendChild(subjSel);
  body.appendChild(subjLbl);
  body.appendChild(document.createElement('br'));
  // メンバー選択 (チェックボックス)
  const memLbl = document.createElement('div');
  memLbl.style.marginTop = '8px';
  memLbl.innerHTML = '<b>一緒にいた子:</b>';
  body.appendChild(memLbl);
  const memWrap = document.createElement('div');
  memWrap.id = 'editMembers';
  memWrap.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:6px;font-size:13px;';
  for (const s of state.students) {
    const lab = document.createElement('label');
    lab.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = s.id;
    cb.checked = rec.members.includes(s.id);
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(s.name));
    memWrap.appendChild(lab);
  }
  body.appendChild(memWrap);
  // 活動
  if (rec.mode === 'activity') {
    const actLbl = document.createElement('label');
    actLbl.style.marginTop = '8px';
    actLbl.style.display = 'block';
    actLbl.innerHTML = '<b>活動:</b> ';
    const actSel = document.createElement('select');
    actSel.id = 'editActivity';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '(なし)';
    actSel.appendChild(optNone);
    for (const a of state.activities) {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      if (a === rec.activity) opt.selected = true;
      actSel.appendChild(opt);
    }
    actLbl.appendChild(actSel);
    body.appendChild(actLbl);
  }
  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
  editingRecordId = null;
  document.getElementById('editModal').classList.add('hidden');
}

function saveEditModal() {
  if (!editingRecordId) return;
  const i = state.records.findIndex(r => r.id === editingRecordId);
  if (i < 0) return;
  const oldRec = { ...state.records[i] };
  const newSubject = parseInt(document.getElementById('editSubject').value);
  const memCBs = document.querySelectorAll('#editMembers input[type=checkbox]:checked');
  const newMembers = [...memCBs].map(cb => parseInt(cb.value)).filter(m => m !== newSubject);
  const newRec = {
    ...oldRec,
    subject: newSubject,
    members: newMembers,
    activity: document.getElementById('editActivity')?.value || oldRec.activity,
    edited_at: new Date().toISOString()
  };
  state.records[i] = newRec;
  pushUndo({ type: 'edit', oldRec, newRec });
  saveState();
  closeEditModal();
  refreshAll();
  showToast(`✓ 編集しました: ${getStudentName(newRec.subject)}`);
}

// ========== Centrality / Cluster ==========
function computeCentrality(records) {
  const degree = {}, totalCount = {}, given = {}, received = {};
  for (const s of state.students) {
    degree[s.id] = new Set();
    totalCount[s.id] = 0;
    given[s.id] = 0;
    received[s.id] = 0;
  }
  for (const r of records) {
    if (r.special) continue;
    for (const m of r.members) {
      degree[r.subject].add(m);
      degree[m].add(r.subject);
      totalCount[r.subject]++;
      totalCount[m]++;
      given[r.subject]++;
      received[m]++;
    }
  }
  return state.students.map(s => ({
    student: s,
    degree: degree[s.id].size,
    totalCount: totalCount[s.id],
    given: given[s.id],
    received: received[s.id],
    asymmetry: given[s.id] - received[s.id]
  }));
}

function detectClusters(pairs, threshold) {
  const parent = {};
  state.students.forEach(s => parent[s.id] = s.id);
  const find = id => parent[id] === id ? id : (parent[id] = find(parent[id]));
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (const [key, count] of Object.entries(pairs)) {
    if (count < threshold) continue;
    const [a, b] = key.split('-').map(Number);
    union(a, b);
  }
  const groups = {};
  for (const s of state.students) {
    const root = find(s.id);
    (groups[root] = groups[root] || []).push(s);
  }
  return Object.values(groups).filter(g => g.length >= 2).sort((a, b) => b.length - a.length);
}

function computePairs(records) {
  const pairs = {};
  for (const r of records) {
    if (r.special) continue;
    const ids = [r.subject, ...r.members];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = Math.min(ids[i], ids[j]);
        const b = Math.max(ids[i], ids[j]);
        const key = `${a}-${b}`;
        pairs[key] = (pairs[key] || 0) + 1;
      }
    }
  }
  return pairs;
}

function initCentralityFilters() {
  ['centralityCategory', 'centralityPeriod'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', refreshCentrality);
  });
}

function refreshCentrality() {
  const category = document.getElementById('centralityCategory').value;
  const period = document.getElementById('centralityPeriod').value;
  const recs = filterRecords({ category, period });
  document.getElementById('centralityInfo').textContent = `対象記録: ${recs.length}件`;

  const data = computeCentrality(recs);
  // 孤立順 TOP 5
  const isolated = [...data].sort((a, b) => a.degree - b.degree || a.totalCount - b.totalCount).slice(0, 5);
  renderCentralityTable('centralityIsolatedTable', isolated, 'degree');
  // ハブ順 TOP 5
  const hub = [...data].sort((a, b) => b.degree - a.degree || b.totalCount - a.totalCount).slice(0, 5);
  renderCentralityTable('centralityHubTable', hub, 'degree');
  // 非対称性 (絶対値の大きい順 TOP 5)
  const asym = [...data].filter(d => d.totalCount >= 3).sort((a, b) => Math.abs(b.asymmetry) - Math.abs(a.asymmetry)).slice(0, 5);
  renderCentralityTable('centralityAsymmetryTable', asym, 'asymmetry');
  // クラスタ
  const pairs = computePairs(recs);
  const clusters = detectClusters(pairs, 3);
  const clCont = document.getElementById('centralityClusters');
  if (clusters.length === 0) {
    clCont.innerHTML = '<div class="muted">共起≥3のクラスタはまだありません</div>';
  } else {
    clCont.innerHTML = clusters.map((g, i) =>
      `<div style="margin-bottom:6px;"><b>グループ${i+1} (${g.length}人):</b> ${g.map(s => escapeHtml(s.name)).join('・')}</div>`
    ).join('');
  }
}

function renderCentralityTable(tableId, rows, focusKey) {
  const t = document.getElementById(tableId);
  if (!t) return;
  let html = '<thead><tr><th>児童</th><th>degree</th><th>total</th><th>選/被</th><th>asym</th></tr></thead><tbody>';
  for (const d of rows) {
    const cls = d.student.highlight ? 'highlight-row' : '';
    const asymStr = d.asymmetry === 0 ? '0' : (d.asymmetry > 0 ? `+${d.asymmetry}` : String(d.asymmetry));
    html += `<tr class="${cls}">
      <td><b>${escapeHtml(d.student.name)}</b></td>
      <td>${d.degree}</td>
      <td>${d.totalCount}</td>
      <td>${d.given}/${d.received}</td>
      <td>${asymStr}</td>
    </tr>`;
  }
  html += '</tbody>';
  t.innerHTML = html;
}

// ========== Timeline ==========
function initTimelineFilters() {
  ['timelineGranularity', 'timelineCategory'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', refreshTimeline);
  });
  // 変化TOP用フィルタ
  ['changePreset', 'changeCategory', 'changeLimit',
   'periodAStart', 'periodAEnd', 'periodBStart', 'periodBEnd'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', refreshChangeRanking);
  });
  document.getElementById('changePreset')?.addEventListener('change', () => {
    const v = document.getElementById('changePreset').value;
    document.getElementById('changeCustomFields').classList.toggle('hidden', v !== 'custom');
  });
}

function getPresetPeriods(preset) {
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const sub = (d, n) => { const x = new Date(d); x.setDate(x.getDate() - n); return x; };
  if (preset === 'week') {
    return {
      a: { start: fmt(sub(t0, 13)), end: fmt(sub(t0, 7)),  label: '先週(7-13日前)' },
      b: { start: fmt(sub(t0, 6)),  end: fmt(t0),           label: '今週(直近7日)' }
    };
  }
  if (preset === '2week') {
    return {
      a: { start: fmt(sub(t0, 27)), end: fmt(sub(t0, 14)), label: '前2週(15-28日前)' },
      b: { start: fmt(sub(t0, 13)), end: fmt(t0),           label: '直近2週' }
    };
  }
  if (preset === 'month') {
    const ty = today.getFullYear(), tm = today.getMonth();
    const aStart = new Date(ty, tm - 1, 1);
    const aEnd = new Date(ty, tm, 0);
    const bStart = new Date(ty, tm, 1);
    return {
      a: { start: fmt(aStart), end: fmt(aEnd), label: `先月(${tm}月)` },
      b: { start: fmt(bStart), end: fmt(t0),    label: `今月(${tm+1}月)` }
    };
  }
  if (preset === '30days') {
    return {
      a: { start: fmt(sub(t0, 59)), end: fmt(sub(t0, 30)), label: '前30日(31-60日前)' },
      b: { start: fmt(sub(t0, 29)), end: fmt(t0),           label: '直近30日' }
    };
  }
  // custom
  const aS = document.getElementById('periodAStart').value;
  const aE = document.getElementById('periodAEnd').value;
  const bS = document.getElementById('periodBStart').value;
  const bE = document.getElementById('periodBEnd').value;
  return {
    a: { start: aS, end: aE, label: `A: ${aS}〜${aE}` },
    b: { start: bS, end: bE, label: `B: ${bS}〜${bE}` }
  };
}

function recordsInRange(start, end, category) {
  if (!start || !end) return [];
  let recs = state.records.filter(r => r.date >= start && r.date <= end);
  if (category) recs = recs.filter(r => r.category === category);
  return recs;
}

function refreshChangeRanking() {
  const preset = document.getElementById('changePreset').value;
  const category = document.getElementById('changeCategory').value;
  const limit = parseInt(document.getElementById('changeLimit').value) || 10;
  const { a, b } = getPresetPeriods(preset);
  if (!a.start || !b.start) {
    document.getElementById('changeRanking').innerHTML = '<div class="change-empty">期間を入力してください</div>';
    return;
  }
  const recsA = recordsInRange(a.start, a.end, category);
  const recsB = recordsInRange(b.start, b.end, category);
  document.getElementById('changeInfo').textContent =
    `${a.label} (${recsA.length}件) / ${b.label} (${recsB.length}件)`;

  // 児童ごとの変化度を計算
  const data = state.students.map(s => {
    const pA = computePartnerCounts(s.id, recsA);
    const pB = computePartnerCounts(s.id, recsB);
    const setA = new Set(Object.keys(pA).map(Number));
    const setB = new Set(Object.keys(pB).map(Number));
    const onlyA = [...setA].filter(x => !setB.has(x));
    const onlyB = [...setB].filter(x => !setA.has(x));
    const common = [...setA].filter(x => setB.has(x));
    const unionN = setA.size + setB.size - common.length;
    const jaccard = unionN > 0 ? common.length / unionN : (setA.size === 0 && setB.size === 0 ? null : 0);
    // 変化度 = 1 - jaccard (両方ゼロは null)
    const change = jaccard === null ? null : 1 - jaccard;
    const totalA = Object.values(pA).reduce((x,y)=>x+y, 0);
    const totalB = Object.values(pB).reduce((x,y)=>x+y, 0);
    return { student: s, change, jaccard, onlyA, onlyB, common, totalA, totalB, pA, pB };
  });
  // 両方記録ありの子だけ + 変化度高い順
  const ranked = data.filter(d => d.change !== null && (d.totalA + d.totalB) >= 2)
                     .sort((a,b) => b.change - a.change)
                     .slice(0, limit);

  const cont = document.getElementById('changeRanking');
  if (ranked.length === 0) {
    cont.innerHTML = '<div class="change-empty">比較対象の児童がいません。両期間に記録があるか確認してください。</div>';
    return;
  }

  const fmtNamesByFreq = (ids, partners, max=4, cls) => {
    if (ids.length === 0) return '<span class="muted">—</span>';
    const sorted = ids.slice().sort((x,y) => (partners[y]||0) - (partners[x]||0));
    const html = sorted.slice(0, max).map(id =>
      `<span class="${cls}">${escapeHtml(getStudentName(id))}(${partners[id]||0})</span>`
    ).join(' ');
    return html + (sorted.length > max ? ` <span class="muted">他${sorted.length-max}名</span>` : '');
  };

  let html = '';
  ranked.forEach((d, i) => {
    const cls = d.student.highlight ? 'highlight-row' : '';
    const changePct = Math.round(d.change * 100);
    html += `
      <div class="change-row ${cls}">
        <div class="rank">${i+1}</div>
        <div>
          <div class="name">${escapeHtml(d.student.name)}</div>
          <div class="muted small">A:${d.totalA} / B:${d.totalB}</div>
        </div>
        <div>
          <div><span class="change-bar"><span class="change-fill" style="width:${changePct}%"></span></span></div>
          <div class="muted small">変化度 ${changePct}%</div>
        </div>
        <dl class="changes">
          <dt>失った</dt><dd>${fmtNamesByFreq(d.onlyA, d.pA, 5, 'lost-name')}</dd>
          <dt>新しい</dt><dd>${fmtNamesByFreq(d.onlyB, d.pB, 5, 'new-name')}</dd>
          <dt>変わらず</dt><dd>${fmtNamesByFreq(d.common, d.pB, 5, 'same-name')}</dd>
        </dl>
      </div>
    `;
  });
  cont.innerHTML = html;
}

function periodKey(date, granularity) {
  if (granularity === 'week') {
    const d = new Date(date);
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
  }
  return date.slice(0, 7); // YYYY-MM
}

function refreshTimeline() {
  const granularity = document.getElementById('timelineGranularity').value;
  const category = document.getElementById('timelineCategory').value;
  const recs = filterRecords({ category });
  document.getElementById('timelineInfo').textContent = `対象記録: ${recs.length}件`;

  const grouped = {};
  for (const r of recs) {
    const k = periodKey(r.date, granularity);
    grouped[k] = grouped[k] || [];
    grouped[k].push(r);
  }
  const sortedKeys = Object.keys(grouped).sort();

  // SVGバーチャート
  const svg = document.getElementById('timelineChart');
  if (!svg) return;
  const w = svg.clientWidth || 800;
  const h = 200;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = '';
  if (sortedKeys.length === 0) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', w/2); text.setAttribute('y', h/2);
    text.setAttribute('text-anchor', 'middle');
    text.textContent = '記録がありません';
    svg.appendChild(text);
  } else {
    const max = Math.max(...sortedKeys.map(k => grouped[k].length));
    const barW = Math.max(20, (w - 40) / sortedKeys.length - 4);
    sortedKeys.forEach((k, i) => {
      const cnt = grouped[k].length;
      const bh = (cnt / max) * (h - 50);
      const x = 20 + i * (barW + 4);
      const y = h - 30 - bh;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', barW); rect.setAttribute('height', bh);
      rect.setAttribute('fill', '#4a90e2');
      svg.appendChild(rect);
      const cntT = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      cntT.setAttribute('x', x + barW/2); cntT.setAttribute('y', y - 4);
      cntT.setAttribute('text-anchor', 'middle');
      cntT.setAttribute('font-size', '11');
      cntT.textContent = cnt;
      svg.appendChild(cntT);
      const lblT = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lblT.setAttribute('x', x + barW/2); lblT.setAttribute('y', h - 10);
      lblT.setAttribute('text-anchor', 'middle');
      lblT.setAttribute('font-size', '10');
      lblT.setAttribute('fill', '#666');
      lblT.textContent = k.slice(-7);
      svg.appendChild(lblT);
    });
  }

  // 直近2期間の差分
  const diffCont = document.getElementById('timelineDiff');
  if (sortedKeys.length < 2) {
    diffCont.innerHTML = '<div class="muted">2期間以上のデータが必要です</div>';
  } else {
    const prev = sortedKeys[sortedKeys.length - 2];
    const curr = sortedKeys[sortedKeys.length - 1];
    const prevPairs = computePairs(grouped[prev]);
    const currPairs = computePairs(grouped[curr]);
    const allKeys = new Set([...Object.keys(prevPairs), ...Object.keys(currPairs)]);
    const newRel = [], lostRel = [], strongerRel = [];
    for (const k of allKeys) {
      const p = prevPairs[k] || 0, c = currPairs[k] || 0;
      if (p === 0 && c >= 1) newRel.push({ key: k, count: c });
      else if (c === 0 && p >= 1) lostRel.push({ key: k, count: p });
      else if (c > p) strongerRel.push({ key: k, before: p, after: c });
    }
    const fmtPair = k => k.split('-').map(id => getStudentName(parseInt(id))).join('-');
    let html = `<div class="muted small">${prev} → ${curr}</div>`;
    html += `<div style="margin-top:6px;"><b>新しく結ばれた関係 (${newRel.length}):</b> ${newRel.slice(0, 8).map(r => fmtPair(r.key)).join(', ') || 'なし'}</div>`;
    html += `<div><b>強くなった関係 (${strongerRel.length}):</b> ${strongerRel.slice(0, 5).map(r => `${fmtPair(r.key)}(${r.before}→${r.after})`).join(', ') || 'なし'}</div>`;
    html += `<div><b>失われた関係 (${lostRel.length}):</b> ${lostRel.slice(0, 8).map(r => fmtPair(r.key)).join(', ') || 'なし'}</div>`;
    diffCont.innerHTML = html;
  }
}

// ========== Archive ==========
function archiveCurrentYear() {
  if (state.records.length === 0) {
    showToast('アーカイブする記録がありません', 'error');
    return;
  }
  const year = window.APP_DATA.year || new Date().getFullYear();
  const cls = (window.APP_DATA.class || 'unknown').replace(/[^\w一-龯ぁ-ゖァ-ヺ]/g, '_');
  const key = `interactionApp_archive_${year}_${cls}`;
  if (localStorage.getItem(key) && !confirm(`既に ${year}年${cls} のアーカイブが存在します。上書きしますか？`)) return;
  const data = {
    archived_at: new Date().toISOString(),
    class: window.APP_DATA.class,
    year,
    students: state.students,
    records: state.records,
    settings: state.settings
  };
  try {
    localStorage.setItem(key, JSON.stringify(data));
    // 自動でJSONダウンロードも
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `archive-${year}-${cls}-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ ${year}年${cls} のデータをアーカイブ + ダウンロード`);
    listArchives();
  } catch (e) {
    showToast('アーカイブ失敗: ' + e.message, 'error');
  }
}

function listArchives() {
  const cont = document.getElementById('archivesList');
  if (!cont) return;
  const archives = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('interactionApp_archive_')) {
      try {
        const d = JSON.parse(localStorage.getItem(k));
        archives.push({ key: k, label: `${d.year}年 ${d.class}`, count: d.records?.length || 0, date: d.archived_at });
      } catch (_) {}
    }
  }
  if (archives.length === 0) {
    cont.textContent = 'アーカイブはまだありません';
  } else {
    cont.innerHTML = archives.map(a =>
      `<div>📦 ${escapeHtml(a.label)} (${a.count}件 / ${(a.date || '').slice(0,10)})
      <button class="ghost" data-key="${escapeHtml(a.key)}" style="font-size:11px;padding:2px 6px;margin-left:4px;">削除</button></div>`
    ).join('');
    cont.querySelectorAll('button[data-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm(`このアーカイブを削除しますか？\n${btn.dataset.key}`)) return;
        localStorage.removeItem(btn.dataset.key);
        listArchives();
        showToast('アーカイブを削除しました');
      });
    });
  }
}

// ========== AI副担任向けエクスポート ==========
function exportForAIFukutannin() {
  const byStudent = {};
  for (const s of state.students) {
    byStudent[s.id] = {
      name: s.name,
      kana: s.kana,
      highlight: !!s.highlight,
      watch: !!s.watch,
      note: s.note || null,
      // 関係性集約
      partners: {},        // {partnerId: {name, count, scenes:{}}}
      special_counts: { alone: 0, with_teacher: 0, other_class: 0 },
      total_observations: 0,
      first_observed: null,
      last_observed: null,
      activities: {},      // {act: count}
      degree: 0,
      total_count: 0,
      asymmetry: 0
    };
  }
  for (const r of state.records) {
    const subj = byStudent[r.subject];
    if (!subj) continue;
    subj.total_observations++;
    if (!subj.first_observed || r.timestamp < subj.first_observed) subj.first_observed = r.timestamp;
    if (!subj.last_observed || r.timestamp > subj.last_observed) subj.last_observed = r.timestamp;
    if (r.special) {
      subj.special_counts[r.special]++;
      continue;
    }
    if (r.activity) subj.activities[r.activity] = (subj.activities[r.activity] || 0) + 1;
    // partners (双方向)
    for (const m of r.members) {
      const partner = byStudent[m];
      if (!partner) continue;
      // subject側に partner を追加
      if (!subj.partners[m]) subj.partners[m] = { name: partner.name, count: 0, scenes: {} };
      subj.partners[m].count++;
      subj.partners[m].scenes[r.scene] = (subj.partners[m].scenes[r.scene] || 0) + 1;
      // partner側にも subject を追加 (双方向反映)
      if (!partner.partners[r.subject]) partner.partners[r.subject] = { name: subj.name, count: 0, scenes: {} };
      partner.partners[r.subject].count++;
      partner.partners[r.subject].scenes[r.scene] = (partner.partners[r.subject].scenes[r.scene] || 0) + 1;
    }
  }
  // 中心性指標を追加
  const cent = computeCentrality(state.records);
  for (const c of cent) {
    if (byStudent[c.student.id]) {
      byStudent[c.student.id].degree = c.degree;
      byStudent[c.student.id].total_count = c.totalCount;
      byStudent[c.student.id].asymmetry = c.asymmetry;
    }
  }
  // クラスタ
  const pairs = computePairs(state.records);
  const clusters = detectClusters(pairs, 3).map(g => g.map(s => ({ id: s.id, name: s.name })));

  const out = {
    type: 'interaction_export',
    version: 1,
    exported_at: new Date().toISOString(),
    class: window.APP_DATA.class,
    school: window.APP_DATA.school,
    year: window.APP_DATA.year,
    record_count: state.records.length,
    by_student: byStudent,
    clusters,
    note: 'このファイルは ai_fukutannin.py の student-cards-enriched.json に統合できる形式です'
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `interaction-enriched-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`✓ AI副担任向けJSONを出力 (${Object.keys(byStudent).length}児童 / ${clusters.length}クラスタ)`);
}

// ========== refreshAll拡張 ==========
const _origRefreshAll = refreshAll;
refreshAll = function() {
  _origRefreshAll();
  if (state.ui.currentTab === 'centrality') refreshCentrality();
  else if (state.ui.currentTab === 'timeline') refreshTimeline();
};

const _origSwitchTab = switchTab;
switchTab = function(name) {
  _origSwitchTab(name);
  if (name === 'centrality') refreshCentrality();
  else if (name === 'timeline') { refreshTimeline(); refreshChangeRanking(); }
};

// saveRecord/deleteSelectedRecords の Undo 連携
const _origSaveRecord = saveRecord;
saveRecord = function() {
  const before = state.records.length;
  _origSaveRecord();
  if (state.records.length > before) {
    pushUndo({ type: 'add', rec: state.records[state.records.length - 1] });
  }
};

const _origDeleteSelected = deleteSelectedRecords;
deleteSelectedRecords = function() {
  const ids = Array.from(state.ui.selectedHistoryIds);
  const recs = state.records.filter(r => ids.includes(r.id));
  _origDeleteSelected();
  if (recs.length > 0) pushUndo({ type: 'bulk', recs });
};

// undoLastRecord は新しいUndoStackと統合
const _origUndoLastRecord = undoLastRecord;
undoLastRecord = function() {
  if (undoStack.length > 0) undoAction();
  else _origUndoLastRecord();
};

// キーボードに Ctrl+Y / Ctrl+Shift+Z = Redo を追加
const _origInitKeyboard = initKeyboardShortcuts;
initKeyboardShortcuts = function() {
  _origInitKeyboard();
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redoAction();
    }
  });
};

// 履歴行をクリックで編集モーダル
const _origRefreshHistory = refreshHistory;
refreshHistory = function() {
  _origRefreshHistory();
  // 各行に編集ボタンを追加
  document.querySelectorAll('#historyTable tbody tr').forEach(tr => {
    const cb = tr.querySelector('.hist-check');
    if (!cb) return;
    const recId = cb.dataset.id;
    tr.style.cursor = 'pointer';
    tr.addEventListener('dblclick', e => {
      if (e.target.tagName === 'INPUT') return;
      openEditModal(recId);
    });
    tr.title = '行をダブルクリックで編集';
  });
};

// ========== 児童個別ダッシュボード ==========
function openStudentDashboard(id) {
  const s = getStudent(id);
  if (!s) return;
  const partners = computePartnerCounts(id, state.records);
  const sortedPartners = Object.entries(partners).sort((a,b)=>b[1]-a[1]).slice(0, 10);
  const specials = computeSpecialCounts(id, state.records);
  const cent = computeCentrality(state.records).find(c => c.student.id === id) || {};

  // シーン別関わり
  const sceneBreakdown = {};
  for (const r of state.records) {
    if (r.subject !== id && !r.members.includes(id)) continue;
    sceneBreakdown[r.scene] = (sceneBreakdown[r.scene] || 0) + 1;
  }

  // 時系列: 週ごとの観察回数
  const weekly = {};
  for (const r of state.records) {
    if (r.subject !== id && !r.members.includes(id)) continue;
    const k = periodKey(r.date, 'week');
    weekly[k] = (weekly[k] || 0) + 1;
  }
  const weekKeys = Object.keys(weekly).sort();

  // 関連メモ
  const notes = state.records.filter(r =>
    (r.subject === id || r.members.includes(id)) && r.note
  ).slice(-15).reverse();

  const totalObs = (cent.totalCount || 0) + specials.alone + specials.with_teacher + specials.other_class;
  const isolationRate = totalObs > 0 ? Math.round(specials.alone / totalObs * 100) : 0;

  const body = document.getElementById('dashboardBody');
  body.innerHTML = `
    <div class="dashboard-header">
      <h2>${escapeHtml(s.name)}</h2>
      <span class="muted">${escapeHtml(s.kana)} (出席番号 ${s.id})</span>
      ${s.highlight ? '<span style="color:#d4a017">●要配慮</span>' : ''}
      ${s.watch ? '<span style="color:#6a3eaa">■観察優先</span>' : ''}
    </div>
    ${s.note ? `<div class="muted small" style="margin-bottom:8px;">📝 ${escapeHtml(s.note)}</div>` : ''}
    <div class="dashboard-grid">
      <div class="card">
        <h3>主な関係指標</h3>
        <div class="dashboard-stat"><span>関わったユニーク相手数 (degree)</span><b>${cent.degree || 0} / 27</b></div>
        <div class="dashboard-stat"><span>関わり総回数 (total)</span><b>${cent.totalCount || 0}</b></div>
        <div class="dashboard-stat"><span>選ぶ - 選ばれる (asymmetry)</span><b>${(cent.asymmetry||0)>=0?'+':''}${cent.asymmetry||0}</b></div>
        <div class="dashboard-stat"><span>一人で / 先生と / 他クラス</span><b>${specials.alone} / ${specials.with_teacher} / ${specials.other_class}</b></div>
        <div class="dashboard-stat"><span>孤立率</span><b style="color:${isolationRate>=30?'#e74c3c':'#666'}">${isolationRate}%</b></div>
      </div>
      <div class="card">
        <h3>主な相手 TOP10</h3>
        ${sortedPartners.length === 0 ? '<div class="muted">記録なし</div>' :
          sortedPartners.map(([pid, cnt]) => {
            const p = getStudent(parseInt(pid));
            const w = sortedPartners[0][1];
            const bw = Math.max(8, Math.round((cnt/w)*100));
            return `<div class="dashboard-stat"><span><span class="bar" style="display:inline-block;height:6px;width:${bw}px;background:var(--primary);margin-right:6px;vertical-align:middle;border-radius:3px;"></span>${escapeHtml(p?.name||'?')}</span><b>${cnt}</b></div>`;
          }).join('')}
      </div>
      <div class="card">
        <h3>シーン別の関わり</h3>
        ${Object.entries(sceneBreakdown).sort((a,b)=>b[1]-a[1]).map(([sc, cnt]) =>
          `<div class="dashboard-stat"><span>${escapeHtml(getSceneLabel(sc))}</span><b>${cnt}回</b></div>`
        ).join('') || '<div class="muted">記録なし</div>'}
      </div>
      <div class="card">
        <h3>週別の観察回数</h3>
        <svg class="dashboard-mini-svg" viewBox="0 0 400 150" id="dashWeeklySvg"></svg>
      </div>
    </div>
    ${notes.length > 0 ? `
      <div class="card" style="margin-top:8px;">
        <h3>関連する観察メモ (最新${notes.length}件)</h3>
        <div style="max-height:180px;overflow-y:auto;font-size:12px;">
          ${notes.map(n => `<div style="padding:4px 0;border-bottom:1px solid #eef;">
            <span class="muted">${escapeHtml(formatDateTime(n.timestamp))} (${escapeHtml(getSceneLabel(n.scene))})</span><br>${escapeHtml(n.note)}
          </div>`).join('')}
        </div>
      </div>
    ` : ''}
  `;

  // 週別グラフ描画
  const svg = document.getElementById('dashWeeklySvg');
  if (svg && weekKeys.length > 0) {
    const max = Math.max(...weekKeys.map(k => weekly[k]));
    const barW = Math.max(8, Math.min(40, 360 / weekKeys.length - 4));
    weekKeys.forEach((k, i) => {
      const v = weekly[k];
      const bh = (v / max) * 110;
      const x = 20 + i * (barW + 4);
      const y = 130 - bh;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', barW); rect.setAttribute('height', bh);
      rect.setAttribute('fill', '#4a90e2');
      svg.appendChild(rect);
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', x + barW/2); txt.setAttribute('y', y - 2);
      txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', '9');
      txt.textContent = v;
      svg.appendChild(txt);
      if (i % Math.ceil(weekKeys.length/8) === 0) {
        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', x + barW/2); lbl.setAttribute('y', 145);
        lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('font-size', '8');
        lbl.setAttribute('fill', '#666');
        lbl.textContent = k.slice(-3);
        svg.appendChild(lbl);
      }
    });
  }
  document.getElementById('dashboardModal').classList.remove('hidden');
}

function closeDashboard() {
  document.getElementById('dashboardModal').classList.add('hidden');
}

// ========== Heatmap タブ (観察密度 + ペアタイムライン) ==========
function initHeatmapTab() {
  // 児童プルダウン
  ['pairA', 'pairB'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';
    for (const s of state.students) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    }
  });
  document.getElementById('heatmapView')?.addEventListener('change', refreshHeatmap);
  document.getElementById('pairA')?.addEventListener('change', refreshHeatmap);
  document.getElementById('pairB')?.addEventListener('change', refreshHeatmap);
}

function refreshHeatmap() {
  const view = document.getElementById('heatmapView').value;
  document.querySelectorAll('.pair-only').forEach(e => e.classList.toggle('hidden', view !== 'pair'));
  if (view === 'density') {
    drawDensityHeatmap();
  } else {
    drawPairTimeline();
  }
}

function drawDensityHeatmap() {
  document.getElementById('heatmapTitle').textContent = '観察密度ヒートマップ (日別記録数)';
  const body = document.getElementById('heatmapBody');
  // 過去365日のカレンダー風 (GitHub contributions風)
  const now = new Date();
  const start = new Date(now); start.setDate(now.getDate() - 364);
  const dailyCounts = {};
  for (const r of state.records) {
    dailyCounts[r.date] = (dailyCounts[r.date] || 0) + 1;
  }
  const max = Math.max(1, ...Object.values(dailyCounts));
  const cells = [];
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    const cnt = dailyCounts[ds] || 0;
    let lvl = 0;
    if (cnt > 0) lvl = Math.min(4, Math.ceil(cnt / max * 4));
    cells.push({ ds, cnt, lvl, dow: d.getDay() });
  }
  // 53週 × 7曜日のグリッド
  const html = `
    <div style="display:flex;align-items:flex-start;gap:8px;">
      <div style="display:flex;flex-direction:column;gap:2px;font-size:10px;color:#999;padding-top:2px;">
        ${['日','月','火','水','木','金','土'].map(d => `<div style="height:14px;line-height:14px;">${d}</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-rows:repeat(7,14px);grid-auto-flow:column;gap:2px;">
        ${cells.map(c => `<div class="hm-cell ${c.lvl>0?'l'+c.lvl:''}" title="${c.ds}: ${c.cnt}件" style="grid-row:${c.dow+1};"></div>`).join('')}
      </div>
    </div>
    <div class="hm-legend">少 <div class="hm-cell"></div><div class="hm-cell l1"></div><div class="hm-cell l2"></div><div class="hm-cell l3"></div><div class="hm-cell l4"></div> 多 (1日あたり最大${max}件)</div>
    <div class="muted small" style="margin-top:8px;">合計 ${state.records.length}件 / 直近365日 / 観察した日数: ${Object.keys(dailyCounts).length}日</div>
  `;
  body.innerHTML = html;
  document.getElementById('heatmapInfo').textContent = `${state.records.length}件 / 観察日数 ${Object.keys(dailyCounts).length}`;
}

function drawPairTimeline() {
  const a = parseInt(document.getElementById('pairA').value);
  const b = parseInt(document.getElementById('pairB').value);
  if (!a || !b || a === b) {
    document.getElementById('heatmapBody').innerHTML = '<div class="muted">児童AとBに別の人を選んでください</div>';
    return;
  }
  document.getElementById('heatmapTitle').textContent = `ペアタイムライン: ${getStudentName(a)} ⇔ ${getStudentName(b)}`;
  // 月別共起数
  const monthly = {};
  for (const r of state.records) {
    if (r.special) continue;
    const ids = [r.subject, ...r.members];
    if (ids.includes(a) && ids.includes(b)) {
      const mk = r.date.slice(0, 7);
      monthly[mk] = (monthly[mk] || 0) + 1;
    }
  }
  const keys = Object.keys(monthly).sort();
  const total = Object.values(monthly).reduce((s,v)=>s+v, 0);
  const events = state.events.slice().sort((x,y) => x.date.localeCompare(y.date));

  let chartHtml = '';
  if (keys.length === 0) {
    chartHtml = '<div class="muted">このペアの記録はまだありません</div>';
  } else {
    const max = Math.max(...Object.values(monthly));
    const w = 800, h = 200;
    chartHtml = `<svg width="100%" viewBox="0 0 ${w} ${h}" style="background:#fafbfc;border-radius:8px;">`;
    // ベースライン
    chartHtml += `<line x1="40" y1="${h-30}" x2="${w-20}" y2="${h-30}" stroke="#ccc"/>`;
    const xStep = (w - 60) / Math.max(1, keys.length - 1);
    let pathD = '';
    keys.forEach((k, i) => {
      const x = 40 + i * xStep;
      const y = (h - 30) - (monthly[k] / max) * (h - 60);
      pathD += (i === 0 ? 'M' : 'L') + `${x},${y}`;
      // 点
      chartHtml += `<circle cx="${x}" cy="${y}" r="4" fill="#4a90e2"><title>${k}: ${monthly[k]}回</title></circle>`;
      chartHtml += `<text x="${x}" y="${y-8}" text-anchor="middle" font-size="10">${monthly[k]}</text>`;
      chartHtml += `<text x="${x}" y="${h-12}" text-anchor="middle" font-size="9" fill="#666">${k.slice(-2)}月</text>`;
    });
    chartHtml += `<path d="${pathD}" stroke="#4a90e2" stroke-width="2" fill="none"/>`;
    // イベント注釈の縦線
    for (const ev of events) {
      const evMk = ev.date.slice(0, 7);
      const idx = keys.indexOf(evMk);
      if (idx < 0) continue;
      const x = 40 + idx * xStep;
      chartHtml += `<line x1="${x}" y1="20" x2="${x}" y2="${h-30}" stroke="#ff8a3d" stroke-dasharray="3,3"/>`;
      chartHtml += `<text x="${x}" y="14" text-anchor="middle" font-size="9" fill="#ff8a3d">${escapeHtml(ev.label)}</text>`;
    }
    chartHtml += '</svg>';
  }
  document.getElementById('heatmapBody').innerHTML = `
    <div class="muted" style="margin-bottom:6px;">合計 ${total}回</div>
    ${chartHtml}
  `;
  document.getElementById('heatmapInfo').textContent = `合計 ${total}回 / 月別`;
}

// ========== 席替え提案 ==========
function initSeating() {
  document.getElementById('generateSeatingBtn')?.addEventListener('click', generateSeating);
}

function generateSeating() {
  const groupCount = parseInt(document.getElementById('seatingGroupCount').value) || 7;
  const perGroup = parseInt(document.getElementById('seatingPerGroup').value) || 4;
  const policy = document.getElementById('seatingPolicy').value;
  const pairs = computePairs(state.records);

  // 各児童ペアの「親密度スコア」
  function pairScore(a, b) {
    const k = `${Math.min(a,b)}-${Math.max(a,b)}`;
    return pairs[k] || 0;
  }

  // 警告ペア (要配慮児童同士・トラブル相手・要観察ペア)
  const watchPairs = new Set();
  // 既知トラブル: 長田優真(5) - 山崎玲央(26) のような配慮ペア
  // メモにあるパターンから推定: highlight同士や、watchPairs を検出
  const highlightIds = state.students.filter(s => s.highlight).map(s => s.id);
  for (let i = 0; i < highlightIds.length; i++) {
    for (let j = i+1; j < highlightIds.length; j++) {
      const a = highlightIds[i], b = highlightIds[j];
      // 共起回数が極端に多い (頻繁にトラブル)
      if (pairScore(a, b) >= 5) {
        watchPairs.add(`${Math.min(a,b)}-${Math.max(a,b)}`);
      }
    }
  }

  // 班分けアルゴリズム: 貪欲法
  const studentIds = state.students.map(s => s.id);
  const groups = Array.from({length: groupCount}, () => []);
  const assigned = new Set();

  // policy=diverse: 普段関わりが少ないペアを同じ班に → 各班でスコア合計を最小化
  // policy=similar: 関わる子で固める → スコア合計を最大化
  // policy=mixed: highlightの子は別班に分散、それ以外はバランス

  // まず要配慮児童を別班に分散
  const highlights = studentIds.filter(id => getStudent(id)?.highlight);
  const others = studentIds.filter(id => !getStudent(id)?.highlight);
  // shuffle
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i+1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  shuffle(highlights);
  shuffle(others);
  highlights.forEach((id, i) => {
    if (groups[i % groupCount].length < perGroup) {
      groups[i % groupCount].push(id);
      assigned.add(id);
    }
  });

  // 残りを貪欲法で配置
  const remaining = others.filter(id => !assigned.has(id));
  for (const id of remaining) {
    // 各班に入れた場合のスコアを計算
    let bestG = 0, bestScore = policy === 'similar' ? -Infinity : Infinity;
    for (let g = 0; g < groupCount; g++) {
      if (groups[g].length >= perGroup) continue;
      let score = 0;
      for (const m of groups[g]) score += pairScore(id, m);
      if (policy === 'similar' ? score > bestScore : score < bestScore) {
        bestScore = score;
        bestG = g;
      }
    }
    groups[bestG].push(id);
    assigned.add(id);
  }
  // 余った子は空きのある班へ
  for (const id of studentIds) {
    if (!assigned.has(id)) {
      for (let g = 0; g < groupCount; g++) {
        if (groups[g].length < perGroup) { groups[g].push(id); assigned.add(id); break; }
      }
    }
  }

  // 描画
  let html = '<div class="seating-result">';
  let warnings = [];
  groups.forEach((g, i) => {
    let groupHtml = `<div class="seating-group"><h4>班 ${i+1} (${g.length}人)</h4>`;
    let groupWarning = [];
    for (const id of g) {
      const s = getStudent(id);
      const cls = s?.highlight ? 'highlight' : '';
      groupHtml += `<div class="member ${cls}"><span>${escapeHtml(s?.name || '')}</span><span class="muted">${id}</span></div>`;
    }
    // 班内の警告ペア
    for (let x = 0; x < g.length; x++) {
      for (let y = x+1; y < g.length; y++) {
        const k = `${Math.min(g[x],g[y])}-${Math.max(g[x],g[y])}`;
        if (watchPairs.has(k)) {
          groupWarning.push(`${getStudentName(g[x])} × ${getStudentName(g[y])}`);
        }
      }
    }
    if (groupWarning.length > 0) {
      groupHtml += `<div class="warning">⚠ ${groupWarning.join(', ')}</div>`;
      warnings.push(`班${i+1}: ${groupWarning.join(', ')}`);
    }
    groupHtml += '</div>';
    html += groupHtml;
  });
  html += '</div>';
  document.getElementById('seatingResult').innerHTML = html;

  const notes = [];
  if (warnings.length > 0) notes.push(`<b>⚠ 警告:</b> ${warnings.length}班に要配慮児童同士のペアあり`);
  notes.push(`<b>方針:</b> ${policy === 'diverse' ? '普段関わらない子と組むよう配置' : policy === 'similar' ? '仲の良い子で固めて配置' : 'バランス重視'}`);
  notes.push(`<b>要配慮児童:</b> ${highlights.length}名を ${Math.min(highlights.length, groupCount)}班に分散`);
  notes.push(`<b>注意:</b> 自動生成は参考案です。性別バランス・座席視野・人間関係の機微は教師判断で調整してください`);
  document.getElementById('seatingNotes').innerHTML = notes.map(n => `<div style="margin:4px 0;">${n}</div>`).join('');
}

// ========== 危険信号アラート (起動時バナー強化) ==========
const _origShowStartupBanners = showStartupBanners;
showStartupBanners = function() {
  _origShowStartupBanners();
  // 既存バナーに追加: 危険信号
  const dangerSignals = detectDangerSignals();
  if (dangerSignals.length === 0) return;
  let cont = document.getElementById('startupBanners');
  if (!cont) return;
  for (const sig of dangerSignals) {
    const div = document.createElement('div');
    div.className = `banner ${sig.level}`;
    div.textContent = sig.text;
    const x = document.createElement('button');
    x.className = 'banner-close';
    x.textContent = '×';
    x.addEventListener('click', () => div.remove());
    div.appendChild(x);
    cont.appendChild(div);
  }
};

function detectDangerSignals() {
  const signals = [];
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86400000;
  const fourteenDaysAgo = now - 14 * 86400000;

  // 1. alone急増: 過去7日のalone回数 > その前7日の3倍
  const recentAlone = {};
  const prevAlone = {};
  for (const r of state.records) {
    if (!r.special || r.special !== 'alone') continue;
    const t = new Date(r.timestamp).getTime();
    if (t >= sevenDaysAgo) recentAlone[r.subject] = (recentAlone[r.subject] || 0) + 1;
    else if (t >= fourteenDaysAgo) prevAlone[r.subject] = (prevAlone[r.subject] || 0) + 1;
  }
  for (const sid of Object.keys(recentAlone)) {
    const recent = recentAlone[sid];
    const prev = prevAlone[sid] || 0;
    if (recent >= 3 && recent > prev * 2) {
      signals.push({
        level: 'danger',
        text: `🚨 ${getStudentName(parseInt(sid))} のalone急増 (今週${recent}回 / 先週${prev}回)。介入検討。`
      });
    }
  }

  // 2. 要配慮ペア3日連続検出
  const pairsByDay = {};
  for (const r of state.records) {
    if (r.special) continue;
    const t = new Date(r.timestamp).getTime();
    if (t < sevenDaysAgo) continue;
    const ids = [r.subject, ...r.members];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i+1; j < ids.length; j++) {
        const a = Math.min(ids[i], ids[j]);
        const b = Math.max(ids[i], ids[j]);
        const k = `${a}-${b}`;
        pairsByDay[k] = pairsByDay[k] || new Set();
        pairsByDay[k].add(r.date);
      }
    }
  }
  for (const [k, days] of Object.entries(pairsByDay)) {
    if (days.size < 3) continue;
    const [a, b] = k.split('-').map(Number);
    const sa = getStudent(a), sb = getStudent(b);
    if (sa?.highlight && sb?.highlight) {
      signals.push({
        level: 'warn',
        text: `⚠ 要配慮ペア "${sa.name} × ${sb.name}" が${days.size}日連続で同席。観察強化を。`
      });
    }
  }

  return signals.slice(0, 5); // 最大5件
}

// ========== 男女別・班別集計 ==========
function refreshGenderGroupStats() {
  const cont = document.getElementById('genderGroupStats');
  if (!cont) return;
  const total = state.records.length;
  if (total === 0 || Object.keys(state.attributes).length === 0) {
    cont.classList.add('hidden');
    return;
  }
  cont.classList.remove('hidden');

  // 男女別
  const genderCount = { M: 0, F: 0, '?': 0 };
  const genderObs = { M: 0, F: 0, '?': 0 };
  for (const s of state.students) {
    const g = state.attributes[s.id]?.gender || '?';
    genderCount[g] = (genderCount[g] || 0) + 1;
  }
  for (const r of state.records) {
    const ids = [r.subject, ...r.members];
    for (const id of ids) {
      const g = state.attributes[id]?.gender || '?';
      genderObs[g] = (genderObs[g] || 0) + 1;
    }
  }
  // 男女混合ペア率
  let mixedPairs = 0, samePairs = 0;
  for (const r of state.records) {
    if (r.special) continue;
    const ids = [r.subject, ...r.members];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i+1; j < ids.length; j++) {
        const ga = state.attributes[ids[i]]?.gender;
        const gb = state.attributes[ids[j]]?.gender;
        if (!ga || !gb || ga === '?' || gb === '?') continue;
        if (ga === gb) samePairs++;
        else mixedPairs++;
      }
    }
  }
  const totalPairs = mixedPairs + samePairs;
  const mixedRate = totalPairs > 0 ? Math.round(mixedPairs / totalPairs * 100) : 0;

  cont.innerHTML = `<div class="stat-row">
    <span class="stat-item">👦 男子 ${genderCount.M||0}名 / 観察${genderObs.M||0}回</span>
    <span class="stat-item">👧 女子 ${genderCount.F||0}名 / 観察${genderObs.F||0}回</span>
    ${genderCount['?'] > 0 ? `<span class="stat-item">❔ 未設定${genderCount['?']}名</span>` : ''}
    <span class="stat-item" style="background:#e8f4fc;">男女混合ペア率: <b>${mixedRate}%</b> (${mixedPairs}/${totalPairs})</span>
  </div>`;
}

// 集計タブの refreshSummary を拡張
const _origRefreshSummary = refreshSummary;
refreshSummary = function() {
  _origRefreshSummary();
  refreshGenderGroupStats();
};

// ========== 28枚一括PDF ==========
function printIndividualReports() {
  // 28児童それぞれ1ページの印刷専用ビューを生成
  const w = window.open('', '_blank');
  if (!w) { showToast('ポップアップがブロックされました', 'error'); return; }
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>5年4組 個別レポート</title><style>
    body { font-family: "Yu Gothic UI", "Meiryo", sans-serif; padding: 20px; }
    .page { page-break-after: always; padding: 30px; min-height: 90vh; }
    h1 { border-bottom: 2px solid #4a90e2; padding-bottom: 6px; color: #2f6db5; }
    h2 { color: #2f6db5; font-size: 14px; margin-top: 16px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
    .stat { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #eee; font-size: 13px; }
    .partner { padding: 3px 0; font-size: 13px; }
    .note { padding: 4px 8px; background: #f9fafc; border-left: 3px solid #4a90e2; margin: 4px 0; font-size: 12px; }
    .meta { color: #666; font-size: 12px; }
    @media print { .page { padding: 20px; } }
  </style></head><body>`;

  for (const s of state.students) {
    const partners = computePartnerCounts(s.id, state.records);
    const sorted = Object.entries(partners).sort((a,b)=>b[1]-a[1]).slice(0, 8);
    const specials = computeSpecialCounts(s.id, state.records);
    const cent = computeCentrality(state.records).find(c => c.student.id === s.id) || {};
    const totalObs = (cent.totalCount||0) + specials.alone + specials.with_teacher + specials.other_class;
    const isolationRate = totalObs > 0 ? Math.round(specials.alone/totalObs*100) : 0;
    const notes = state.records.filter(r => (r.subject === s.id || r.members.includes(s.id)) && r.note).slice(-5).reverse();

    html += `<div class="page">
      <h1>${escapeHtml(s.name)} <span class="meta">(${escapeHtml(s.kana)} / ${s.id}番)</span></h1>
      ${s.note ? `<div class="meta">📝 ${escapeHtml(s.note)}</div>` : ''}
      <h2>関係指標</h2>
      <div class="stat"><span>関わったユニーク相手数</span><b>${cent.degree||0} / 27</b></div>
      <div class="stat"><span>関わり総回数</span><b>${cent.totalCount||0}</b></div>
      <div class="stat"><span>非対称性 (選ぶ-選ばれる)</span><b>${(cent.asymmetry||0)>=0?'+':''}${cent.asymmetry||0}</b></div>
      <div class="stat"><span>一人で / 先生と / 他クラス</span><b>${specials.alone} / ${specials.with_teacher} / ${specials.other_class}</b></div>
      <div class="stat"><span>孤立率</span><b>${isolationRate}%</b></div>
      <h2>主な相手 TOP8</h2>
      ${sorted.length === 0 ? '<div class="meta">記録なし</div>' :
        sorted.map(([pid,cnt]) => `<div class="partner">• ${escapeHtml(getStudentName(parseInt(pid)))} — ${cnt}回</div>`).join('')}
      ${notes.length > 0 ? `<h2>観察メモ (最新${notes.length}件)</h2>
        ${notes.map(n => `<div class="note"><b>${escapeHtml(n.date)}</b> (${escapeHtml(getSceneLabel(n.scene))}): ${escapeHtml(n.note)}</div>`).join('')}` : ''}
      <div class="meta" style="margin-top:24px;">出力: ${todayISO()}</div>
    </div>`;
  }
  html += '</body></html>';
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// ========== 属性編集 (設定タブ) ==========
function refreshAttributesEditor() {
  const t = document.getElementById('attrSettings');
  if (!t) return;
  t.innerHTML = '';
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>児童</th><th>性別</th><th>班</th>';
  t.appendChild(headerRow);
  for (const s of state.students) {
    const tr = document.createElement('tr');
    const attr = state.attributes[s.id] || {};
    tr.innerHTML = `<td style="font-size:12px;">${escapeHtml(s.name)}</td>`;
    const gtd = document.createElement('td');
    const gsel = document.createElement('select');
    gsel.style.cssText = 'padding:2px;font-size:12px;';
    [['?','?'],['M','男'],['F','女']].forEach(([v, lbl]) => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = lbl;
      if ((attr.gender || '?') === v) opt.selected = true;
      gsel.appendChild(opt);
    });
    gsel.addEventListener('change', () => {
      state.attributes[s.id] = state.attributes[s.id] || {};
      state.attributes[s.id].gender = gsel.value;
      saveState();
    });
    gtd.appendChild(gsel);
    tr.appendChild(gtd);

    const grtd = document.createElement('td');
    const grinp = document.createElement('input');
    grinp.type = 'number';
    grinp.min = '0'; grinp.max = '14';
    grinp.style.cssText = 'width:50px;padding:2px;';
    grinp.value = attr.group || '';
    grinp.addEventListener('change', () => {
      state.attributes[s.id] = state.attributes[s.id] || {};
      state.attributes[s.id].group = parseInt(grinp.value) || null;
      saveState();
    });
    grtd.appendChild(grinp);
    tr.appendChild(grtd);
    t.appendChild(tr);
  }
}

// ========== イベント注釈 ==========
function refreshEventList() {
  const ul = document.getElementById('eventList');
  if (!ul) return;
  ul.innerHTML = '';
  const sorted = state.events.slice().sort((a,b) => b.date.localeCompare(a.date));
  for (const ev of sorted) {
    const li = document.createElement('li');
    li.style.cssText = 'padding:3px 0;border-bottom:1px solid #eef;';
    li.innerHTML = `<span class="muted">${escapeHtml(ev.date)}</span> ${escapeHtml(ev.label)}`;
    const del = document.createElement('button');
    del.className = 'ghost';
    del.style.cssText = 'font-size:10px;padding:1px 6px;margin-left:6px;';
    del.textContent = '削除';
    del.addEventListener('click', () => {
      state.events = state.events.filter(e => !(e.date === ev.date && e.label === ev.label));
      saveState();
      refreshEventList();
    });
    li.appendChild(del);
    ul.appendChild(li);
  }
}

function addEvent() {
  const d = document.getElementById('eventDate').value;
  const l = document.getElementById('eventLabel').value.trim();
  if (!d || !l) { showToast('日付とラベルを入力してください', 'error'); return; }
  state.events.push({ date: d, label: l });
  saveState();
  document.getElementById('eventLabel').value = '';
  refreshEventList();
  showToast('イベントを追加しました');
}

// ========== 履歴のキーワード検索 ==========
const _origRefreshHistoryKW = refreshHistory;
refreshHistory = function() {
  _origRefreshHistoryKW();
  // キーワード絞り込み
  const kw = document.getElementById('historyKeyword')?.value.trim().toLowerCase();
  if (!kw) return;
  const rows = document.querySelectorAll('#historyTable tbody tr');
  let visible = 0;
  rows.forEach(tr => {
    const text = tr.textContent.toLowerCase();
    const match = text.includes(kw);
    tr.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  document.getElementById('historyInfo').textContent = `${visible}件 (${kw}を含む)`;
};

// ========== 拡張: refreshAll, switchTab, init ==========
const _origRefreshAll2 = refreshAll;
refreshAll = function() {
  _origRefreshAll2();
  if (state.ui.currentTab === 'heatmap') refreshHeatmap();
};

const _origSwitchTab2 = switchTab;
switchTab = function(name) {
  _origSwitchTab2(name);
  if (name === 'heatmap') refreshHeatmap();
  else if (name === 'seating') { /* no auto refresh, click button */ }
};

// init拡張
const _origInit = init;
init = function() {
  _origInit();
  initHeatmapTab();
  initSeating();
  refreshAttributesEditor();
  refreshEventList();
  document.getElementById('addEventBtn')?.addEventListener('click', addEvent);
  document.getElementById('printIndividualBtn')?.addEventListener('click', printIndividualReports);
  document.getElementById('historyKeyword')?.addEventListener('input', () => refreshHistory());
  document.getElementById('closeDashboardBtn')?.addEventListener('click', closeDashboard);
  document.getElementById('dashboardModal')?.addEventListener('click', e => {
    if (e.target.id === 'dashboardModal') closeDashboard();
  });
};

// ========== Boot ==========
document.addEventListener('DOMContentLoaded', init);
