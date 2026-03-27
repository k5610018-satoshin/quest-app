/**
 * 学びの冒険クエスト - 振り返り+心マトリクス統合画面
 * PC最適化: 左に心マトリクス＋教科別の過去記録、右に振り返り入力
 */

const Reflection = {
  usedSymbols: new Set(),
  matrixPoints: [],
  canvas: null,
  ctx: null,
  CIRCLE: { cx: 50, cy: 50, r: 42 },
  pastRefs: null,
  pastMats: null,

  ZONES: [
    { name: '月', center: 0 },
    { name: '星', center: 45 },
    { name: '太陽', center: 90 },
    { name: '花畑', center: 135 },
    { name: '沼', center: 180 },
    { name: 'ブラックホール', center: 225 },
    { name: '曇', center: 270 },
    { name: '雷', center: 315 }
  ],

  init() {
    this.usedSymbols.clear();
    this.matrixPoints = [];
    this.pastRefs = null;
    this.pastMats = null;
    const el = document.getElementById('screen-reflection');

    el.innerHTML = `
      <div class="ref-layout">
        <!-- 左: 心マトリクス + 教科別の過去記録 -->
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
          <div class="ref-past-section" id="ref-past-section"></div>
        </div>

        <!-- 右: 振り返り入力 -->
        <div class="ref-right">
          <div class="ref-top-row">
            <button class="back-link" onclick="App.showHome(false)">← ホーム</button>
          </div>
          <div class="ref-chip-section">
            <div class="ref-chip-label">教科（えらんでね）</div>
            <div class="ref-chips" id="ref-subject-chips">
              ${CONFIG.subjects.map(s => `<button class="ref-chip" data-value="${s}" onclick="Reflection.selectSubject(this)">${s}</button>`).join('')}
            </div>
          </div>
          <div class="ref-chip-section">
            <div class="ref-chip-label">時間目</div>
            <div class="ref-chips" id="ref-period-chips">
              ${CONFIG.periods.map(p => `<button class="ref-chip" data-value="${p}" onclick="Reflection.selectPeriod(this)">${p.replace('時間目','')}</button>`).join('')}
            </div>
          </div>
          <input type="hidden" id="ref-subject" value="">
          <input type="hidden" id="ref-period" value="">

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
    this.autoSelectPeriod();
    // バックグラウンドで過去データを取得
    this.loadPastData();
  },

  async loadPastData() {
    const sid = App.currentStudent.studentId;
    const [refResult, matResult] = await Promise.all([
      API.getReflections(sid),
      API.getMatrixHistory(sid)
    ]);
    this.pastRefs = (refResult.success && refResult.reflections) ? refResult.reflections : [];
    this.pastMats = (matResult.success && matResult.records) ? matResult.records : [];
    // 教科が既に選択されていたら表示
    const subject = document.getElementById('ref-subject')?.value;
    if (subject) this.showPastForSubject(subject);
  },

  showPastForSubject(subject) {
    const section = document.getElementById('ref-past-section');
    if (!section) return;
    if (!this.pastRefs) {
      section.innerHTML = '<div class="loading-inline" style="font-size:0.8rem;">読み込み中...</div>';
      return;
    }

    const filtered = this.pastRefs.filter(r => r.subject === subject).slice().reverse();
    if (filtered.length === 0) {
      section.innerHTML = `<div class="ref-past-head">📖 ${App.escapeHtml(subject)} の過去の記録</div><div class="history-empty">まだありません</div>`;
      return;
    }

    const matByRef = {};
    for (const m of (this.pastMats || [])) { if (m.reflectionId) matByRef[m.reflectionId] = m; }

    const days = ['日','月','火','水','木','金','土'];
    const esc = s => { const el = document.createElement('div'); el.textContent = s; return el.innerHTML; };

    section.innerHTML = `<div class="ref-past-head">📖 ${esc(subject)} の過去の記録（${filtered.length}件）</div>` +
      filtered.slice(0, 10).map(r => {
        const dt = new Date((r.createdAt || '').replace(' ', 'T'));
        const dateStr = !isNaN(dt) ? `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})` : '';
        const mat = matByRef[r.id];

        return `<div class="history-card history-ref">
          <div class="history-card-head">
            <span class="history-date">${dateStr}</span>
            ${r.types ? '<span class="history-types">' + esc(r.types) + '</span>' : ''}
          </div>
          ${r.plan ? '<div class="history-plan">📋 ' + esc(r.plan) + '</div>' : ''}
          <div class="history-card-body">${esc(r.content || '')}</div>
          ${r.teacherComment ? '<div class="history-comment">💬 ' + esc(r.teacherComment) + '</div>' : ''}
          ${mat ? '<div class="history-matrix">🌍 ' + esc(mat.zoneSequence || mat.dominantZone || '') + '</div>' : ''}
        </div>`;
      }).join('');
  },

  autoSelectPeriod() {
    const now = new Date();
    const hhmm = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    let matchedPeriod = null;
    for (const pt of (CONFIG.periodTimes || [])) {
      if (hhmm >= pt.start && hhmm <= this.addMinutes(pt.end, 15)) {
        matchedPeriod = pt.period;
        break;
      }
    }
    if (matchedPeriod) {
      const btn = document.querySelector(`#ref-period-chips .ref-chip[data-value="${matchedPeriod}時間目"]`);
      if (btn) this.selectPeriod(btn);
    }
  },

  addMinutes(timeStr, min) {
    const [h, m] = timeStr.split(':').map(Number);
    const total = h * 60 + m + min;
    return ('0' + Math.floor(total / 60)).slice(-2) + ':' + ('0' + (total % 60)).slice(-2);
  },

  setupCanvas() {
    const wrap = document.querySelector('.matrix-wrap');
    if (!wrap) return;
    this.canvas = document.getElementById('matrix-canvas');
    this.ctx = this.canvas.getContext('2d');

    // 前回のresizeリスナーを解除してリークを防止
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }

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
    this._resizeHandler = resize;
    resize();
    window.addEventListener('resize', resize);

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
    if (Math.sqrt(dx * dx + dy * dy) < this.CIRCLE.r * 0.25) return { name: '地球' };
    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    for (const zone of this.ZONES) {
      let diff = Math.abs(angle - zone.center);
      if (diff > 180) diff = 360 - diff;
      if (diff <= 22.5) return zone;
    }
    return { name: '地球' };
  },

  drawPoints() {
    if (!this.ctx) return;
    const w = this.canvas.getBoundingClientRect().width;
    const h = this.canvas.getBoundingClientRect().height;
    this.ctx.clearRect(0, 0, w, h);
    if (this.matrixPoints.length === 0) return;

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

      this.ctx.font = 'bold 12px sans-serif';
      if (i === 0) { this.ctx.fillStyle = '#6366f1'; this.ctx.fillText('はじめ', x + 10, y - 5); }
      if (i === this.matrixPoints.length - 1 && i > 0) { this.ctx.fillStyle = '#ec4899'; this.ctx.fillText('いま', x + 10, y - 5); }
    });

    document.getElementById('matrix-count').textContent = 'タップ: ' + this.matrixPoints.length;
  },

  updateTrail() {
    const el = document.getElementById('matrix-trail');
    if (this.matrixPoints.length === 0) { el.innerHTML = ''; return; }
    const zones = this.matrixPoints.map(p => p.zone);
    const seq = [zones[0]];
    for (let i = 1; i < zones.length; i++) { if (zones[i] !== zones[i-1]) seq.push(zones[i]); }
    el.innerHTML = seq.join(' → ');
  },

  undoPoint() { if (this.matrixPoints.length === 0) return; this.matrixPoints.pop(); this.drawPoints(); this.updateTrail(); },
  resetPoints() { this.matrixPoints = []; this.drawPoints(); this.updateTrail(); },

  selectSubject(btn) {
    document.querySelectorAll('#ref-subject-chips .ref-chip').forEach(c => c.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('ref-subject').value = btn.dataset.value;
    this.showPastForSubject(btn.dataset.value);
  },

  selectPeriod(btn) {
    document.querySelectorAll('#ref-period-chips .ref-chip').forEach(c => c.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('ref-period').value = btn.dataset.value;
  },

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
    for (const type of TYPES.definitions) { if (text.includes(type.symbol)) this.usedSymbols.add(type.symbol); }
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

    const detectedTypes = TYPES.detect(content);
    let baseExp = detectedTypes.length <= 1 ? 3 : detectedTypes.length === 2 ? 5 : detectedTypes.length === 3 ? 8 : 12;
    if (plan && plan.length > 0) baseExp += 2;
    const hasMatrix = this.matrixPoints.length > 0;
    if (hasMatrix) baseExp += 3;
    const expGained = baseExp * (App.currentStudent.isMonday ? 2 : 1);

    this.showInstantResult(expGained, detectedTypes, hasMatrix);

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
      // エラー時: 結果オーバーレイを隠し、送信ボタンを復帰
      const area = document.getElementById('ref-result');
      if (area) area.style.display = 'none';
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
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || '地球';
  },

  showInstantResult(expGained, detectedTypes, hasMatrix) {
    const area = document.getElementById('ref-result');
    area.style.display = 'flex';
    area.innerHTML = `
      <div class="result-card">
        <div class="result-exp animate-pop">+${expGained} EXP${App.currentStudent.isMonday ? ' (月曜2倍！)' : ''}</div>
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
    if (exp && exp.leveledUp) html += `<div class="level-up">🎉 レベルアップ！ Lv.${exp.oldLevel} → Lv.${exp.newLevel}</div>`;
    if (skills.updatedTypes) {
      skills.updatedTypes.filter(u => u.level > u.oldLevel).forEach(u => {
        html += `<div>⬆️ ${TYPES.getBySymbol(u.symbol)?.name||u.symbol} Lv.${u.level}</div>`;
      });
    }
    extras.innerHTML = html;
  },

  goHome() {
    document.getElementById('ref-result').style.display = 'none';
    App.homeDiaries = null;
    App.homeRefs = null;
    const s = App.currentStudent;
    const oldLevel = s.level || 1;
    const content = document.getElementById('ref-content')?.value || '';
    const plan = document.getElementById('ref-plan')?.value || '';
    const types = TYPES.detect(content);
    let base = types.length <= 1 ? 3 : types.length === 2 ? 5 : types.length === 3 ? 8 : 12;
    if (plan.trim().length > 0) base += 2;
    if (this.matrixPoints.length > 0) base += 3;
    const gained = base * (s.isMonday ? 2 : 1);
    s.totalExp = (s.totalExp || 0) + gained;
    s.level = App.calcLevel(s.totalExp);
    s.totalReflectionPosts = (s.totalReflectionPosts || 0) + 1;
    s.totalPosts = (s.totalDiaryPosts || 0) + (s.totalReflectionPosts || 0);
    s.expToNext = App.calcExpToNext(s.totalExp);
    App.safeSetItem('quest_student_cache', JSON.stringify(s));
    App.renderHome(s);
    App.showScreen('home');
    if (s.level > oldLevel) App.showLevelUpBanner(oldLevel, s.level);
    API.getStudentByToken(localStorage.getItem('quest_access_token')).then(r => {
      if (r.success) {
        App.currentStudent = r.student;
        App.safeSetItem('quest_student_cache', JSON.stringify(r.student));
        App.renderHome(r.student);
      }
    });
  }
};
