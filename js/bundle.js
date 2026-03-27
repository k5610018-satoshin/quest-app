/**
 * 学びの冒険クエスト - 設定ファイル
 * デプロイ時にGAS URLとクラス情報を更新する
 */
const CONFIG = {
  // GAS WebアプリURL（clasp deploy後に更新）
  gasUrl: 'https://script.google.com/macros/s/AKfycbyOY7WrGPrPCUoVp6DAfaxo36ZKG1mL7vR6KJ4z6PYNiRmp9VNs-gBoDgqfcMy0FPDZBA/exec',

  // クラス設定
  classId: '5年X組',
  className: '5年X組',
  subjects: ['国語','算数','理科','社会','体育','音楽','道徳','総合','図工','家庭科','外国語','学活','行事'],

  // 戸田小学校の時間割（各時間の開始〜終了）
  periodTimes: [
    { period: '1', start: '08:45', end: '09:30' },
    { period: '2', start: '09:40', end: '10:25' },
    { period: '3', start: '10:45', end: '11:30' },
    { period: '4', start: '11:35', end: '12:20' },
    { period: '5', start: '13:50', end: '14:35' },
    { period: '6', start: '14:40', end: '15:25' }
  ],

  // 時間割（1〜6時間目）
  periods: ['1時間目','2時間目','3時間目','4時間目','5時間目','6時間目'],

  // デバッグモード
  debug: false
};
/**
 * 学びの冒険クエスト - GAS API通信レイヤー
 * GAS doPostとのfetch通信を管理
 *
 * GAS CORS制約:
 * - GASはOPTIONSプリフライトに対応していない
 * - "全員がアクセス可能"でデプロイすればリダイレクト経由でJSONを取得可能
 * - fetch()のmode指定に注意（リダイレクト対応が必要）
 */

const API = {
  /**
   * GAS APIにPOSTリクエストを送る
   * @param {string} action - APIアクション名
   * @param {Object} data - リクエストデータ
   * @returns {Promise<Object>} レスポンスJSON
   */
  async post(action, data = {}) {
    const url = CONFIG.gasUrl + '?action=' + encodeURIComponent(action);

    if (CONFIG.debug) {
      console.log('[API]', action, data);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      const result = await response.json();

      if (CONFIG.debug) {
        console.log('[API Response]', action, result);
      }

      return result;
    } catch (error) {
      console.error('[API Error]', action, error);
      return { success: false, error: '通信エラー: ' + error.message };
    }
  },

  // === 児童認識 ===
  async getStudentByToken(token) {
    return this.post('getStudentByToken', { token });
  },

  async getStudentByNumber(studentNumber) {
    return this.post('getStudentByNumber', { studentNumber });
  },

  async getStudentStatus(studentId) {
    return this.post('getStudentStatus', { studentId });
  },

  // === 日記 ===
  async submitDiary(studentId, content) {
    return this.post('submitDiary', { studentId, content });
  },

  async getDiaries(studentId) {
    return this.post('getDiaries', { studentId });
  },

  // === 振り返り ===
  async submitReflection(studentId, subject, period, plan, content) {
    return this.post('submitReflection', { studentId, subject, period, plan, content });
  },

  async getReflections(studentId) {
    return this.post('getReflections', { studentId });
  },

  // === マトリクス ===
  async submitMatrix(studentId, data) {
    return this.post('submitMatrix', { studentId, ...data });
  },

  async submitReflectionWithMatrix(studentId, reflectionData, matrixData) {
    return this.post('submitReflectionWithMatrix', {
      studentId,
      ...reflectionData,
      ...matrixData
    });
  },

  async getMatrixHistory(studentId) {
    return this.post('getMatrixHistory', { studentId });
  },

  // === スキルツリー・コレクション ===
  async getSkillTree(studentId) {
    return this.post('getSkillTree', { studentId });
  },

  async getCollection(studentId) {
    return this.post('getCollection', { studentId });
  },

  // === 週次振り返り ===
  async getWeeklyData(studentId) {
    return this.post('getWeeklyData', { studentId });
  },

  async submitWeeklyReview(studentId, weekStart, weekEnd, content) {
    return this.post('submitWeeklyReview', { studentId, weekStart, weekEnd, content });
  },

  // === 管理 ===
  async getUsers() {
    return this.post('getUsers', {});
  },

  async addComment(targetType, targetId, comment) {
    return this.post('addComment', { targetType, targetId, comment });
  },

  async getUnsubmittedStudents(type) {
    return this.post('getUnsubmittedStudents', { type });
  }
};
/**
 * 学びの冒険クエスト - 7つの型定義・キーワード判定
 */

const TYPES = {
  // 型定義
  definitions: [
    {
      symbol: '＋', name: 'プラス', color: '#22c55e',
      meaning: 'できた・わかった',
      hint: '今日わかったこと、できたこと',
      keywords: ['わかった','できた','理解','上手に','身についた','覚えた','マスター']
    },
    {
      symbol: '−', name: 'マイナス', color: '#ef4444',
      meaning: 'つまずき・課題',
      hint: 'できなかったこと、難しかったこと',
      keywords: ['難しかった','できなかった','失敗','苦手','間違えた','うまくいかない','ミス']
    },
    {
      symbol: '→', name: '次は', color: '#3b82f6',
      meaning: '次への一歩',
      hint: '次の目標、やってみたいこと',
      keywords: ['次は','目標','やってみたい','挑戦','もっと','知りたい','調べたい','頑張']
    },
    {
      symbol: '！', name: '発見', color: '#f59e0b',
      meaning: '気づき・発見',
      hint: '新しく気づいたこと、発見したこと',
      keywords: ['気づいた','発見','変わった','びっくり','初めて','実は','最初は','そうか','なるほど']
    },
    {
      symbol: '？', name: 'ギモン', color: '#8b5cf6',
      meaning: '問い・なぜ',
      hint: '疑問に思ったこと、さらに調べたいこと',
      keywords: ['なぜ','どうして','疑問','不思議','調べたい','知りたい']
    },
    {
      symbol: '⭐', name: '成長', color: '#eab308',
      meaning: '自分の成長',
      hint: '前よりできるようになったこと',
      keywords: ['成長','前より','上手に','できるようになった','伸びた','自信','レベルアップ']
    },
    {
      symbol: '☀️', name: '仲間', color: '#f97316',
      meaning: '仲間・つながり',
      hint: '友達から学んだこと',
      keywords: ['友達','教えてもらった','一緒に','すごい','見習い']
    }
  ],

  /**
   * テキストから型を検出
   * @param {string} text
   * @returns {string[]} 検出された型の記号リスト
   */
  detect(text) {
    const detected = new Set();
    for (const type of this.definitions) {
      // 記号が直接含まれている
      if (text.includes(type.symbol)) {
        detected.add(type.symbol);
        continue;
      }
      // キーワードマッチング
      for (const kw of type.keywords) {
        if (text.includes(kw)) {
          detected.add(type.symbol);
          break;
        }
      }
      // ？記号チェック（全角・半角両方）
      if (type.symbol === '？' && (text.includes('?') || text.includes('？'))) {
        detected.add(type.symbol);
      }
    }
    return [...detected];
  },

  /**
   * 記号から型情報を取得
   */
  getBySymbol(symbol) {
    return this.definitions.find(d => d.symbol === symbol) || null;
  }
};
/**
 * 学びの冒険クエスト - メインアプリケーション
 * SPA画面遷移管理 + ホーム画面
 */

const App = {
  currentStudent: null,
  currentScreen: 'select',
  homeTab: 'main',
  homeDiaries: null,
  homeRefs: null,
  homeMats: null,
  homeRefSubject: null,

  /**
   * アプリ初期化
   * 優先順位: URLの?token= > localStorageのtoken > 出席番号選択（フォールバック）
   */
  async init() {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const savedToken = localStorage.getItem('quest_access_token');

    if (urlToken) {
      await this.loginByToken(urlToken);
    } else if (savedToken) {
      await this.loginByToken(savedToken);
    } else {
      // トークンがない場合は出席番号選択（フォールバック）
      this.showScreen('select');
    }
  },

  /**
   * トークンでログイン（メイン認証方式）
   * ★高速化: localStorageにキャッシュ済みステータスがあれば即座に描画
   *   → バックグラウンドでAPI取得して差分更新
   */
  async loginByToken(token) {
    // キャッシュがあれば即座に描画（体感0ms）
    const cached = localStorage.getItem('quest_student_cache');
    if (cached) {
      try {
        const cachedStudent = JSON.parse(cached);
        this.currentStudent = cachedStudent;
        this.renderHome(cachedStudent);
        this.showScreen('home');
      } catch(e) { /* キャッシュ破損は無視 */ }
    } else {
      this.showLoading('冒険者を確認中...');
    }

    // API取得（キャッシュ表示中でもバックグラウンドで実行）
    const result = await API.getStudentByToken(token);

    if (result.success) {
      this.currentStudent = result.student;
      localStorage.setItem('quest_access_token', token);
      localStorage.setItem('quest_student_cache', JSON.stringify(result.student));
      if (window.location.search.includes('token=')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      // 最新データでホーム再描画（差分が反映される）
      if (this.currentScreen === 'home') {
        this.renderHome(result.student);
      } else {
        this.renderHome(result.student);
        this.showScreen('home');
      }
      this.hideLoading();
    } else {
      this.hideLoading();
      if (!cached) {
        this.showError('トークンが無効です。先生に確認してください。');
        localStorage.removeItem('quest_access_token');
        localStorage.removeItem('quest_student_cache');
        this.showScreen('select');
      }
    }
  },

  /**
   * 出席番号でログイン（フォールバック — トークンがない場合）
   */
  async loginByNumber(num) {
    this.showLoading('冒険者を確認中...');
    const result = await API.getStudentByNumber(num);
    this.hideLoading();

    if (result.success) {
      this.currentStudent = result.student;
      await this.showHome();
    } else {
      this.showError(result.error || 'ログインに失敗しました');
      this.showScreen('select');
    }
  },


  /**
   * ホーム画面を表示（freshがtrueならAPI再取得、falseならキャッシュで即表示）
   */
  async showHome(fresh) {
    if (fresh !== false) {
      this.showLoading('ステータスを読み込み中...');
      const result = await API.getStudentStatus(this.currentStudent.studentId);
      this.hideLoading();

      if (result.success) {
        this.currentStudent = { ...this.currentStudent, ...result.status };
        localStorage.setItem('quest_student_cache', JSON.stringify(this.currentStudent));
        this.renderHome(result.status);
        this.showScreen('home');
      } else {
        this.showError('ステータスの取得に失敗しました');
      }
    } else {
      // キャッシュ済みデータで即座に画面切替（戻るボタン用）
      this.showScreen('home');
    }
  },

  /**
   * ホーム画面レンダリング
   */
  renderHome(status) {
    const el = document.getElementById('screen-home');
    const expPercent = status.nextLevelThreshold
      ? ((status.totalExp - (LEVEL_THRESHOLDS[status.level - 1] || 0)) / (status.nextLevelThreshold - (LEVEL_THRESHOLDS[status.level - 1] || 0)) * 100)
      : 100;

    el.innerHTML = `
      <div class="home-header">
        <div class="player-info">
          <div class="player-name">${this.escapeHtml(status.name)}</div>
          <div class="player-level">Lv.${status.level} 冒険者</div>
        </div>
        <div class="streak-badge" title="連続${status.streakDays}日">
          🔥 ${status.streakDays}日
        </div>
      </div>

      <div class="exp-bar-container">
        <div class="exp-bar-label">
          <span>EXP ${status.totalExp}</span>
          <span>${status.expToNext > 0 ? '次のレベルまで ' + status.expToNext : 'MAX!'}</span>
        </div>
        <div class="exp-bar">
          <div class="exp-bar-fill" style="width: ${Math.min(expPercent, 100)}%"></div>
        </div>
      </div>

      <!-- ホームタブ -->
      <div class="home-tabs">
        <button class="home-tab ${this.homeTab==='main'?'active':''}" onclick="App.switchHomeTab('main')">🏠 ホーム</button>
        <button class="home-tab ${this.homeTab==='diaries'?'active':''}" onclick="App.switchHomeTab('diaries')">📝 日記一覧</button>
        <button class="home-tab ${this.homeTab==='refs'?'active':''}" onclick="App.switchHomeTab('refs')">🔄 振り返り一覧</button>
      </div>

      <div class="home-tab-body" id="home-tab-body"></div>
    `;

    this.renderHomeTab(status);
  },

  switchHomeTab(tab) {
    this.homeTab = tab;
    document.querySelectorAll('.home-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.home-tab[onclick*="'${tab}'"]`)?.classList.add('active');
    this.renderHomeTab(this.currentStudent);
  },

  renderHomeTab(status) {
    const body = document.getElementById('home-tab-body');
    if (!body) return;
    switch (this.homeTab) {
      case 'main': body.innerHTML = this.renderHomeMain(status); break;
      case 'diaries': body.innerHTML = '<div class="loading-inline">読み込み中...</div>'; this.loadHomeDiaries(); break;
      case 'refs': body.innerHTML = this.renderHomeRefsShell(); this.loadHomeRefs(); break;
    }
  },

  renderHomeMain(status) {
    return `
      ${status.isMonday ? '<div class="bonus-banner">🌟 月曜ボーナス！EXP 2倍！</div>' : ''}
      ${status.isFriday ? '<div class="bonus-banner">🎰 金曜ボーナス！ガチャドロップ率2倍！</div>' : ''}

      <div class="main-buttons">
        <button class="main-btn diary-btn" onclick="App.showScreen('diary')" ${status.diaryDoneToday ? 'data-done="true"' : ''}>
          <span class="btn-icon">📝</span>
          <span class="btn-label">日記を書く</span>
          ${status.diaryDoneToday ? '<span class="btn-badge">✓済</span>' : '<span class="btn-badge">+10 EXP</span>'}
        </button>
        <button class="main-btn reflection-btn" onclick="App.showScreen('reflection')">
          <span class="btn-icon">🔄</span>
          <span class="btn-label">振り返り＋心マトリクス</span>
          <span class="btn-badge">+3〜16 EXP</span>
        </button>
      </div>

      ${status.skillSummary && status.skillSummary.length > 0 ? `
      <div class="home-skills">
        <div class="home-skills-title">⚔️ スキルツリー</div>
        <div class="home-skills-grid">
          ${status.skillSummary.map(s => {
            const type = TYPES.definitions.find(t => t.symbol === s.symbol);
            const isSuperRare = s.symbol === '⭐';
            const isRare = ['！','？'].includes(s.symbol);
            const normalReqs = [1,5,15,30,50];
            const rareReqs = [1,3,8,15,25];
            const superRareReqs = [1,2,5,10,18];
            const reqs = isSuperRare ? superRareReqs : isRare ? rareReqs : normalReqs;
            const nextReq = s.level < 5 ? reqs[s.level] : reqs[4];
            const pct = s.count > 0 ? Math.min(s.count / nextReq * 100, 100) : 0;
            const lvlNames = ['', '見習い', '使い手', '達人', '名人', '伝説'];
            return '<div class="home-skill-card" style="--sk-color:' + (type ? type.color : '#999') + '">' +
              '<div class="home-skill-top">' +
                '<span class="home-skill-sym">' + s.symbol + '</span>' +
                '<span class="home-skill-name">' + (type ? type.name : '') + '</span>' +
                '<span class="home-skill-lv">Lv.' + s.level + (lvlNames[s.level] ? ' ' + lvlNames[s.level] : '') + '</span>' +
              '</div>' +
              '<div class="home-skill-bar"><div class="home-skill-fill" style="width:' + pct + '%"></div></div>' +
              '<div class="home-skill-count">' + s.count + ' / ' + nextReq + '</div>' +
              '</div>';
          }).join('')}
        </div>
      </div>` : ''}

      <button class="weekly-btn" onclick="App.showScreen('weekly')">
        <span>📊</span> 今週の大分析 <span class="weekly-badge">+5 EXP</span>
      </button>

      <div class="home-bottom-row">
        <button class="home-collection-btn" onclick="App.showScreen('collection')">
          <span class="hcb-icon">📖</span>
          <div class="hcb-info">
            <span class="hcb-label">図鑑</span>
            <div class="hcb-bars">
              <span title="武器">🗡️${status.totalPosts || 0}投稿</span>
              <span title="モンスター">🐉${status.totalDiaryPosts || 0}ガチャ</span>
            </div>
          </div>
          <span class="hcb-arrow">→</span>
        </button>
        <button class="sub-btn" onclick="App.showScreen('mypage')">
          <span>👤</span><span>マイページ</span>
        </button>
      </div>

      ${(status.newItemCount || (status.recentNewItems && status.recentNewItems.length)) && !localStorage.getItem('quest_new_items_seen') ? `
        <div class="new-items-banner">
          <span>🎁 新しいアイテムが${status.newItemCount || status.recentNewItems.length}個！</span>
          <button onclick="localStorage.setItem('quest_new_items_seen','1'); this.parentElement.remove(); App.showScreen('collection')">確認する</button>
          <button onclick="localStorage.setItem('quest_new_items_seen','1'); this.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:1.1rem;">✕</button>
        </div>
      ` : ''}
    `;
  },

  // === 日記一覧タブ ===
  async loadHomeDiaries() {
    if (this.homeDiaries) {
      this.renderHomeDiaries();
      return;
    }
    const result = await API.getDiaries(this.currentStudent.studentId);
    this.homeDiaries = (result.success && result.diaries) ? result.diaries : [];
    this.renderHomeDiaries();
  },

  renderHomeDiaries() {
    const body = document.getElementById('home-tab-body');
    if (!body || this.homeTab !== 'diaries') return;
    const diaries = (this.homeDiaries || []).slice().reverse();
    if (diaries.length === 0) { body.innerHTML = '<div class="history-empty">まだ日記がありません</div>'; return; }

    const days = ['日','月','火','水','木','金','土'];
    body.innerHTML = '<div class="home-history-scroll">' + diaries.map(d => {
      const dt = new Date((d.createdAt || '').replace(' ', 'T'));
      const dateStr = !isNaN(dt) ? `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})` : '';
      return `<div class="history-card history-diary">
        <div class="history-card-head">
          <span class="history-date">${dateStr}</span>
          ${d.gachaResult ? '<span class="history-gacha">🎰 ' + this.escapeHtml(d.gachaResult) + '</span>' : ''}
          <span class="history-exp">+${d.expEarned || 10}</span>
        </div>
        <div class="history-card-body">${this.escapeHtml(d.content || '')}</div>
        ${d.teacherComment ? '<div class="history-comment">💬 ' + this.escapeHtml(d.teacherComment) + '</div>' : ''}
      </div>`;
    }).join('') + '</div>';
  },

  // === 振り返り一覧タブ ===
  renderHomeRefsShell() {
    return `
      <div class="home-ref-chips">
        <button class="ref-chip ${!this.homeRefSubject ? 'selected' : ''}" onclick="App.filterHomeRefs(null)">全教科</button>
        ${CONFIG.subjects.map(s => `<button class="ref-chip ${this.homeRefSubject === s ? 'selected' : ''}" onclick="App.filterHomeRefs('${s}')">${s}</button>`).join('')}
      </div>
      <div id="home-refs-list"><div class="loading-inline">読み込み中...</div></div>
    `;
  },

  async loadHomeRefs() {
    if (this.homeRefs) {
      this.renderHomeRefs();
      return;
    }
    const sid = this.currentStudent.studentId;
    const [refResult, matResult] = await Promise.all([
      API.getReflections(sid),
      API.getMatrixHistory(sid)
    ]);
    this.homeRefs = (refResult.success && refResult.reflections) ? refResult.reflections : [];
    this.homeMats = (matResult.success && matResult.records) ? matResult.records : [];
    this.renderHomeRefs();
  },

  filterHomeRefs(subject) {
    this.homeRefSubject = subject;
    // チップの選択状態を更新
    document.querySelectorAll('.home-ref-chips .ref-chip').forEach(c => c.classList.remove('selected'));
    if (!subject) {
      document.querySelector('.home-ref-chips .ref-chip')?.classList.add('selected');
    } else {
      document.querySelectorAll('.home-ref-chips .ref-chip').forEach(c => {
        if (c.textContent === subject) c.classList.add('selected');
      });
    }
    this.renderHomeRefs();
  },

  renderHomeRefs() {
    const list = document.getElementById('home-refs-list');
    if (!list || this.homeTab !== 'refs') return;
    const refs = this.homeRefs || [];
    const mats = this.homeMats || [];

    const filtered = (this.homeRefSubject ? refs.filter(r => r.subject === this.homeRefSubject) : refs).slice().reverse();
    if (filtered.length === 0) {
      list.innerHTML = '<div class="history-empty">まだ振り返りがありません</div>';
      return;
    }

    const matByRef = {};
    for (const m of mats) { if (m.reflectionId) matByRef[m.reflectionId] = m; }

    const days = ['日','月','火','水','木','金','土'];
    let idx = 0;

    list.innerHTML = '<div class="home-history-scroll">' + filtered.map(r => {
      const dt = new Date((r.createdAt || '').replace(' ', 'T'));
      const dateStr = !isNaN(dt) ? `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})` : '';
      const mat = matByRef[r.id];
      const matPoints = mat ? this.parseMatrixPoints(mat.pointsJson) : [];
      const curIdx = idx++;

      return `<div class="history-card history-ref">
        <div class="history-card-head">
          <span class="history-date">${dateStr}</span>
          <span class="history-subject">${this.escapeHtml(r.subject || '')}</span>
          ${r.types ? '<span class="history-types">' + r.types + '</span>' : ''}
          <span class="history-exp">+${r.expEarned || 5}</span>
        </div>
        ${r.plan ? '<div class="history-plan">📋 ' + this.escapeHtml(r.plan) + '</div>' : ''}
        <div class="history-card-body">${this.escapeHtml(r.content || '')}</div>
        ${r.teacherComment ? '<div class="history-comment">💬 ' + this.escapeHtml(r.teacherComment) + '</div>' : ''}
        ${matPoints.length > 0 ? `
          <div class="history-matrix-fig">
            <img src="assets/heart-matrix.png" class="hm-fig-img" draggable="false">
            <canvas class="hm-fig-canvas" data-points='${JSON.stringify(matPoints)}'></canvas>
          </div>
          <div class="history-matrix">🌍 ${this.escapeHtml(mat.zoneSequence || mat.dominantZone || '')}</div>
        ` : (mat ? '<div class="history-matrix">🌍 ' + this.escapeHtml(mat.zoneSequence || mat.dominantZone || '') + '</div>' : '')}
      </div>`;
    }).join('') + '</div>';

    // マトリクスのcanvasを描画
    setTimeout(() => this.drawHomeMatrixCanvases(), 50);
  },

  parseMatrixPoints(json) {
    try { const arr = JSON.parse(json || '[]'); return Array.isArray(arr) ? arr : []; }
    catch(e) { return []; }
  },

  drawHomeMatrixCanvases() {
    document.querySelectorAll('.hm-fig-canvas').forEach(canvas => {
      let points;
      try { points = JSON.parse(canvas.dataset.points || '[]'); } catch(e) { return; }
      if (points.length === 0) return;

      const wrap = canvas.parentElement;
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width, h = rect.height;

      if (points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(points[0].px * w / 100, points[0].py * h / 100);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].px * w / 100, points[i].py * h / 100);
        ctx.strokeStyle = 'rgba(99,102,241,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      points.forEach((p, i) => {
        const x = p.px * w / 100, y = p.py * h / 100;
        const t = i / Math.max(points.length - 1, 1);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${Math.round(99+t*140)},${Math.round(102-t*40)},${Math.round(241-t*100)})`;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });
  },

  // ========== 画面遷移 ==========

  /**
   * 画面を切り替え
   */
  showScreen(screenId) {
    // 全画面を非表示
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    // 指定画面を表示
    const screen = document.getElementById('screen-' + screenId);
    if (screen) {
      screen.classList.add('active');
      this.currentScreen = screenId;
    }

    // 画面固有の初期化
    switch (screenId) {
      case 'diary':
        Diary.init();
        break;
      case 'reflection':
        Reflection.init();
        break;
      case 'matrix':
        Matrix.init();
        break;
      case 'weekly':
        Weekly.init();
        break;
      case 'skill-tree':
        SkillTree.init();
        break;
      case 'collection':
        Collection.init();
        break;
      case 'mypage':
        MyPage.init();
        break;
    }
  },

  // ========== ユーティリティ ==========

  showLoading(msg) {
    const el = document.getElementById('loading-overlay');
    if (el) {
      el.querySelector('.loading-text').textContent = msg || '読み込み中...';
      el.classList.add('active');
    }
  },

  hideLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.remove('active');
  },

  showError(msg) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = msg;
      toast.className = 'toast error active';
      setTimeout(() => toast.classList.remove('active'), 3000);
    }
  },

  showSuccess(msg) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = msg;
      toast.className = 'toast success active';
      setTimeout(() => toast.classList.remove('active'), 3000);
    }
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /** EXPからレベルを計算 */
  calcLevel(totalExp) {
    let level = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (totalExp >= LEVEL_THRESHOLDS[i]) level = i + 1;
      else break;
    }
    return level;
  },

  /** 次のレベルまでの必要EXP */
  calcExpToNext(totalExp) {
    const level = this.calcLevel(totalExp);
    if (level >= LEVEL_THRESHOLDS.length) return 0;
    return LEVEL_THRESHOLDS[level] - totalExp;
  },

  /** レベルアップバナーを表示 */
  showLevelUpBanner(oldLevel, newLevel) {
    // 既存バナーがあれば削除
    const existing = document.getElementById('levelup-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'levelup-banner';
    banner.className = 'levelup-banner';
    banner.innerHTML = `
      <div class="levelup-content">
        <span class="levelup-icon">🎉</span>
        <span class="levelup-text">レベルアップ！ Lv.${oldLevel} → Lv.${newLevel}</span>
      </div>
    `;
    document.body.appendChild(banner);

    // 5秒後に自動消去
    setTimeout(() => {
      banner.classList.add('fadeout');
      setTimeout(() => banner.remove(), 500);
    }, 5000);
  }
};

// EXPレベルテーブル（code.jsと同じ）
const LEVEL_THRESHOLDS = [0,10,30,50,80,120,170,230,300,380,470,570,680,800,930,1070,1220,1380,1550,1730,1920,2120,2330,2550,2780,3020,3270,3530,3800,4080,4370,4670,4980,5300,5630,5970,6320,6680,7050,7430,7820,8220,8630,9050,9480,9920,10370,10830,11300,11780];

// アプリ起動
document.addEventListener('DOMContentLoaded', () => App.init());
/**
 * 学びの冒険クエスト - 日記入力画面
 * ★高速化: ガチャをクライアント側で即座実行→結果を先に表示→GAS保存はバックグラウンド
 * ★左: 過去の日記一覧（先生コメント付き）、右: 入力フォーム
 */

// クライアント側ガチャテーブル（code.jsと同じ）
const CLIENT_GACHA = [
  { id: 'mon_001', name: 'スライムン', rarity: 1, rate: 0.05 },
  { id: 'mon_002', name: 'コモリ', rarity: 1, rate: 0.05 },
  { id: 'mon_003', name: 'ヒノタマ', rarity: 1, rate: 0.05 },
  { id: 'mon_004', name: 'モグリン', rarity: 1, rate: 0.05 },
  { id: 'mon_005', name: 'フワリス', rarity: 1, rate: 0.05 },
  { id: 'mon_006', name: 'カゲロウ', rarity: 2, rate: 0.03 },
  { id: 'mon_007', name: 'コオリノ', rarity: 2, rate: 0.03 },
  { id: 'mon_008', name: 'イカヅチ', rarity: 2, rate: 0.03 },
  { id: 'mon_009', name: 'ハナビ', rarity: 2, rate: 0.03 },
  { id: 'mon_010', name: 'ツキヨミ', rarity: 2, rate: 0.03 },
  { id: 'mon_011', name: 'ゴーレム', rarity: 2, rate: 0.03 },
  { id: 'mon_012', name: 'フェニリス', rarity: 3, rate: 0.01 },
  { id: 'mon_013', name: 'リヴァイア', rarity: 3, rate: 0.01 },
  { id: 'mon_014', name: 'ヤマタノ', rarity: 3, rate: 0.01 },
  { id: 'mon_015', name: 'テンクウ', rarity: 3, rate: 0.01 }
];

function clientRollGacha(isFriday) {
  const table = CLIENT_GACHA.map(m => ({
    ...m,
    effectiveRate: (isFriday && m.rarity >= 2) ? m.rate * 2 : m.rate
  }));
  const totalRate = table.reduce((sum, m) => sum + m.effectiveRate, 0);
  const missRate = Math.max(0.10, 1 - totalRate);
  const roll = Math.random() * (totalRate + missRate);
  let cumulative = 0;
  for (const m of table) {
    cumulative += m.effectiveRate;
    if (roll < cumulative) return m;
  }
  return null;
}

const Diary = {
  pastDiaries: null,

  init() {
    this.pastDiaries = null;
    const el = document.getElementById('screen-diary');
    const s = App.currentStudent;
    const alreadyDone = s.diaryDoneToday;

    el.innerHTML = `
      <div class="diary-layout">
        <!-- 左: 過去の日記一覧 -->
        <div class="diary-left">
          <div class="diary-left-head">📖 過去の日記</div>
          <div class="diary-history" id="diary-history">
            <div class="loading-inline">読み込み中...</div>
          </div>
        </div>

        <!-- 右: 入力フォーム -->
        <div class="diary-right">
          <div class="screen-header">
            <button class="back-btn" onclick="App.showHome(false)">← もどる</button>
            <h2>📝 日記を書く</h2>
          </div>
          <div class="diary-form">
            <textarea id="diary-content" class="text-input" rows="8"
              placeholder="今日あったこと、思ったこと、感じたことを自由に書いてね！"></textarea>
            <div class="char-count">
              <span id="diary-chars">0</span>文字
            </div>
            <button id="diary-submit" class="submit-btn" onclick="Diary.submit()">
              ${alreadyDone ? '📮 日記を追加する' : '📮 送信してガチャを引く！'}
            </button>
          </div>
          <div id="diary-result" class="result-area" style="display:none;"></div>
        </div>
      </div>
    `;

    document.getElementById('diary-content').addEventListener('input', (e) => {
      document.getElementById('diary-chars').textContent = e.target.value.length;
    });

    // 過去の日記をバックグラウンドで読み込み
    this.loadPastDiaries();
  },

  async loadPastDiaries() {
    const result = await API.getDiaries(App.currentStudent.studentId);
    const container = document.getElementById('diary-history');
    if (!container) return;

    if (!result.success || !result.diaries || result.diaries.length === 0) {
      container.innerHTML = '<div class="history-empty">まだ日記がありません</div>';
      return;
    }

    this.pastDiaries = result.diaries;
    const days = ['日','月','火','水','木','金','土'];

    container.innerHTML = result.diaries.map(d => {
      const dt = new Date((d.createdAt || '').replace(' ', 'T'));
      const dateStr = !isNaN(dt) ? `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})` : '';
      const esc = s => { const el = document.createElement('div'); el.textContent = s; return el.innerHTML; };

      return `<div class="history-card history-diary">
        <div class="history-card-head">
          <span class="history-date">${dateStr}</span>
          ${d.gachaResult ? '<span class="history-gacha">🎰</span>' : ''}
          <span class="history-exp">+${d.expEarned || 10}</span>
        </div>
        <div class="history-card-body">${esc(d.content || '')}</div>
        ${d.teacherComment ? '<div class="history-comment">💬 ' + esc(d.teacherComment) + '</div>' : ''}
      </div>`;
    }).join('');
  },

  async submit() {
    const content = document.getElementById('diary-content').value.trim();
    if (!content) return App.showError('日記の内容を入力してください');

    const btn = document.getElementById('diary-submit');
    btn.disabled = true;

    const s = App.currentStudent;
    const alreadyDone = s.diaryDoneToday;
    const isMon = s.isMonday;
    const isFri = s.isFriday;

    // ★即座にクライアント側で結果を予測して表示
    const baseExp = alreadyDone ? 5 : 10;
    const expGained = baseExp * (isMon ? 2 : 1);
    const gachaResult = (!alreadyDone) ? clientRollGacha(isFri) : null;

    // 即座に結果画面を表示（API応答を待たない）
    this.showInstantResult(expGained, gachaResult, isMon, alreadyDone, s);

    // バックグラウンドでGASに保存
    const result = await API.submitDiary(App.currentStudent.studentId, content);

    if (result.success) {
      if ((result.milestones && result.milestones.length > 0) || (result.gacha && result.gacha.item)) {
        localStorage.removeItem('quest_new_items_seen');
      }
      this.updateWithServerResult(result);
    } else {
      App.showError('保存エラー: ' + (result.error || ''));
    }
  },

  showInstantResult(expGained, gachaResult, isMonday, alreadyDone, student) {
    const area = document.getElementById('diary-result');
    area.style.display = 'block';
    document.querySelector('.diary-form').style.display = 'none';

    let html = `
      <div class="result-exp animate-pop">
        <div class="exp-gain">+${expGained} EXP${isMonday ? ' (月曜2倍！)' : ''}</div>
      </div>

      <div class="result-streak">
        🔥 連続 ${(student.streakDays || 0) + (student.streakDays === 0 ? 1 : 0)} 日
      </div>
    `;

    if (!alreadyDone) {
      if (gachaResult) {
        const stars = '⭐'.repeat(gachaResult.rarity);
        html += `
          <div class="gacha-result animate-gacha">
            <div class="gacha-card rarity-${gachaResult.rarity}">
              <div class="gacha-stars">${stars}</div>
              <div class="gacha-name">${gachaResult.name}</div>
              <div class="gacha-new">NEW!</div>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="gacha-result gacha-miss">
            <div class="gacha-miss-text">カードの影がチラッと見えて消えた...</div>
            <div class="gacha-encourage">おしい！次はきっと...</div>
          </div>
        `;
      }
    }

    html += `
      <div id="diary-server-extras"></div>
      <button class="return-btn" onclick="Diary.goHome()">🏠 ホームにもどる</button>
    `;

    area.innerHTML = html;
  },

  updateWithServerResult(result) {
    const extras = document.getElementById('diary-server-extras');
    if (!extras) return;

    let html = '';
    const streak = result.streak;
    if (streak && streak.newRewards && streak.newRewards.length > 0) {
      html += `<div class="milestone-result">🏆 ${streak.newRewards.map(r => r.name).join(', ')} 獲得！</div>`;
    }
    if (result.milestones && result.milestones.length > 0) {
      html += `<div class="milestone-result">🗡️ ${result.milestones.map(m => m.name).join(', ')} を手に入れた！</div>`;
    }
    if (result.exp && result.exp.leveledUp) {
      const expEl = document.querySelector('.result-exp');
      if (expEl) {
        expEl.innerHTML += `<div class="level-up">🎉 レベルアップ！ Lv.${result.exp.oldLevel} → Lv.${result.exp.newLevel}</div>`;
      }
    }
    extras.innerHTML = html;
  },

  goHome() {
    const s = App.currentStudent;
    const oldLevel = s.level || 1;
    const baseExp = s.diaryDoneToday ? 5 : 10;
    const gained = baseExp * (s.isMonday ? 2 : 1);
    s.totalExp = (s.totalExp || 0) + gained;
    s.level = App.calcLevel(s.totalExp);
    s.totalDiaryPosts = (s.totalDiaryPosts || 0) + 1;
    s.totalPosts = (s.totalDiaryPosts || 0) + (s.totalReflectionPosts || 0);
    s.diaryDoneToday = true;
    s.expToNext = App.calcExpToNext(s.totalExp);
    localStorage.setItem('quest_student_cache', JSON.stringify(s));
    App.renderHome(s);
    App.showScreen('home');
    if (s.level > oldLevel) App.showLevelUpBanner(oldLevel, s.level);
    API.getStudentByToken(localStorage.getItem('quest_access_token')).then(r => {
      if (r.success) {
        App.currentStudent = r.student;
        localStorage.setItem('quest_student_cache', JSON.stringify(r.student));
        App.renderHome(r.student);
      }
    });
  }
};
/**
 * 学びの冒険クエスト - 振り返り+心マトリクス統合画面
 * PC最適化: 左に心マトリクス＋教科別の過去記録、右に振り返り入力
 */

const Reflection = {
  usedSymbols: new Set(),
  matrixPoints: [],
  canvas: null,
  ctx: null,
  CIRCLE: { cx: 50, cy: 50, r: 42 },
  pastRefs: null,
  pastMats: null,

  ZONES: [
    { name: 'パワーアップ', center: 0 },
    { name: '学びが生まれる', center: 45 },
    { name: '人も自分も笑顔', center: 90 },
    { name: 'ダラダラ', center: 135 },
    { name: 'たいくつ・どんより', center: 180 },
    { name: '不安・寂しい', center: 225 },
    { name: '人も自分もイヤな顔', center: 270 },
    { name: 'イライラ', center: 315 }
  ],

  init() {
    this.usedSymbols.clear();
    this.matrixPoints = [];
    this.pastRefs = null;
    this.pastMats = null;
    const el = document.getElementById('screen-reflection');

    el.innerHTML = `
      <div class="ref-layout">
        <!-- 左: 心マトリクス + 教科別の過去記録 -->
        <div class="ref-left">
          <div class="matrix-wrap">
            <img src="assets/heart-matrix.png" class="matrix-bg" alt="心マトリクス" draggable="false">
            <canvas id="matrix-canvas"></canvas>
          </div>
          <div class="matrix-bar">
            <button class="ctrl-btn-sm" onclick="Reflection.undoPoint()">↩ もどす</button>
            <span class="matrix-count" id="matrix-count">タップ: 0</span>
            <button class="ctrl-btn-sm" onclick="Reflection.resetPoints()">🔄 リセット</button>
          </div>
          <div class="matrix-trail" id="matrix-trail"></div>
          <div class="ref-past-section" id="ref-past-section"></div>
        </div>

        <!-- 右: 振り返り入力 -->
        <div class="ref-right">
          <div class="ref-top-row">
            <button class="back-link" onclick="App.showHome(false)">← ホーム</button>
          </div>
          <div class="ref-chip-section">
            <div class="ref-chip-label">教科</div>
            <div class="ref-chips" id="ref-subject-chips">
              ${CONFIG.subjects.map(s => `<button class="ref-chip" data-value="${s}" onclick="Reflection.selectSubject(this)">${s}</button>`).join('')}
            </div>
          </div>
          <div class="ref-chip-section">
            <div class="ref-chip-label">時間目</div>
            <div class="ref-chips" id="ref-period-chips">
              ${CONFIG.periods.map(p => `<button class="ref-chip" data-value="${p}" onclick="Reflection.selectPeriod(this)">${p.replace('時間目','')}</button>`).join('')}
            </div>
          </div>
          <input type="hidden" id="ref-subject" value="">
          <input type="hidden" id="ref-period" value="">

          <div class="ref-plan-row">
            <label class="ref-label">📋 計画</label>
            <input type="text" id="ref-plan" class="ref-plan-input" placeholder="今日の授業でがんばること・めあて">
          </div>

          <div class="type-toolbar" id="type-toolbar">
            ${TYPES.definitions.map(t => `
              <button class="type-btn" data-symbol="${t.symbol}"
                onclick="Reflection.insertType('${t.symbol}')"
                title="${t.hint}"
                style="--type-color: ${t.color}">
                <span class="type-symbol">${t.symbol}</span>
                <span class="type-name">${t.name}</span>
              </button>
            `).join('')}
          </div>

          <textarea id="ref-content" class="ref-textarea" rows="5"
            oninput="Reflection.onInput()"
            placeholder="記号をタップ → 振り返りを書こう&#10;＋ できたこと  − 難しかったこと&#10;→ 次の目標  ！ 気づき&#10;？ ギモン  ⭐ 成長  ☀️ 仲間"></textarea>

          <div class="detected-types" id="detected-types"></div>

          <button id="ref-submit" class="submit-btn" onclick="Reflection.submit()">
            ✏️ 振り返り＋マトリクスを送信
          </button>
        </div>
      </div>

      <div id="ref-result" class="result-overlay" style="display:none;"></div>
    `;

    this.setupCanvas();
    this.autoSelectPeriod();
    // バックグラウンドで過去データを取得
    this.loadPastData();
  },

  async loadPastData() {
    const sid = App.currentStudent.studentId;
    const [refResult, matResult] = await Promise.all([
      API.getReflections(sid),
      API.getMatrixHistory(sid)
    ]);
    this.pastRefs = (refResult.success && refResult.reflections) ? refResult.reflections : [];
    this.pastMats = (matResult.success && matResult.records) ? matResult.records : [];
    // 教科が既に選択されていたら表示
    const subject = document.getElementById('ref-subject')?.value;
    if (subject) this.showPastForSubject(subject);
  },

  showPastForSubject(subject) {
    const section = document.getElementById('ref-past-section');
    if (!section) return;
    if (!this.pastRefs) {
      section.innerHTML = '<div class="loading-inline" style="font-size:0.8rem;">読み込み中...</div>';
      return;
    }

    const filtered = this.pastRefs.filter(r => r.subject === subject).slice().reverse();
    if (filtered.length === 0) {
      section.innerHTML = `<div class="ref-past-head">📖 ${App.escapeHtml(subject)} の過去の記録</div><div class="history-empty">まだありません</div>`;
      return;
    }

    const matByRef = {};
    for (const m of (this.pastMats || [])) { if (m.reflectionId) matByRef[m.reflectionId] = m; }

    const days = ['日','月','火','水','木','金','土'];
    const esc = s => { const el = document.createElement('div'); el.textContent = s; return el.innerHTML; };

    section.innerHTML = `<div class="ref-past-head">📖 ${esc(subject)} の過去の記録（${filtered.length}件）</div>` +
      filtered.slice(0, 10).map(r => {
        const dt = new Date((r.createdAt || '').replace(' ', 'T'));
        const dateStr = !isNaN(dt) ? `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})` : '';
        const mat = matByRef[r.id];

        return `<div class="history-card history-ref">
          <div class="history-card-head">
            <span class="history-date">${dateStr}</span>
            ${r.types ? '<span class="history-types">' + r.types + '</span>' : ''}
          </div>
          ${r.plan ? '<div class="history-plan">📋 ' + esc(r.plan) + '</div>' : ''}
          <div class="history-card-body">${esc(r.content || '')}</div>
          ${r.teacherComment ? '<div class="history-comment">💬 ' + esc(r.teacherComment) + '</div>' : ''}
          ${mat ? '<div class="history-matrix">🌍 ' + esc(mat.zoneSequence || mat.dominantZone || '') + '</div>' : ''}
        </div>`;
      }).join('');
  },

  autoSelectPeriod() {
    const now = new Date();
    const hhmm = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    let matchedPeriod = null;
    for (const pt of (CONFIG.periodTimes || [])) {
      if (hhmm >= pt.start && hhmm <= this.addMinutes(pt.end, 15)) {
        matchedPeriod = pt.period;
        break;
      }
    }
    if (matchedPeriod) {
      const btn = document.querySelector(`#ref-period-chips .ref-chip[data-value="${matchedPeriod}時間目"]`);
      if (btn) this.selectPeriod(btn);
    }
  },

  addMinutes(timeStr, min) {
    const [h, m] = timeStr.split(':').map(Number);
    const total = h * 60 + m + min;
    return ('0' + Math.floor(total / 60)).slice(-2) + ':' + ('0' + (total % 60)).slice(-2);
  },

  setupCanvas() {
    const wrap = document.querySelector('.matrix-wrap');
    if (!wrap) return;
    this.canvas = document.getElementById('matrix-canvas');
    this.ctx = this.canvas.getContext('2d');

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.canvas.style.width = rect.width + 'px';
      this.canvas.style.height = rect.height + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawPoints();
    };
    resize();
    window.addEventListener('resize', resize);

    this.canvas.addEventListener('click', (e) => this.onTap(e));
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.onTap(e.changedTouches[0]);
    });
  },

  onTap(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 100;
    const y = (event.clientY - rect.top) / rect.height * 100;
    if (!this.isInsideCircle(x, y)) return;

    const zone = this.detectZone(x, y);
    this.matrixPoints.push({ px: x, py: y, zone: zone.name, order: this.matrixPoints.length + 1 });
    this.drawPoints();
    this.updateTrail();
  },

  isInsideCircle(xPct, yPct) {
    const dx = xPct - this.CIRCLE.cx;
    const dy = yPct - this.CIRCLE.cy;
    return Math.sqrt(dx * dx + dy * dy) <= this.CIRCLE.r;
  },

  detectZone(xPct, yPct) {
    const dx = xPct - this.CIRCLE.cx;
    const dy = yPct - this.CIRCLE.cy;
    if (Math.sqrt(dx * dx + dy * dy) < this.CIRCLE.r * 0.25) return { name: '中心' };
    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    for (const zone of this.ZONES) {
      let diff = Math.abs(angle - zone.center);
      if (diff > 180) diff = 360 - diff;
      if (diff <= 22.5) return zone;
    }
    return { name: '中心' };
  },

  drawPoints() {
    if (!this.ctx) return;
    const w = this.canvas.getBoundingClientRect().width;
    const h = this.canvas.getBoundingClientRect().height;
    this.ctx.clearRect(0, 0, w, h);
    if (this.matrixPoints.length === 0) return;

    if (this.matrixPoints.length >= 2) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.matrixPoints[0].px * w / 100, this.matrixPoints[0].py * h / 100);
      for (let i = 1; i < this.matrixPoints.length; i++) {
        this.ctx.lineTo(this.matrixPoints[i].px * w / 100, this.matrixPoints[i].py * h / 100);
      }
      this.ctx.strokeStyle = 'rgba(99,102,241,0.6)';
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
    }

    this.matrixPoints.forEach((p, i) => {
      const x = p.px * w / 100;
      const y = p.py * h / 100;
      const t = i / Math.max(this.matrixPoints.length - 1, 1);
      const r = Math.round(99 + t * 140);
      const g = Math.round(102 - t * 40);
      const b = Math.round(241 - t * 100);

      this.ctx.beginPath();
      this.ctx.arc(x, y, 7, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgb(${r},${g},${b})`;
      this.ctx.fill();
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      this.ctx.font = 'bold 12px sans-serif';
      if (i === 0) { this.ctx.fillStyle = '#6366f1'; this.ctx.fillText('はじめ', x + 10, y - 5); }
      if (i === this.matrixPoints.length - 1 && i > 0) { this.ctx.fillStyle = '#ec4899'; this.ctx.fillText('いま', x + 10, y - 5); }
    });

    document.getElementById('matrix-count').textContent = 'タップ: ' + this.matrixPoints.length;
  },

  updateTrail() {
    const el = document.getElementById('matrix-trail');
    if (this.matrixPoints.length === 0) { el.innerHTML = ''; return; }
    const zones = this.matrixPoints.map(p => p.zone);
    const seq = [zones[0]];
    for (let i = 1; i < zones.length; i++) { if (zones[i] !== zones[i-1]) seq.push(zones[i]); }
    el.innerHTML = seq.join(' → ');
  },

  undoPoint() { if (this.matrixPoints.length === 0) return; this.matrixPoints.pop(); this.drawPoints(); this.updateTrail(); },
  resetPoints() { this.matrixPoints = []; this.drawPoints(); this.updateTrail(); },

  selectSubject(btn) {
    document.querySelectorAll('#ref-subject-chips .ref-chip').forEach(c => c.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('ref-subject').value = btn.dataset.value;
    this.showPastForSubject(btn.dataset.value);
  },

  selectPeriod(btn) {
    document.querySelectorAll('#ref-period-chips .ref-chip').forEach(c => c.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('ref-period').value = btn.dataset.value;
  },

  insertType(symbol) {
    if (this.usedSymbols.has(symbol)) return;
    const textarea = document.getElementById('ref-content');
    const pos = textarea.selectionStart;
    const text = textarea.value;
    const insert = (pos > 0 && text[pos - 1] !== '\n' ? '\n' : '') + symbol + ' ';
    textarea.value = text.substring(0, pos) + insert + text.substring(pos);
    textarea.selectionStart = textarea.selectionEnd = pos + insert.length;
    textarea.focus();
    this.usedSymbols.add(symbol);
    this.updateToolbar();
    this.updateDetectedTypes();
  },

  onInput() {
    const text = document.getElementById('ref-content').value;
    this.usedSymbols.clear();
    for (const type of TYPES.definitions) { if (text.includes(type.symbol)) this.usedSymbols.add(type.symbol); }
    this.updateToolbar();
    this.updateDetectedTypes();
  },

  updateToolbar() {
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('used', this.usedSymbols.has(btn.dataset.symbol));
    });
  },

  updateDetectedTypes() {
    const text = document.getElementById('ref-content').value;
    const detected = TYPES.detect(text);
    const el = document.getElementById('detected-types');
    el.innerHTML = detected.map(s => {
      const t = TYPES.getBySymbol(s);
      return `<span class="type-tag" style="background:${t.color}20;color:${t.color};border:1px solid ${t.color}">${s} ${t.name}</span>`;
    }).join('');
  },

  async submit() {
    const subject = document.getElementById('ref-subject').value;
    const period = document.getElementById('ref-period').value;
    const plan = document.getElementById('ref-plan').value.trim();
    const content = document.getElementById('ref-content').value.trim();

    if (!subject) return App.showError('教科を選択してください');
    if (!content) return App.showError('振り返りの内容を入力してください');

    const btn = document.getElementById('ref-submit');
    btn.disabled = true;
    btn.textContent = '送信中...';

    const detectedTypes = TYPES.detect(content);
    let baseExp = detectedTypes.length <= 1 ? 3 : detectedTypes.length === 2 ? 5 : detectedTypes.length === 3 ? 8 : 12;
    if (plan && plan.length > 0) baseExp += 2;
    const hasMatrix = this.matrixPoints.length > 0;
    if (hasMatrix) baseExp += 3;
    const expGained = baseExp * (App.currentStudent.isMonday ? 2 : 1);

    this.showInstantResult(expGained, detectedTypes, hasMatrix);

    let result;
    if (hasMatrix) {
      const startZone = this.matrixPoints[0].zone;
      const endZone = this.matrixPoints[this.matrixPoints.length - 1].zone;
      result = await API.submitReflectionWithMatrix(
        App.currentStudent.studentId,
        { subject, period, plan, content },
        { matrixPoints: this.matrixPoints, matrixStartZone: startZone, matrixEndZone: endZone, matrixZoneSequence: this.getZoneSequence(), matrixDominantZone: this.getDominantZone() }
      );
    } else {
      result = await API.submitReflection(App.currentStudent.studentId, subject, period, plan, content);
    }

    if (result.success) { this.updateWithServerResult(result); }
    else { App.showError('保存エラー: ' + (result.error || '')); }
  },

  getZoneSequence() {
    const z = this.matrixPoints.map(p => p.zone);
    const s = [z[0]];
    for (let i = 1; i < z.length; i++) { if (z[i] !== z[i-1]) s.push(z[i]); }
    return s.join('→');
  },

  getDominantZone() {
    const c = {};
    for (const p of this.matrixPoints) c[p.zone] = (c[p.zone] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || '中心';
  },

  showInstantResult(expGained, detectedTypes, hasMatrix) {
    const area = document.getElementById('ref-result');
    area.style.display = 'flex';
    area.innerHTML = `
      <div class="result-card">
        <div class="result-exp animate-pop">+${expGained} EXP${App.currentStudent.isMonday ? ' (月曜2倍！)' : ''}</div>
        ${detectedTypes.length > 0 ? `<div class="result-types-line">${detectedTypes.map(s => { const t = TYPES.getBySymbol(s); return '<span style="color:' + (t?.color||'#666') + '">' + s + ' ' + (t?.name||'') + '</span>'; }).join(' ')}</div>` : ''}
        ${hasMatrix ? '<div>🌍 マトリクス記録中...</div>' : ''}
        <div id="ref-server-extras"></div>
        <button class="return-btn" onclick="Reflection.goHome()">🏠 ホームにもどる</button>
      </div>
    `;
  },

  updateWithServerResult(result) {
    const extras = document.getElementById('ref-server-extras');
    if (!extras) return;
    let html = '';
    const r = result.reflection || result;
    const exp = r.exp || result.exp;
    const skills = r.skills || result.skills || { updatedTypes: [], newBadges: [] };
    if (exp && exp.leveledUp) html += `<div class="level-up">🎉 レベルアップ！ Lv.${exp.oldLevel} → Lv.${exp.newLevel}</div>`;
    if (skills.updatedTypes) {
      skills.updatedTypes.filter(u => u.level > u.oldLevel).forEach(u => {
        html += `<div>⬆️ ${TYPES.getBySymbol(u.symbol)?.name||u.symbol} Lv.${u.level}</div>`;
      });
    }
    extras.innerHTML = html;
  },

  goHome() {
    document.getElementById('ref-result').style.display = 'none';
    const s = App.currentStudent;
    const oldLevel = s.level || 1;
    const content = document.getElementById('ref-content')?.value || '';
    const plan = document.getElementById('ref-plan')?.value || '';
    const types = TYPES.detect(content);
    let base = types.length <= 1 ? 3 : types.length === 2 ? 5 : types.length === 3 ? 8 : 12;
    if (plan.trim().length > 0) base += 2;
    if (this.matrixPoints.length > 0) base += 3;
    const gained = base * (s.isMonday ? 2 : 1);
    s.totalExp = (s.totalExp || 0) + gained;
    s.level = App.calcLevel(s.totalExp);
    s.totalReflectionPosts = (s.totalReflectionPosts || 0) + 1;
    s.totalPosts = (s.totalDiaryPosts || 0) + (s.totalReflectionPosts || 0);
    s.expToNext = App.calcExpToNext(s.totalExp);
    localStorage.setItem('quest_student_cache', JSON.stringify(s));
    App.renderHome(s);
    App.showScreen('home');
    if (s.level > oldLevel) App.showLevelUpBanner(oldLevel, s.level);
    API.getStudentByToken(localStorage.getItem('quest_access_token')).then(r => {
      if (r.success) {
        App.currentStudent = r.student;
        localStorage.setItem('quest_student_cache', JSON.stringify(r.student));
        App.renderHome(r.student);
      }
    });
  }
};
/**
 * 学びの冒険クエスト - 心マトリクス記録画面
 * 円形マトリクス上にタップで学びの軌跡を記録
 */

const Matrix = {
  canvas: null,
  ctx: null,
  points: [],
  pendingReflection: null, // 振り返り画面から引き継いだデータ

  // 円の定義（%単位）
  CIRCLE: { cx: 50, cy: 50, r: 42 },

  // 8つのゾーン
  ZONES: [
    { name: 'グングン', emoji: '🌙', center: 0, color: '#6366f1' },
    { name: 'キラキラ', emoji: '⭐', center: 45, color: '#eab308' },
    { name: 'ニコニコ', emoji: '☀️', center: 90, color: '#f97316' },
    { name: 'フワフワ', emoji: '🌸', center: 135, color: '#ec4899' },
    { name: 'ダラダラ', emoji: '💧', center: 180, color: '#94a3b8' },
    { name: 'ドロドロ', emoji: '🌀', center: 225, color: '#78716c' },
    { name: 'モヤモヤ', emoji: '☁️', center: 270, color: '#64748b' },
    { name: 'イライラ', emoji: '⚡', center: 315, color: '#ef4444' }
  ],

  init() {
    const el = document.getElementById('screen-matrix');
    const hasPending = !!this.pendingReflection;

    el.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" onclick="${hasPending ? 'App.showScreen(\'reflection\')' : 'App.showHome(false)'}">← もどる</button>
        <h2>🌍 心マトリクス</h2>
      </div>

      ${hasPending ? `
        <div class="matrix-info">
          📝 ${this.pendingReflection.subject} の振り返りと一緒に記録します
        </div>
      ` : `
        <div class="matrix-selectors">
          <select id="matrix-subject" class="select-input">
            <option value="">教科</option>
            ${CONFIG.subjects.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
          <select id="matrix-period" class="select-input">
            <option value="">時間目</option>
            ${CONFIG.periods.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
      `}

      <div class="matrix-container">
        <canvas id="matrix-canvas" width="400" height="400"></canvas>
        <div class="zone-labels" id="zone-labels"></div>
      </div>

      <div class="matrix-controls">
        <button class="ctrl-btn" onclick="Matrix.undo()">↩️ もどす</button>
        <button class="ctrl-btn" onclick="Matrix.reset()">🔄 やりなおし</button>
      </div>

      <div class="matrix-summary" id="matrix-summary"></div>

      <button id="matrix-submit" class="submit-btn" onclick="Matrix.submit()" disabled>
        ${hasPending ? '📝 振り返り+マトリクスを送信' : '📍 記録を保存'}
      </button>

      <div id="matrix-result" class="result-area" style="display:none;"></div>
    `;

    this.points = [];
    this.setupCanvas();
    this.renderZoneLabels();
  },

  setupCanvas() {
    this.canvas = document.getElementById('matrix-canvas');
    this.ctx = this.canvas.getContext('2d');

    // 高DPI対応
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    this.drawBackground();

    // タッチ/クリックイベント
    this.canvas.addEventListener('click', (e) => this.onTap(e));
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      this.onTap(touch);
    });
  },

  renderZoneLabels() {
    const el = document.getElementById('zone-labels');
    el.innerHTML = this.ZONES.map(z => {
      const angle = (z.center - 90) * Math.PI / 180;
      const r = 48;
      const x = 50 + r * Math.cos(angle);
      const y = 50 + r * Math.sin(angle);
      return `<div class="zone-label" style="left:${x}%;top:${y}%">${z.emoji}<br><small>${z.name}</small></div>`;
    }).join('');
  },

  drawBackground() {
    const ctx = this.ctx;
    const w = this.canvas.getBoundingClientRect().width;
    const h = this.canvas.getBoundingClientRect().height;
    const cx = w * this.CIRCLE.cx / 100;
    const cy = h * this.CIRCLE.cy / 100;
    const r = w * this.CIRCLE.r / 100;

    ctx.clearRect(0, 0, w, h);

    // 円を描画
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.stroke();

    // セクション線（8分割）
    for (let i = 0; i < 8; i++) {
      const angle = (i * 45 - 90) * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 中心エリア
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = '#e2e8f040';
    ctx.fill();

    // ポイントと線を描画
    this.drawPoints();
  },

  drawPoints() {
    if (this.points.length === 0) return;

    const ctx = this.ctx;
    const w = this.canvas.getBoundingClientRect().width;
    const h = this.canvas.getBoundingClientRect().height;

    // 線を描画
    if (this.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(this.points[0].px * w / 100, this.points[0].py * h / 100);
      for (let i = 1; i < this.points.length; i++) {
        ctx.lineTo(this.points[i].px * w / 100, this.points[i].py * h / 100);
      }
      ctx.strokeStyle = '#6366f180';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ポイントを描画
    this.points.forEach((p, i) => {
      const x = p.px * w / 100;
      const y = p.py * h / 100;
      const t = i / Math.max(this.points.length - 1, 1);

      // グラデーション色（青→紫→ピンク）
      const r = Math.round(99 + t * 140);
      const g = Math.round(102 - t * 40);
      const b = Math.round(241 - t * 100);

      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // ラベル
      if (i === 0) {
        ctx.fillStyle = '#6366f1';
        ctx.font = '11px sans-serif';
        ctx.fillText('はじめ', x + 10, y - 5);
      }
      if (i === this.points.length - 1 && i > 0) {
        ctx.fillStyle = '#ec4899';
        ctx.font = '11px sans-serif';
        ctx.fillText('いま', x + 10, y - 5);
      }
    });
  },

  onTap(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX || event.pageX) - rect.left) / rect.width * 100;
    const y = ((event.clientY || event.pageY) - rect.top) / rect.height * 100;

    if (!this.isInsideCircle(x, y)) return;

    const zone = this.detectZone(x, y);
    this.points.push({ px: x, py: y, zone: zone.name, emoji: zone.emoji, order: this.points.length + 1 });

    this.drawBackground();
    this.updateSummary();

    document.getElementById('matrix-submit').disabled = false;
  },

  isInsideCircle(xPct, yPct) {
    const dx = xPct - this.CIRCLE.cx;
    const dy = yPct - this.CIRCLE.cy;
    return Math.sqrt(dx * dx + dy * dy) <= this.CIRCLE.r;
  },

  detectZone(xPct, yPct) {
    const dx = xPct - this.CIRCLE.cx;
    const dy = yPct - this.CIRCLE.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.CIRCLE.r * 0.25) {
      return { name: '中心', emoji: '🌍' };
    }

    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    for (const zone of this.ZONES) {
      let diff = Math.abs(angle - zone.center);
      if (diff > 180) diff = 360 - diff;
      if (diff <= 22.5) return zone;
    }
    return { name: '中心', emoji: '🌍' };
  },

  updateSummary() {
    const el = document.getElementById('matrix-summary');
    if (this.points.length === 0) {
      el.innerHTML = '';
      return;
    }

    const zones = this.points.map(p => p.emoji + p.zone);
    // 連続同一ゾーンを省略
    const sequence = [zones[0]];
    for (let i = 1; i < zones.length; i++) {
      if (zones[i] !== zones[i - 1]) sequence.push(zones[i]);
    }

    el.innerHTML = `
      <div class="summary-label">学びの軌跡:</div>
      <div class="summary-path">${sequence.join(' → ')}</div>
      <div class="summary-count">タップ数: ${this.points.length}</div>
    `;
  },

  undo() {
    if (this.points.length === 0) return;
    this.points.pop();
    this.drawBackground();
    this.updateSummary();
    if (this.points.length === 0) {
      document.getElementById('matrix-submit').disabled = true;
    }
  },

  reset() {
    this.points = [];
    this.drawBackground();
    this.updateSummary();
    document.getElementById('matrix-submit').disabled = true;
  },

  async submit() {
    if (this.points.length === 0) return;

    const btn = document.getElementById('matrix-submit');
    btn.disabled = true;
    btn.textContent = '送信中...';

    const startZone = this.points[0].zone;
    const endZone = this.points[this.points.length - 1].zone;
    const zoneSequence = this.getZoneSequence();
    const dominantZone = this.getDominantZone();

    const matrixData = {
      points: this.points,
      startZone, endZone, zoneSequence, dominantZone
    };

    let result;
    if (this.pendingReflection) {
      // 振り返り+マトリクス同時投稿
      const ref = this.pendingReflection;
      result = await API.submitReflectionWithMatrix(
        App.currentStudent.studentId,
        { subject: ref.subject, period: ref.period, content: ref.content },
        {
          matrixPoints: this.points,
          matrixStartZone: startZone,
          matrixEndZone: endZone,
          matrixZoneSequence: zoneSequence,
          matrixDominantZone: dominantZone
        }
      );
      this.pendingReflection = null;
    } else {
      const subject = document.getElementById('matrix-subject')?.value || '';
      const period = document.getElementById('matrix-period')?.value || '';
      result = await API.submitMatrix(App.currentStudent.studentId, {
        date: new Date().toISOString().split('T')[0],
        period, subject, ...matrixData
      });
    }

    if (result.success) {
      App.showSuccess('記録を保存しました！');
      setTimeout(() => App.showHome(), 1500);
    } else {
      App.showError(result.error || '保存に失敗しました');
      btn.disabled = false;
      btn.textContent = '📍 記録を保存';
    }
  },

  getZoneSequence() {
    const zones = this.points.map(p => p.zone);
    const seq = [zones[0]];
    for (let i = 1; i < zones.length; i++) {
      if (zones[i] !== zones[i - 1]) seq.push(zones[i]);
    }
    return seq.join('→');
  },

  getDominantZone() {
    const counts = {};
    for (const p of this.points) {
      counts[p.zone] = (counts[p.zone] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '中心';
  }
};
/**
 * 学びの冒険クエスト - スキルツリー・図鑑・マイページ
 */

// ========== スキルツリー ==========
const SkillTree = {
  async init() {
    const el = document.getElementById('screen-skill-tree');
    el.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" onclick="App.showHome(false)">← もどる</button>
        <h2>⚔️ スキルツリー</h2>
      </div>
      <div class="loading-inline">読み込み中...</div>
    `;

    const result = await API.getSkillTree(App.currentStudent.studentId);
    if (!result.success) {
      el.innerHTML += `<div class="error-msg">${result.error}</div>`;
      return;
    }

    const skills = result.skills;
    const maxLevel = 5;
    const allLv3 = skills.every(s => s.level >= 3);

    el.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" onclick="App.showHome(false)">← もどる</button>
        <h2>⚔️ スキルツリー</h2>
        <span class="skill-summary-inline">
          ${allLv3 ? '🏆 全型Lv.3達成！' : `Lv.3達成まで あと${skills.filter(s => s.level < 3).length}型`}
        </span>
      </div>

      <div class="skill-grid">
        ${skills.map(s => {
          const type = TYPES.getBySymbol(s.symbol);
          const pct = s.nextRequired ? (s.count / s.nextRequired * 100) : 100;
          const lvlNames = ['', '見習い', '使い手', '達人', '名人', '伝説'];
          return `
            <div class="skill-card" style="--skill-color: ${type?.color || '#666'}">
              <div class="skill-card-top">
                <span class="skill-card-symbol">${s.symbol}</span>
                <div>
                  <div class="skill-card-name">${s.name}</div>
                  <div class="skill-card-level">Lv.${s.level} ${lvlNames[s.level] || ''}</div>
                </div>
              </div>
              <div class="skill-bar"><div class="skill-bar-fill" style="width:${Math.min(pct,100)}%;background:var(--skill-color)"></div></div>
              <div class="skill-progress">${s.count}${s.nextRequired ? '/' + s.nextRequired : ' MAX'}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
};

// ========== コレクション図鑑 ==========
const Collection = {
  currentTab: 'weapons',

  async init() {
    const el = document.getElementById('screen-collection');
    el.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" onclick="App.showHome(false)">← もどる</button>
        <h2>📖 コレクション図鑑</h2>
      </div>
      <div class="loading-inline">読み込み中...</div>
    `;

    const result = await API.getCollection(App.currentStudent.studentId);
    if (!result.success) {
      el.innerHTML += `<div class="error-msg">${result.error}</div>`;
      return;
    }

    this.data = result;
    this.render();
  },

  render() {
    const el = document.getElementById('screen-collection');
    const { collection, stats } = this.data;

    el.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" onclick="App.showHome(false)">← もどる</button>
        <h2>📖 コレクション図鑑</h2>
      </div>

      <div class="collection-tabs">
        <button class="tab-btn ${this.currentTab === 'weapons' ? 'active' : ''}"
          onclick="Collection.switchTab('weapons')">
          🗡️ 武器・防具 <small>${stats.weaponsAcquired}/${stats.weaponsTotal}</small>
        </button>
        <button class="tab-btn ${this.currentTab === 'monsters' ? 'active' : ''}"
          onclick="Collection.switchTab('monsters')">
          🐉 モンスター <small>${stats.monstersAcquired}/${stats.monstersTotal}</small>
        </button>
        <button class="tab-btn ${this.currentTab === 'badges' ? 'active' : ''}"
          onclick="Collection.switchTab('badges')">
          🏅 バッジ <small>${stats.badgesAcquired}/${stats.badgesTotal}</small>
        </button>
      </div>

      <div class="collection-grid" id="collection-grid">
        ${this.renderItems(collection[this.currentTab])}
      </div>
    `;
  },

  renderItems(items) {
    if (!items || items.length === 0) return '<div class="empty-msg">まだアイテムはありません</div>';

    return items.map(item => {
      const stars = '⭐'.repeat(parseInt(item.rarity) || 1);
      return `
        <div class="collection-card ${item.acquired ? '' : 'locked'} rarity-${item.rarity}">
          <div class="card-image">
            ${item.acquired ? (item.imageUrl || this.getPlaceholder(item)) : '❓'}
          </div>
          <div class="card-name">${item.acquired ? item.name : '？？？'}</div>
          <div class="card-rarity">${stars}</div>
          ${item.isNew ? '<div class="card-new">NEW!</div>' : ''}
        </div>
      `;
    }).join('');
  },

  getPlaceholder(item) {
    const icons = {
      weapon: '⚔️', monster: '🐲', badge: '🏅'
    };
    return `<span class="placeholder-icon">${icons[item.type] || '📦'}</span>`;
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  }
};

// ========== マイページ ==========
const MyPage = {
  async init() {
    const el = document.getElementById('screen-mypage');
    const s = App.currentStudent;

    el.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" onclick="App.showHome(false)">← もどる</button>
        <h2>👤 マイページ</h2>
      </div>

      <div class="mypage-card">
        <div class="mypage-name">${App.escapeHtml(s.name)}</div>
        <div class="mypage-class">${s.classId} ${s.studentNumber}番</div>
        <div class="mypage-level">Lv.${s.level} 冒険者</div>
      </div>

      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${s.totalExp || 0}</div>
          <div class="stat-label">累計EXP</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${s.totalDiaryPosts || 0}</div>
          <div class="stat-label">日記</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${s.totalReflectionPosts || 0}</div>
          <div class="stat-label">振り返り</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">🔥 ${s.streakDays || 0}</div>
          <div class="stat-label">連続日数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">🎟️ ${s.reviveTickets || 0}</div>
          <div class="stat-label">復活チケット</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${(s.totalDiaryPosts || 0) + (s.totalReflectionPosts || 0)}</div>
          <div class="stat-label">合計投稿</div>
        </div>
      </div>

    `;
  }
};
/**
 * 学びの冒険クエスト - 今週の大分析
 * タブ切替: 日記一覧 / 振り返り+マトリクス集計 / 心マトリクス図一覧 / 週の振り返り
 */

const Weekly = {
  weekData: null,
  currentTab: 'diary',

  async init() {
    const el = document.getElementById('screen-weekly');
    el.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" onclick="App.showHome(false)">← もどる</button>
        <h2>📊 今週の大分析</h2>
      </div>
      <div class="loading-inline">今週のデータを読み込み中...</div>
    `;

    const result = await API.getWeeklyData(App.currentStudent.studentId);
    if (!result.success) {
      el.innerHTML += `<div style="color:red">${result.error}</div>`;
      return;
    }

    this.weekData = result;
    this.currentTab = 'diary';
    this.render();
  },

  render() {
    const el = document.getElementById('screen-weekly');
    const d = this.weekData;
    const days = ['日','月','火','水','木','金','土'];

    const startDate = new Date(d.weekStart + 'T00:00:00+09:00');
    const endDate = new Date(d.weekEnd + 'T00:00:00+09:00');
    const dateLabel = `${startDate.getMonth()+1}/${startDate.getDate()}(${days[startDate.getDay()]}) 〜 ${endDate.getMonth()+1}/${endDate.getDate()}(${days[endDate.getDay()]})`;

    // 型の集計
    const tc = d.stats.typeCounts || {};
    const typesSummary = Object.entries(tc).map(([sym, cnt]) => {
      const t = TYPES.getBySymbol(sym);
      return `<span style="color:${t?.color || '#666'}">${sym}${t?.name || ''} ×${cnt}</span>`;
    }).join('　') || 'まだなし';

    el.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" onclick="App.showHome(false)">← もどる</button>
        <h2>📊 今週の大分析</h2>
        <span class="weekly-date">${dateLabel}</span>
      </div>

      <!-- サマリー -->
      <div class="weekly-summary">
        <div class="ws-item"><div class="ws-num">${d.stats.diaryCount}</div><div class="ws-label">日記</div></div>
        <div class="ws-item"><div class="ws-num">${d.stats.reflectionCount}</div><div class="ws-label">振り返り</div></div>
        <div class="ws-item"><div class="ws-num">${d.stats.matrixCount}</div><div class="ws-label">マトリクス</div></div>
        <div class="ws-item"><div class="ws-num">${d.stats.totalExp}</div><div class="ws-label">獲得EXP</div></div>
      </div>

      <!-- タブ -->
      <div class="wk-tabs">
        <button class="wk-tab ${this.currentTab==='diary'?'active':''}" onclick="Weekly.switchTab('diary')">📝 日記</button>
        <button class="wk-tab ${this.currentTab==='ref'?'active':''}" onclick="Weekly.switchTab('ref')">🔄 振り返り</button>
        <button class="wk-tab ${this.currentTab==='matrix'?'active':''}" onclick="Weekly.switchTab('matrix')">🌍 マトリクス</button>
        <button class="wk-tab ${this.currentTab==='review'?'active':''}" onclick="Weekly.switchTab('review')">✍️ 週の振り返り</button>
      </div>

      <!-- タブコンテンツ -->
      <div class="wk-body" id="wk-body"></div>
    `;

    this.renderTab();
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.wk-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.wk-tab[onclick*="'${tab}'"]`)?.classList.add('active');
    this.renderTab();
  },

  renderTab() {
    const body = document.getElementById('wk-body');
    if (!body) return;
    switch (this.currentTab) {
      case 'diary': body.innerHTML = this.renderDiaryTab(); break;
      case 'ref': body.innerHTML = this.renderRefTab(); break;
      case 'matrix': body.innerHTML = this.renderMatrixTab(); setTimeout(() => this.drawMatrixCanvases(), 50); break;
      case 'review': body.innerHTML = this.renderReviewTab(); break;
    }
  },

  // ==================== 日記タブ ====================
  renderDiaryTab() {
    const d = this.weekData;
    const diaries = d.diaries || [];
    if (diaries.length === 0) return '<div class="wk-empty">今週の日記はまだありません</div>';

    const days = ['日','月','火','水','木','金','土'];
    return diaries.map(diary => {
      const dt = new Date((diary.createdAt || '').replace(' ', 'T'));
      const dateStr = !isNaN(dt) ? `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})` : '';
      return `
        <div class="wk-card wk-diary-card">
          <div class="wk-card-head">
            <span class="wk-card-date">${dateStr}</span>
            ${diary.gachaResult ? '<span class="wk-gacha">🎰 ' + this.esc(diary.gachaResult) + '</span>' : ''}
            <span class="wk-exp">+${diary.expEarned || 10} EXP</span>
          </div>
          <div class="wk-card-body">${this.esc(diary.content || '')}</div>
        </div>`;
    }).join('');
  },

  // ==================== 振り返りタブ ====================
  renderRefTab() {
    const d = this.weekData;
    const refs = d.reflections || [];
    const matrices = d.matrixRecords || [];
    if (refs.length === 0) return '<div class="wk-empty">今週の振り返りはまだありません</div>';

    // 教科別に集計
    const bySubject = {};
    for (const r of refs) {
      const sub = r.subject || 'その他';
      if (!bySubject[sub]) bySubject[sub] = { refs: [], types: {} };
      bySubject[sub].refs.push(r);
      const types = String(r.types || '').split(',').filter(Boolean);
      for (const t of types) bySubject[sub].types[t.trim()] = (bySubject[sub].types[t.trim()] || 0) + 1;
    }

    // マトリクスをreflectionIdで紐づけ
    const matByRef = {};
    for (const m of matrices) {
      if (m.reflectionId) matByRef[m.reflectionId] = m;
    }

    // 型の全体集計
    const tc = d.stats.typeCounts || {};
    const typesSummary = Object.entries(tc).map(([sym, cnt]) => {
      const t = TYPES.getBySymbol(sym);
      return `<span class="wk-type-badge" style="background:${t?.color || '#999'}20;color:${t?.color || '#666'};border:1px solid ${t?.color || '#ccc'}">${sym}${t?.name || ''} ×${cnt}</span>`;
    }).join(' ') || '';

    let html = '';
    // 全体集計バー
    html += `<div class="wk-ref-summary">
      <div class="wk-ref-summary-label">教科: ${d.stats.subjects.join(', ') || 'なし'}</div>
      <div class="wk-ref-summary-types">${typesSummary}</div>
    </div>`;

    const days = ['日','月','火','水','木','金','土'];

    // 教科ごとのセクション
    for (const [subject, data] of Object.entries(bySubject)) {
      const subTypes = Object.entries(data.types).map(([sym, cnt]) => {
        const t = TYPES.getBySymbol(sym);
        return `<span style="color:${t?.color || '#666'}">${sym}×${cnt}</span>`;
      }).join(' ');

      html += `<div class="wk-subject-section">
        <div class="wk-subject-head">
          <span class="wk-subject-name">${this.esc(subject)}</span>
          <span class="wk-subject-count">${data.refs.length}回</span>
          <span class="wk-subject-types">${subTypes}</span>
        </div>`;

      for (const r of data.refs) {
        const dt = new Date((r.createdAt || '').replace(' ', 'T'));
        const dateStr = !isNaN(dt) ? `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})` : '';
        const mat = matByRef[r.id];

        html += `<div class="wk-card wk-ref-card">
          <div class="wk-card-head">
            <span class="wk-card-date">${dateStr} ${r.period ? r.period + '時間目' : ''}</span>
            ${r.types ? '<span class="wk-card-types">' + r.types + '</span>' : ''}
            <span class="wk-exp">+${r.expEarned || 5} EXP</span>
          </div>
          ${r.plan ? '<div class="wk-card-plan">📋 ' + this.esc(r.plan) + '</div>' : ''}
          <div class="wk-card-body">${this.esc(r.content || '')}</div>
          ${mat ? '<div class="wk-card-matrix">🌍 ' + this.esc(mat.zoneSequence || mat.dominantZone || '') + '</div>' : ''}
        </div>`;
      }
      html += '</div>';
    }
    return html;
  },

  // ==================== マトリクスタブ ====================
  renderMatrixTab() {
    const d = this.weekData;
    const matrices = d.matrixRecords || [];
    if (matrices.length === 0) return '<div class="wk-empty">今週の心マトリクス記録はまだありません</div>';

    const days = ['日','月','火','水','木','金','土'];

    // ゾーン分布集計
    const zoneCounts = {};
    for (const m of matrices) {
      const z = m.dominantZone || m.endZone || '';
      if (z) zoneCounts[z] = (zoneCounts[z] || 0) + 1;
    }
    const zoneBar = Object.entries(zoneCounts).map(([z, c]) =>
      `<span class="wk-zone-chip">${z} ×${c}</span>`
    ).join(' ');

    let html = `<div class="wk-matrix-summary">
      <div class="wk-matrix-summary-label">ゾーン分布</div>
      <div class="wk-zone-chips">${zoneBar || 'データなし'}</div>
    </div>
    <div class="wk-matrix-grid">`;

    for (let i = 0; i < matrices.length; i++) {
      const m = matrices[i];
      const dt = new Date((m.createdAt || m.date || '').replace(' ', 'T'));
      const dateStr = !isNaN(dt) ? `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})` : '';
      const points = this.parseMatrixPoints(m.pointsJson);

      html += `<div class="wk-matrix-item">
        <div class="wk-matrix-item-head">
          <span>${dateStr} ${m.subject || ''}</span>
        </div>
        <div class="wk-matrix-fig">
          <img src="assets/heart-matrix.png" class="wk-matrix-img" draggable="false">
          <canvas class="wk-matrix-canvas" data-idx="${i}"></canvas>
        </div>
        <div class="wk-matrix-trail">${this.esc(m.zoneSequence || m.dominantZone || '')}</div>
      </div>`;
    }

    html += '</div>';
    return html;
  },

  parseMatrixPoints(json) {
    try {
      const arr = JSON.parse(json || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch(e) { return []; }
  },

  drawMatrixCanvases() {
    const matrices = this.weekData?.matrixRecords || [];
    document.querySelectorAll('.wk-matrix-canvas').forEach(canvas => {
      const idx = parseInt(canvas.dataset.idx);
      const m = matrices[idx];
      if (!m) return;
      const points = this.parseMatrixPoints(m.pointsJson);
      if (points.length === 0) return;

      const wrap = canvas.parentElement;
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width, h = rect.height;

      // 線
      if (points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(points[0].px * w / 100, points[0].py * h / 100);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].px * w / 100, points[i].py * h / 100);
        }
        ctx.strokeStyle = 'rgba(99,102,241,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // ポイント
      points.forEach((p, i) => {
        const x = p.px * w / 100;
        const y = p.py * h / 100;
        const t = i / Math.max(points.length - 1, 1);
        const r = Math.round(99 + t * 140);
        const g = Math.round(102 - t * 40);
        const b = Math.round(241 - t * 100);

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });
  },

  // ==================== 週の振り返りタブ ====================
  renderReviewTab() {
    const d = this.weekData;
    if (d.existingReview) {
      return `
        <div class="weekly-review-section">
          <div class="weekly-done">
            <div class="weekly-done-text">${this.esc(d.existingReview.content)}</div>
            <div class="weekly-done-badge">✅ 提出済み (+${d.existingReview.expEarned} EXP)</div>
          </div>
        </div>`;
    }
    return `
      <div class="weekly-review-section">
        <p class="wk-review-hint">今週がんばったこと、来週がんばりたいこと、気づいたことを書こう</p>
        <textarea id="weekly-content" class="ref-textarea" rows="4"
          placeholder="今週の振り返りを書いてね"></textarea>
        <button class="submit-btn" onclick="Weekly.submit()">📊 今週の振り返りを送信 (+5 EXP)</button>
      </div>`;
  },

  async submit() {
    const content = document.getElementById('weekly-content')?.value?.trim();
    if (!content) return App.showError('振り返りを入力してください');

    const d = this.weekData;
    const section = document.querySelector('.weekly-review-section');
    section.innerHTML = `
      <div class="weekly-done">
        <div class="weekly-done-text">${this.esc(content)}</div>
        <div class="weekly-done-badge">✅ 送信中...</div>
      </div>
    `;

    const result = await API.submitWeeklyReview(
      App.currentStudent.studentId, d.weekStart, d.weekEnd, content
    );

    if (result.success) {
      section.querySelector('.weekly-done-badge').textContent = `✅ 提出済み (+${result.expGained} EXP)`;
      d.existingReview = { content, expEarned: result.expGained };
      if (result.leveledUp) App.showLevelUpBanner(result.oldLevel, result.newLevel);
    } else {
      App.showError(result.error || '送信に失敗しました');
    }
  },

  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
};
