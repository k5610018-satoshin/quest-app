/**
 * 学びの冒険クエスト - 振り返り入力画面（7つの型ツールバー付き）
 */

const Reflection = {
  usedSymbols: new Set(),

  init() {
    this.usedSymbols.clear();
    const el = document.getElementById('screen-reflection');
    el.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" onclick="App.showHome()">← もどる</button>
        <h2>🔄 振り返りを書く</h2>
      </div>

      <div class="reflection-form">
        <!-- 教科・時間目選択 -->
        <div class="select-row">
          <select id="ref-subject" class="select-input">
            <option value="">教科を選ぶ</option>
            ${CONFIG.subjects.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
          <select id="ref-period" class="select-input">
            <option value="">時間目</option>
            ${CONFIG.periods.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>

        <!-- 7つの型ツールバー -->
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

        <!-- テキストエリア -->
        <textarea id="ref-content" class="text-input" rows="8"
          oninput="Reflection.onInput()"
          placeholder="記号をタップ → 振り返りを書こう

＋ 分数のたし算のやり方がわかった
− 通分するときの計算をまちがえた
→ 次はひき算にもチャレンジしたい
！ 分数も小数と同じように足せるんだ
？ 分母が3つあるときはどうするんだろう
⭐ 前よりスラスラ計算できるようになった
☀️ ○○さんの図を使った説明がわかりやすかった"></textarea>

        <!-- 検出された型 -->
        <div class="detected-types" id="detected-types"></div>

        <!-- マトリクスも記録するオプション -->
        <label class="checkbox-label">
          <input type="checkbox" id="ref-with-matrix">
          心マトリクスも同時に記録する
        </label>

        <!-- 送信ボタン -->
        <button id="ref-submit" class="submit-btn" onclick="Reflection.submit()">
          ✏️ 振り返りを送信
        </button>
      </div>

      <div id="ref-result" class="result-area" style="display:none;"></div>
    `;
  },

  /**
   * 型の記号をテキストに挿入
   */
  insertType(symbol) {
    if (this.usedSymbols.has(symbol)) return;

    const textarea = document.getElementById('ref-content');
    const pos = textarea.selectionStart;
    const text = textarea.value;

    // 改行+記号+スペースを挿入
    const insert = (pos > 0 && text[pos - 1] !== '\n' ? '\n' : '') + symbol + ' ';
    textarea.value = text.substring(0, pos) + insert + text.substring(pos);
    textarea.selectionStart = textarea.selectionEnd = pos + insert.length;
    textarea.focus();

    this.usedSymbols.add(symbol);
    this.updateToolbar();
    this.updateDetectedTypes();
  },

  /**
   * テキスト入力時の処理
   */
  onInput() {
    // テキストから使用中の記号を検出
    const text = document.getElementById('ref-content').value;
    this.usedSymbols.clear();
    for (const type of TYPES.definitions) {
      if (text.includes(type.symbol)) {
        this.usedSymbols.add(type.symbol);
      }
    }
    this.updateToolbar();
    this.updateDetectedTypes();
  },

  /**
   * ツールバーのボタン状態を更新
   */
  updateToolbar() {
    document.querySelectorAll('.type-btn').forEach(btn => {
      const symbol = btn.dataset.symbol;
      if (this.usedSymbols.has(symbol)) {
        btn.classList.add('used');
      } else {
        btn.classList.remove('used');
      }
    });
  },

  /**
   * 検出された型を表示
   */
  updateDetectedTypes() {
    const text = document.getElementById('ref-content').value;
    const detected = TYPES.detect(text);
    const el = document.getElementById('detected-types');

    if (detected.length === 0) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = detected.map(symbol => {
      const type = TYPES.getBySymbol(symbol);
      return `<span class="type-tag" style="background: ${type.color}20; color: ${type.color}; border: 1px solid ${type.color}">${symbol} ${type.name}</span>`;
    }).join('');
  },

  /**
   * 振り返り送信
   */
  async submit() {
    const subject = document.getElementById('ref-subject').value;
    const period = document.getElementById('ref-period').value;
    const content = document.getElementById('ref-content').value.trim();
    const withMatrix = document.getElementById('ref-with-matrix').checked;

    if (!subject) {
      App.showError('教科を選択してください');
      return;
    }
    if (!content) {
      App.showError('振り返りの内容を入力してください');
      return;
    }

    if (withMatrix) {
      // マトリクス画面に遷移（振り返りデータを保持）
      Matrix.pendingReflection = { subject, period, content };
      App.showScreen('matrix');
      return;
    }

    const btn = document.getElementById('ref-submit');
    btn.disabled = true;
    btn.textContent = '送信中...';

    const result = await API.submitReflection(
      App.currentStudent.studentId, subject, period, content
    );

    if (result.success) {
      this.showResult(result);
    } else {
      App.showError(result.error || '送信に失敗しました');
      btn.disabled = false;
      btn.textContent = '✏️ 振り返りを送信';
    }
  },

  showResult(result) {
    const area = document.getElementById('ref-result');
    area.style.display = 'block';
    document.querySelector('.reflection-form').style.display = 'none';

    const exp = result.exp;
    const types = result.detectedTypes || [];
    const skills = result.skills || { updatedTypes: [], newBadges: [] };

    let html = `
      <div class="result-exp animate-pop">
        <div class="exp-gain">+${exp.expGained} EXP${exp.isMonday ? ' (月曜2倍！)' : ''}</div>
        ${exp.leveledUp ? `<div class="level-up">🎉 レベルアップ！ Lv.${exp.oldLevel} → Lv.${exp.newLevel}</div>` : ''}
      </div>
    `;

    // 検出された型
    if (types.length > 0) {
      html += `
        <div class="result-types">
          <div class="result-types-label">検出された型:</div>
          ${types.map(s => {
            const t = TYPES.getBySymbol(s);
            return `<span class="type-tag" style="background: ${t.color}20; color: ${t.color}">${s} ${t.name}</span>`;
          }).join('')}
        </div>
      `;
    }

    // スキルツリー更新
    if (skills.updatedTypes.length > 0) {
      html += `<div class="result-skills">`;
      for (const ut of skills.updatedTypes) {
        const t = TYPES.getBySymbol(ut.symbol);
        if (ut.level > ut.oldLevel) {
          html += `<div class="skill-up">⬆️ ${t?.name || ut.symbol} が Lv.${ut.level} になった！</div>`;
        }
      }
      html += `</div>`;
    }

    // バッジ獲得
    if (skills.newBadges.length > 0) {
      html += `<div class="badge-result">🏅 新しいバッジを獲得！</div>`;
    }

    html += `
      <button class="return-btn" onclick="App.showHome()">🏠 ホームにもどる</button>
    `;

    area.innerHTML = html;
  }
};
