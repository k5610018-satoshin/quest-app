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
