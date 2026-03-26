/**
 * 学びの冒険クエスト - メインアプリケーション
 * SPA画面遷移管理 + ホーム画面
 */

const App = {
  currentStudent: null,
  currentScreen: 'select',

  /**
   * アプリ初期化
   */
  async init() {
    // URLパラメータから出席番号を取得
    const params = new URLSearchParams(window.location.search);
    const studentNum = params.get('student');

    if (studentNum) {
      await this.loginByNumber(parseInt(studentNum));
    } else {
      this.showScreen('select');
    }
  },

  /**
   * 出席番号でログイン
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
   * ホーム画面を表示
   */
  async showHome() {
    this.showLoading('ステータスを読み込み中...');
    const result = await API.getStudentStatus(this.currentStudent.studentId);
    this.hideLoading();

    if (result.success) {
      this.currentStudent = { ...this.currentStudent, ...result.status };
      this.renderHome(result.status);
      this.showScreen('home');
    } else {
      this.showError('ステータスの取得に失敗しました');
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
          <span class="btn-label">振り返りを書く</span>
          <span class="btn-badge">+3〜12 EXP</span>
        </button>
        <button class="main-btn matrix-btn" onclick="App.showScreen('matrix')">
          <span class="btn-icon">🌍</span>
          <span class="btn-label">心マトリクス</span>
          <span class="btn-badge">+2 EXP</span>
        </button>
      </div>

      <div class="sub-buttons">
        <button class="sub-btn" onclick="App.showScreen('skill-tree')">
          <span>⚔️</span><span>スキルツリー</span>
        </button>
        <button class="sub-btn" onclick="App.showScreen('collection')">
          <span>📖</span><span>図鑑</span>
        </button>
        <button class="sub-btn" onclick="App.showScreen('mypage')">
          <span>👤</span><span>マイページ</span>
        </button>
      </div>

      ${status.recentNewItems.length > 0 ? `
        <div class="new-items-banner">
          <span>🎁 新しいアイテムが${status.recentNewItems.length}個！</span>
          <button onclick="App.showScreen('collection')">確認する</button>
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
  }
};

// EXPレベルテーブル（code.jsと同じ）
const LEVEL_THRESHOLDS = [0,10,30,50,80,120,170,230,300,380,470,570,680,800,930,1070,1220,1380,1550,1730,1920,2120,2330,2550,2780,3020,3270,3530,3800,4080,4370,4670,4980,5300,5630,5970,6320,6680,7050,7430,7820,8220,8630,9050,9480,9920,10370,10830,11300,11780];

// アプリ起動
document.addEventListener('DOMContentLoaded', () => App.init());
