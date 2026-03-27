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
      this.safeSetItem('quest_access_token', token);
      this.safeSetItem('quest_student_cache', JSON.stringify(result.student));
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
      this.showError('トークンが無効です。先生に確認してください。');
      localStorage.removeItem('quest_access_token');
      localStorage.removeItem('quest_student_cache');
      this.currentStudent = null;
      this.showScreen('select');
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
        this.safeSetItem('quest_student_cache', JSON.stringify(this.currentStudent));
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
      <div class="home-header-compact">
        <span class="player-name">${this.escapeHtml(status.name)}</span>
        <span class="player-level-inline">Lv.${status.level}</span>
        <div class="exp-bar-inline">
          <div class="exp-bar-fill" style="width: ${Math.min(expPercent, 100)}%"></div>
        </div>
        <span class="exp-label-inline">EXP ${status.totalExp}${status.expToNext > 0 ? ' / 次まで' + status.expToNext : ' MAX!'}</span>
        <span class="streak-badge-inline">🔥${status.streakDays}日</span>
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
          <button onclick="App.safeSetItem('quest_new_items_seen','1'); this.parentElement.remove(); App.showScreen('collection')">確認する</button>
          <button onclick="App.safeSetItem('quest_new_items_seen','1'); this.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:1.1rem;">✕</button>
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
      const gachaName = this.resolveGachaName(d.gachaResult);
      return `<div class="history-card history-diary">
        <div class="history-card-head">
          <span class="history-date">${dateStr}</span>
          ${gachaName ? '<span class="history-gacha">🎰 ' + this.escapeHtml(gachaName) + '</span>' : ''}
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
          ${r.types ? '<span class="history-types">' + this.escapeHtml(r.types) + '</span>' : ''}
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
          <div class="history-matrix">🌍 ${this.escapeHtml(this.convertZoneName(mat.zoneSequence || mat.dominantZone || ''))}</div>
        ` : (mat ? '<div class="history-matrix">🌍 ' + this.escapeHtml(this.convertZoneName(mat.zoneSequence || mat.dominantZone || '')) + '</div>' : '')}
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
      setTimeout(() => toast.classList.remove('active'), 5000);
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

  /** localStorage.setItem のQuotaExceeded安全ラッパー */
  safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // QuotaExceededError: 容量超過時はキャッシュを消して再試行
      console.warn('localStorage quota exceeded, clearing cache', e);
      try {
        localStorage.removeItem('quest_student_cache');
        localStorage.removeItem('quest_new_items_seen');
        localStorage.setItem(key, value);
      } catch (e2) {
        console.error('localStorage write failed after cleanup', e2);
      }
    }
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * ガチャ結果ID → モンスター名に変換
   * GASはgachaResultにモンスターID('mon_001')か'miss'を保存する。
   * 表示時にCLIENT_GACHAテーブルで名前に変換し、missは非表示にする。
   */
  resolveGachaName(gachaId) {
    if (!gachaId || gachaId === 'miss') return null;
    if (typeof CLIENT_GACHA !== 'undefined') {
      const mon = CLIENT_GACHA.find(m => m.id === gachaId);
      if (mon) return mon.name;
    }
    // IDがテーブルにない場合はそのまま返す（将来モンスター追加時のフォールバック）
    return gachaId;
  },

  /**
   * 旧ゾーン名 → 新ゾーン名に変換（既存データの互換用）
   */
  convertZoneName(name) {
    const map = {
      'パワーアップ': '月', 'グングン': '月',
      '学びが生まれる': '星', 'キラキラ': '星',
      '人も自分も笑顔': '太陽', 'ニコニコ': '太陽',
      'ダラダラ': '花畑', 'フワフワ': '花畑',
      'たいくつ・どんより': '沼',
      '不安・寂しい': 'ブラックホール', 'ドロドロ': 'ブラックホール',
      '人も自分もイヤな顔': '曇', 'モヤモヤ': '曇',
      'イライラ': '雷',
      '中心': '地球',
      // matrix.jsの旧名も対応
      'ドキドキ': '月', 'ウキウキ': '太陽', 'ホッコリ': '花畑', 'ジーン': '星'
    };
    if (!name) return name;
    // ゾーン遷移文字列（→区切り）も変換
    if (name.includes('→')) {
      return name.split('→').map(z => map[z.trim()] || z.trim()).join('→');
    }
    return map[name] || name;
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
