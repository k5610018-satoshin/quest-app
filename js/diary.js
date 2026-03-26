/**
 * 学びの冒険クエスト - 日記入力画面
 */

const Diary = {
  init() {
    const el = document.getElementById('screen-diary');
    el.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" onclick="App.showHome()">← もどる</button>
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
