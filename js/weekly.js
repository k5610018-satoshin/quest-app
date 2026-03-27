/**
 * 学びの冒険クエスト - 今週の大分析
 * 1週間の日記・振り返り・心マトリクスを一覧＋週の振り返り入力
 */

const Weekly = {
  weekData: null,

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
    this.render();
  },

  render() {
    const el = document.getElementById('screen-weekly');
    const d = this.weekData;
    const days = ['日','月','火','水','木','金','土'];

    // 日付をフォーマット
    const startDate = new Date(d.weekStart + 'T00:00:00+09:00');
    const endDate = new Date(d.weekEnd + 'T00:00:00+09:00');
    const dateLabel = `${startDate.getMonth()+1}/${startDate.getDate()}(${days[startDate.getDay()]}) 〜 ${endDate.getMonth()+1}/${endDate.getDate()}(${days[endDate.getDay()]})`;

    // 日ごとにグループ化
    const byDay = {};
    for (let i = 0; i < 7; i++) {
      const dt = new Date(startDate.getTime() + i * 86400000);
      const key = dt.toISOString().slice(0, 10);
      const dow = dt.getDay();
      if (dow === 0 || dow === 6) continue; // 土日スキップ
      byDay[key] = {
        label: `${dt.getMonth()+1}/${dt.getDate()}(${days[dow]})`,
        diaries: [],
        reflections: [],
        matrices: []
      };
    }

    // データを日ごとに振り分け
    for (const diary of d.diaries) {
      const dt = (diary.createdAt || '').substring(0, 10);
      if (byDay[dt]) byDay[dt].diaries.push(diary);
    }
    for (const ref of d.reflections) {
      const dt = (ref.createdAt || '').substring(0, 10);
      if (byDay[dt]) byDay[dt].reflections.push(ref);
    }
    for (const mat of d.matrixRecords) {
      const dt = mat.date || (mat.createdAt || '').substring(0, 10);
      if (byDay[dt]) byDay[dt].matrices.push(mat);
    }

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

      <!-- サマリーカード -->
      <div class="weekly-summary">
        <div class="ws-item"><div class="ws-num">${d.stats.diaryCount}</div><div class="ws-label">日記</div></div>
        <div class="ws-item"><div class="ws-num">${d.stats.reflectionCount}</div><div class="ws-label">振り返り</div></div>
        <div class="ws-item"><div class="ws-num">${d.stats.matrixCount}</div><div class="ws-label">マトリクス</div></div>
        <div class="ws-item"><div class="ws-num">${d.stats.totalExp}</div><div class="ws-label">獲得EXP</div></div>
        <div class="ws-item ws-wide"><div class="ws-label">教科: ${d.stats.subjects.join(', ') || 'なし'}</div></div>
        <div class="ws-item ws-wide"><div class="ws-label">型: ${typesSummary}</div></div>
      </div>

      <!-- 日ごとのタイムライン -->
      <div class="weekly-timeline">
        ${Object.entries(byDay).map(([date, day]) => `
          <div class="wt-day ${day.diaries.length + day.reflections.length === 0 ? 'wt-empty' : ''}">
            <div class="wt-date">${day.label}</div>
            <div class="wt-content">
              ${day.diaries.map(d => `<div class="wt-entry wt-diary">📝 ${this.esc((d.content||'').substring(0, 80))}${(d.content||'').length > 80 ? '…' : ''}</div>`).join('')}
              ${day.reflections.map(r => `<div class="wt-entry wt-ref">🔄 <b>${r.subject||''}</b> ${r.plan ? '【計画】' + this.esc(r.plan) + ' ' : ''}${r.types ? '<span class="wt-types">' + r.types + '</span> ' : ''}${this.esc((r.content||'').substring(0, 60))}${(r.content||'').length > 60 ? '…' : ''}</div>`).join('')}
              ${day.matrices.map(m => `<div class="wt-entry wt-matrix">🌍 ${m.zoneSequence || m.dominantZone || '記録あり'}</div>`).join('')}
              ${day.diaries.length + day.reflections.length + day.matrices.length === 0 ? '<div class="wt-none">記録なし</div>' : ''}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- 週の振り返り入力 -->
      <div class="weekly-review-section">
        <h3>✍️ 今週をふりかえって</h3>
        ${d.existingReview ? `
          <div class="weekly-done">
            <div class="weekly-done-text">${this.esc(d.existingReview.content)}</div>
            <div class="weekly-done-badge">✅ 提出済み (+${d.existingReview.expEarned} EXP)</div>
          </div>
        ` : `
          <textarea id="weekly-content" class="ref-textarea" rows="3"
            placeholder="今週がんばったこと、来週がんばりたいこと、気づいたことを書こう"></textarea>
          <button class="submit-btn" onclick="Weekly.submit()">📊 今週の振り返りを送信 (+5 EXP)</button>
        `}
      </div>
    `;
  },

  async submit() {
    const content = document.getElementById('weekly-content')?.value?.trim();
    if (!content) return App.showError('振り返りを入力してください');

    const d = this.weekData;
    // 即座に結果表示
    const section = document.querySelector('.weekly-review-section');
    section.innerHTML = `
      <h3>✍️ 今週をふりかえって</h3>
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
      if (result.leveledUp) App.showLevelUpBanner(result.oldLevel, result.newLevel);
    } else {
      App.showError(result.error || '送信に失敗しました');
    }
  },

  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
};
