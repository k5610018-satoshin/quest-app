/**
 * 学びの冒険クエスト - 日記入力画面
 * ★高速化: ガチャをクライアント側で即座実行→結果を先に表示→GAS保存はバックグラウンド
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
  init() {
    const el = document.getElementById('screen-diary');
    const s = App.currentStudent;
    const alreadyDone = s.diaryDoneToday;

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
          ${alreadyDone ? '📮 日記を追加する' : '📮 送信してガチャを引く！'}
        </button>
      </div>

      <div id="diary-result" class="result-area" style="display:none;"></div>
    `;

    document.getElementById('diary-content').addEventListener('input', (e) => {
      document.getElementById('diary-chars').textContent = e.target.value.length;
    });
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
      // 新アイテム通知をリセット（次回ホームで表示されるように）
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
    // GASからの正確な結果でストリーク・マイルストーン等を追記
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

  /** 投稿完了後のホーム遷移（キャッシュ更新で即遷移、API再取得はバックグラウンド） */
  goHome() {
    const s = App.currentStudent;
    const oldLevel = s.level || 1;
    // 楽観的にEXP・投稿数を更新
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
    // レベルアップしていたらバナー表示
    if (s.level > oldLevel) App.showLevelUpBanner(oldLevel, s.level);
    // バックグラウンドでAPI再取得（正確なデータに更新）
    API.getStudentByToken(localStorage.getItem('quest_access_token')).then(r => {
      if (r.success) {
        App.currentStudent = r.student;
        localStorage.setItem('quest_student_cache', JSON.stringify(r.student));
        App.renderHome(r.student);
      }
    });
  }
};
