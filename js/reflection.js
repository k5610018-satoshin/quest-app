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

    // ★即座にクライアント側で結果を予測して表示
    const detectedTypes = TYPES.detect(content);
    let baseExp = detectedTypes.length <= 1 ? 3 : detectedTypes.length === 2 ? 5 : detectedTypes.length === 3 ? 8 : 12;
    if (plan && plan.length > 0) baseExp += 1; // 計画ボーナス
    const hasMatrix = this.matrixPoints.length > 0;
    if (hasMatrix) baseExp += 3; // マトリクスボーナス
    const expGained = baseExp * (App.currentStudent.isMonday ? 2 : 1);

    // 即座に結果を表示（API応答を待たない）
    this.showInstantResult(expGained, detectedTypes, hasMatrix);

    // バックグラウンドでGASに保存
    let result;
    if (hasMatrix) {
      const startZone = this.matrixPoints[0].zone;
      const endZone = this.matrixPoints[this.matrixPoints.length - 1].zone;
      result = await API.submitReflectionWithMatrix(
        App.currentStudent.studentId,
        { subject, period, plan, content },
        { matrixPoints: this.matrixPoints, matrixStartZone: startZone, matrixEndZone: endZone, matrixZoneSequence: this.getZoneSequence(), matrixDominantZone: this.getDominantZone() }
      );
    } else {
      result = await API.submitReflection(App.currentStudent.studentId, subject, period, plan, content);
    }

    if (result.success) {
      this.updateWithServerResult(result);
    } else {
      App.showError('保存エラー: ' + (result.error || ''));
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

  showInstantResult(expGained, detectedTypes, hasMatrix) {
    const area = document.getElementById('ref-result');
    area.style.display = 'flex';

    area.innerHTML = `
      <div class="result-card">
        <div class="result-exp animate-pop">
          +${expGained} EXP${App.currentStudent.isMonday ? ' (月曜2倍！)' : ''}
        </div>
        ${detectedTypes.length > 0 ? `<div class="result-types-line">${detectedTypes.map(s => { const t = TYPES.getBySymbol(s); return '<span style="color:' + (t?.color||'#666') + '">' + s + ' ' + (t?.name||'') + '</span>'; }).join(' ')}</div>` : ''}
        ${hasMatrix ? '<div>🌍 マトリクス記録中...</div>' : ''}
        <div id="ref-server-extras"></div>
        <button class="return-btn" onclick="Reflection.goHome()">🏠 ホームにもどる</button>
      </div>
    `;
  },

  updateWithServerResult(result) {
    const extras = document.getElementById('ref-server-extras');
    if (!extras) return;
    let html = '';
    const r = result.reflection || result;
    const exp = r.exp || result.exp;
    const skills = r.skills || result.skills || { updatedTypes: [], newBadges: [] };
    if (exp && exp.leveledUp) {
      html += `<div class="level-up">🎉 レベルアップ！ Lv.${exp.oldLevel} → Lv.${exp.newLevel}</div>`;
    }
    if (skills.updatedTypes) {
      skills.updatedTypes.filter(u => u.level > u.oldLevel).forEach(u => {
        html += `<div>⬆️ ${TYPES.getBySymbol(u.symbol)?.name||u.symbol} Lv.${u.level}</div>`;
      });
    }
    extras.innerHTML = html;
  },

  showResult(result) {
    this.showInstantResult(0, [], false);
    this.updateWithServerResult(result);
  },

  goHome() {
    document.getElementById('ref-result').style.display = 'none';
    const s = App.currentStudent;
    s.totalReflectionPosts = (s.totalReflectionPosts || 0) + 1;
    s.totalPosts = (s.totalDiaryPosts || 0) + (s.totalReflectionPosts || 0);
    localStorage.setItem('quest_student_cache', JSON.stringify(s));
    App.renderHome(s);
    App.showScreen('home');
    API.getStudentByToken(localStorage.getItem('quest_access_token')).then(r => {
      if (r.success) {
        App.currentStudent = r.student;
        localStorage.setItem('quest_student_cache', JSON.stringify(r.student));
        App.renderHome(r.student);
      }
    });
  }
};
