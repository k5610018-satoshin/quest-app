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
  subjects: ['国語','算数','理科','社会','体育','音楽','道徳','総合','図工','家庭科','外国語'],

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
      symbol: '！', name: 'わかった', color: '#f59e0b',
      meaning: '驚き・気づき',
      hint: '新しい発見、気持ちの変化',
      keywords: ['気づいた','変わった','びっくり','初めて','実は','最初は']
    },
    {
      symbol: '？', name: 'ギモン', color: '#8b5cf6',
      meaning: '問い・なぜ',
      hint: '疑問に思ったこと、さらに調べたいこと',
      keywords: ['なぜ','どうして','疑問','不思議','調べたい']
    },
    {
      symbol: '⭐', name: '成長', color: '#eab308',
      meaning: '自分の成長',
      hint: '前よりできるようになったこと',
      keywords: ['成長','前より','上手に','できるようになった','伸びた','自信']
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
          <span class="btn-badge">+3〜14 EXP</span>
        </button>
      </div>

      ${status.skillSummary && status.skillSummary.length > 0 ? `
      <div class="home-skills">
        <div class="home-skills-title">⚔️ スキルツリー</div>
        <div class="home-skills-grid">
          ${status.skillSummary.map(s => {
            const type = TYPES.definitions.find(t => t.symbol === s.symbol);
            const nextReq = s.level < 5 ? [1,5,15,30,50][s.level] : 50;
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

      <div class="sub-buttons">
        <button class="sub-btn" onclick="App.showScreen('collection')">
          <span>📖</span><span>図鑑</span>
        </button>
        <button class="sub-btn" onclick="App.showScreen('mypage')">
          <span>👤</span><span>マイページ</span>
        </button>
      </div>

      ${(status.newItemCount || (status.recentNewItems && status.recentNewItems.length)) ? `
        <div class="new-items-banner">
          <span>🎁 新しいアイテムが${status.newItemCount || status.recentNewItems.length}個！</span>
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
/**
 * 学びの冒険クエスト - 日記入力画面
 */

const Diary = {
  init() {
    const el = document.getElementById('screen-diary');
    el.innerHTML = `
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
          📮 送信してガチャを引く！
        </button>
      </div>

      <div id="diary-result" class="result-area" style="display:none;"></div>
    `;

    // 文字数カウント
    document.getElementById('diary-content').addEventListener('input', (e) => {
      document.getElementById('diary-chars').textContent = e.target.value.length;
    });
  },

  async submit() {
    const content = document.getElementById('diary-content').value.trim();
    if (!content) {
      App.showError('日記の内容を入力してください');
      return;
    }

    const btn = document.getElementById('diary-submit');
    btn.disabled = true;
    btn.textContent = '送信中...';

    const result = await API.submitDiary(App.currentStudent.studentId, content);

    if (result.success) {
      this.showResult(result);
    } else {
      App.showError(result.error || '送信に失敗しました');
      btn.disabled = false;
      btn.textContent = '📮 送信してガチャを引く！';
    }
  },

  showResult(result) {
    const area = document.getElementById('diary-result');
    area.style.display = 'block';

    // 送信フォームを隠す
    document.querySelector('.diary-form').style.display = 'none';

    const exp = result.exp;
    const gacha = result.gacha;
    const streak = result.streak;

    let html = `
      <div class="result-exp animate-pop">
        <div class="exp-gain">+${exp.expGained} EXP${exp.isMonday ? ' (月曜2倍！)' : ''}</div>
        ${exp.leveledUp ? `<div class="level-up">🎉 レベルアップ！ Lv.${exp.oldLevel} → Lv.${exp.newLevel}</div>` : ''}
      </div>

      <div class="result-streak">
        🔥 連続 ${streak.streakDays} 日${streak.reviveUsed ? ' (復活チケット使用！)' : ''}
        ${streak.newRewards.length > 0 ? '<br>🏆 ' + streak.newRewards.map(r => r.name).join(', ') + ' 獲得！' : ''}
      </div>
    `;

    // ガチャ結果
    if (result.isFirstToday) {
      if (gacha.item) {
        const stars = '⭐'.repeat(gacha.item.rarity);
        html += `
          <div class="gacha-result animate-gacha">
            <div class="gacha-card rarity-${gacha.item.rarity}">
              <div class="gacha-stars">${stars}</div>
              <div class="gacha-name">${gacha.item.name}</div>
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
    } else {
      html += `<div class="gacha-info">（今日は2回目なのでガチャはなし）</div>`;
    }

    // マイルストーン報酬
    if (result.milestones && result.milestones.length > 0) {
      html += `
        <div class="milestone-result">
          🗡️ マイルストーン達成！
          ${result.milestones.map(m => `<div class="milestone-item">${m.name} を手に入れた！</div>`).join('')}
        </div>
      `;
    }

    html += `
      <button class="return-btn" onclick="App.showHome()">
        🏠 ホームにもどる
      </button>
    `;

    area.innerHTML = html;
  }
};
/**
 * 学びの冒険クエスト - 振り返り+心マトリクス統合画面
 * PC最適化: 左に心マトリクス、右に振り返り入力
 */

const Reflection = {
  usedSymbols: new Set(),
  // マトリクスデータ
  matrixPoints: [],
  canvas: null,
  ctx: null,
  CIRCLE: { cx: 50, cy: 50, r: 42 },

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
    const el = document.getElementById('screen-reflection');

    el.innerHTML = `
      <div class="ref-layout">
        <!-- 左: 心マトリクス -->
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
        </div>

        <!-- 右: 振り返り入力 -->
        <div class="ref-right">
          <div class="ref-top-row">
            <select id="ref-subject" class="sel-sm">
              <option value="">教科</option>
              ${CONFIG.subjects.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
            <select id="ref-period" class="sel-sm">
              <option value="">時間目</option>
              ${CONFIG.periods.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
            <button class="back-link" onclick="App.showHome(false)">← ホーム</button>
          </div>

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

    // タップ / クリック
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

    // 線
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

    // ポイント
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

      // ラベル
      this.ctx.font = 'bold 12px sans-serif';
      if (i === 0) {
        this.ctx.fillStyle = '#6366f1';
        this.ctx.fillText('はじめ', x + 10, y - 5);
      }
      if (i === this.matrixPoints.length - 1 && i > 0) {
        this.ctx.fillStyle = '#ec4899';
        this.ctx.fillText('いま', x + 10, y - 5);
      }
    });

    document.getElementById('matrix-count').textContent = 'タップ: ' + this.matrixPoints.length;
  },

  updateTrail() {
    const el = document.getElementById('matrix-trail');
    if (this.matrixPoints.length === 0) { el.innerHTML = ''; return; }
    const zones = this.matrixPoints.map(p => p.zone);
    const seq = [zones[0]];
    for (let i = 1; i < zones.length; i++) {
      if (zones[i] !== zones[i - 1]) seq.push(zones[i]);
    }
    el.innerHTML = seq.join(' → ');
  },

  undoPoint() {
    if (this.matrixPoints.length === 0) return;
    this.matrixPoints.pop();
    this.drawPoints();
    this.updateTrail();
  },

  resetPoints() {
    this.matrixPoints = [];
    this.drawPoints();
    this.updateTrail();
  },

  // === 7つの型 ===
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
    for (const type of TYPES.definitions) {
      if (text.includes(type.symbol)) this.usedSymbols.add(type.symbol);
    }
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

  // === 送信 ===
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

    let result;
    if (this.matrixPoints.length > 0) {
      // 振り返り+マトリクス同時投稿
      const startZone = this.matrixPoints[0].zone;
      const endZone = this.matrixPoints[this.matrixPoints.length - 1].zone;
      const zoneSeq = this.getZoneSequence();
      const dominant = this.getDominantZone();

      result = await API.submitReflectionWithMatrix(
        App.currentStudent.studentId,
        { subject, period, plan, content },
        { matrixPoints: this.matrixPoints, matrixStartZone: startZone, matrixEndZone: endZone, matrixZoneSequence: zoneSeq, matrixDominantZone: dominant }
      );
    } else {
      result = await API.submitReflection(App.currentStudent.studentId, subject, period, plan, content);
    }

    if (result.success) {
      this.showResult(result);
    } else {
      App.showError(result.error || '送信に失敗しました');
      btn.disabled = false;
      btn.textContent = '✏️ 振り返り＋マトリクスを送信';
    }
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

  showResult(result) {
    const area = document.getElementById('ref-result');
    area.style.display = 'flex';

    const r = result.reflection || result;
    const exp = r.exp || result.exp;
    const types = r.detectedTypes || result.detectedTypes || [];
    const skills = r.skills || result.skills || { updatedTypes: [], newBadges: [] };

    area.innerHTML = `
      <div class="result-card">
        <div class="result-exp animate-pop">
          +${exp.expGained} EXP${exp.isMonday ? ' (月曜2倍！)' : ''}
          ${exp.leveledUp ? '<br>🎉 Lv.' + exp.oldLevel + ' → Lv.' + exp.newLevel : ''}
        </div>
        ${types.length > 0 ? `<div class="result-types-line">${types.map(s => { const t = TYPES.getBySymbol(s); return `<span style="color:${t?.color||'#666'}">${s}${t?.name||''}</span>`; }).join(' ')}</div>` : ''}
        ${skills.updatedTypes.filter(u => u.level > u.oldLevel).map(u => `<div>⬆️ ${TYPES.getBySymbol(u.symbol)?.name||u.symbol} Lv.${u.level}</div>`).join('')}
        ${this.matrixPoints.length > 0 ? `<div>🌍 マトリクス記録済み（${this.matrixPoints.length}ポイント）</div>` : ''}
        <button class="return-btn" onclick="document.getElementById('ref-result').style.display='none'; App.showHome()">🏠 ホームにもどる</button>
      </div>
    `;
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
