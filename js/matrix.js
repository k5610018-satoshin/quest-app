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
