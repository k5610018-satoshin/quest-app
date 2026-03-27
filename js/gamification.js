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
      </div>

      <div class="skill-list">
        ${skills.map(s => {
          const type = TYPES.getBySymbol(s.symbol);
          const pct = s.nextRequired ? (s.count / s.nextRequired * 100) : 100;
          const lvlNames = ['', '見習い', '使い手', '達人', '名人', '伝説'];
          return `
            <div class="skill-item">
              <div class="skill-header">
                <span class="skill-symbol" style="color: ${type?.color || '#666'}">${s.symbol}</span>
                <span class="skill-name">${s.name}</span>
                <span class="skill-level">Lv.${s.level} ${lvlNames[s.level] || ''}</span>
              </div>
              <div class="skill-bar">
                <div class="skill-bar-fill" style="width: ${Math.min(pct, 100)}%; background: ${type?.color || '#666'}"></div>
              </div>
              <div class="skill-progress">${s.count}${s.nextRequired ? '/' + s.nextRequired : ' (MAX)'}</div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="skill-summary">
        ${allLv3 ? '🏆 全型Lv.3達成！学びの守護神！' :
          `全型Lv.3達成まで：あと${skills.filter(s => s.level < 3).length}型！`}
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
