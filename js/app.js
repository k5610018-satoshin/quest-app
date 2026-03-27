/**
 * 学びの冒険クエスト - メインアプリケーション
 * SPA画面遷移管理 + ホーム画面
 */

const App = {
  currentStudent: null,
  currentScreen: 'select',

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
