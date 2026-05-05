'use strict';
/* ==========================================================================
 * ai-insights.js — 簡易AIインサイト（クライアント側のみ）
 *
 * 機能:
 *  - 観察候補予測: 「次に誰を観察すべきか」を、未観察日数+観察シーン偏り から提案
 *  - ほめ記録の簡易キーワード分類: 単語頻度ベースでパターン分類
 *  - 「気になる傾向」: 急に観察が減った/増えた児童の検出
 *
 * 起動: 学級概況タブ末尾に「🤖 AIインサイト」セクション
 * ========================================================================== */

(function() {

function _esc(s) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _name(id) {
  const s = (window.state && window.state.students || []).find(x => x.id === id);
  return s ? s.name : '?';
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function daysSince(dateStr) {
  if (!dateStr) return 999;
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.floor((t - d) / 86400000);
}

// ===== 観察候補予測 =====
function predictObservationTargets() {
  const recs = window.state.records || [];
  const studs = window.state.students || [];
  if (studs.length === 0 || recs.length === 0) return [];

  // 各児童の最終観察日と観察シーン分布
  const lastSeen = new Map();
  const sceneCounts = new Map();  // id -> {scene: count}
  for (const r of recs) {
    const ids = [r.subject, ...(r.members || [])];
    for (const id of ids) {
      if (!lastSeen.has(id) || lastSeen.get(id) < r.date) lastSeen.set(id, r.date);
      if (!sceneCounts.has(id)) sceneCounts.set(id, {});
      sceneCounts.get(id)[r.scene] = (sceneCounts.get(id)[r.scene] || 0) + 1;
    }
  }

  // 全体のシーン分布（観察できる時間帯の重み）
  const globalScenes = {};
  for (const r of recs) {
    globalScenes[r.scene] = (globalScenes[r.scene] || 0) + 1;
  }

  const candidates = studs.map(s => {
    const days = daysSince(lastSeen.get(s.id));
    const myScenes = sceneCounts.get(s.id) || {};
    // 推奨シーン: 全体ではよく記録されるが、その児童ではまだ少ないシーン
    const recommendedScenes = Object.entries(globalScenes)
      .map(([sc, gCount]) => ({
        scene: sc,
        gCount,
        myCount: myScenes[sc] || 0,
        score: gCount / (1 + (myScenes[sc] || 0))
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(x => x.scene);

    const priority =
      (days >= 7 ? 100 : days >= 5 ? 50 : days >= 3 ? 20 : 0) +
      (s.watch ? 30 : 0) +
      (s.highlight ? 10 : 0);

    return { id: s.id, name: s.name, days, recommendedScenes, priority, isWatch: s.watch, isHighlight: s.highlight };
  });

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.filter(c => c.priority > 0).slice(0, 8);
}

// ===== 急変児童検出 =====
function detectAnomalies() {
  const recs = window.state.records || [];
  const studs = window.state.students || [];
  if (recs.length < 20) return [];

  // 直近7日 vs その前14日 の比較
  const today = new Date();
  const day = (offset) => {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const recent7 = day(7);
  const prev21 = day(21);

  const recentCounts = new Map();
  const prevCounts = new Map();
  for (const r of recs) {
    const ids = new Set([r.subject, ...(r.members || [])]);
    if (r.date >= recent7) {
      for (const id of ids) recentCounts.set(id, (recentCounts.get(id) || 0) + 1);
    } else if (r.date >= prev21) {
      for (const id of ids) prevCounts.set(id, (prevCounts.get(id) || 0) + 1);
    }
  }

  const anomalies = [];
  for (const s of studs) {
    const r = recentCounts.get(s.id) || 0;
    const p = prevCounts.get(s.id) || 0;
    const prevAvg = p / 2;  // 14日 → 7日換算
    if (prevAvg < 0.5 && r === 0) continue;  // データ少なすぎ
    if (prevAvg > 0 && r === 0) {
      anomalies.push({ id: s.id, name: s.name, type: 'drop', prev: prevAvg.toFixed(1), recent: 0, msg: '直近7日で観察ゼロ（前14日 ' + prevAvg.toFixed(1) + '回/週）' });
    } else if (prevAvg > 0 && r >= prevAvg * 2.5) {
      anomalies.push({ id: s.id, name: s.name, type: 'spike', prev: prevAvg.toFixed(1), recent: r, msg: '直近で観察急増 (' + r + '回 vs 前 ' + prevAvg.toFixed(1) + '回/週)' });
    } else if (prevAvg === 0 && r >= 3) {
      anomalies.push({ id: s.id, name: s.name, type: 'new', prev: 0, recent: r, msg: '前は記録なし→直近で' + r + '回' });
    }
  }
  return anomalies.slice(0, 8);
}

// ===== ほめキーワードクラスタ =====
function clusterPraises() {
  const praises = window.state.praises || [];
  if (praises.length < 5) return {};

  // ストップワード簡易リスト
  const stopwords = new Set(['です','ます','した','する','して','こと','もの','とき','時','の','が','を','に','と','は','で','も','や','から','まで','たち','など','ない','います','てる','てる']);

  const wordFreq = new Map();
  for (const p of praises) {
    if (!p.content) continue;
    // 簡易トークナイズ（2文字以上の連続漢字・ひらがな）
    const words = (p.content.match(/[一-龯]{2,}|[ぁ-ん]{2,}|[a-zA-Z]{3,}/g) || [])
      .filter(w => !stopwords.has(w));
    new Set(words).forEach(w => wordFreq.set(w, (wordFreq.get(w) || 0) + 1));
  }
  // 頻度トップ20
  return Array.from(wordFreq.entries())
    .filter(([_, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w, c]) => ({ word: w, count: c }));
}

// ===== UI =====
function injectInsightsUI() {
  const tab = document.getElementById('tab-overview');
  if (!tab || document.getElementById('aiInsightsSection')) return;
  const sec = document.createElement('div');
  sec.className = 'card';
  sec.id = 'aiInsightsSection';
  sec.style.margin = '12px';
  sec.innerHTML =
    '<h3>🤖 AIインサイト（試験的機能）</h3>' +
    '<p class="muted small">統計的なルールベース分析。AI副担任の上位機能ではなく、ローカル軽量分析。</p>' +
    '<div class="ai-grid">' +
    '<div class="ai-card"><h4>👀 次に観察すべき児童</h4><div id="aiPredictTargets"></div></div>' +
    '<div class="ai-card"><h4>⚡ 急変検出（直近7日 vs 前14日）</h4><div id="aiAnomalies"></div></div>' +
    '<div class="ai-card"><h4>🌟 ほめキーワード傾向</h4><div id="aiPraiseCluster"></div></div>' +
    '</div>';
  tab.appendChild(sec);
}

function refreshInsights() {
  const t1 = document.getElementById('aiPredictTargets');
  const t2 = document.getElementById('aiAnomalies');
  const t3 = document.getElementById('aiPraiseCluster');
  if (!t1 || !t2 || !t3) return;

  const targets = predictObservationTargets();
  if (targets.length === 0) {
    t1.innerHTML = '<p class="muted small">候補なし（記録不足 or 全員順調）</p>';
  } else {
    let html = '<ul class="ai-list">';
    targets.forEach(c => {
      const tag = c.isWatch ? '■' : c.isHighlight ? '●' : '';
      const recScene = c.recommendedScenes.length > 0 ? ' / 推奨: ' + c.recommendedScenes.join(', ') : '';
      html += '<li><b>' + _esc(c.name) + '</b> ' + tag
            + ' <span class="muted small">(' + c.days + '日未観察' + recScene + ')</span></li>';
    });
    html += '</ul>';
    t1.innerHTML = html;
  }

  const anomalies = detectAnomalies();
  if (anomalies.length === 0) {
    t2.innerHTML = '<p class="muted small">急変なし</p>';
  } else {
    let html = '<ul class="ai-list">';
    anomalies.forEach(a => {
      const icon = a.type === 'drop' ? '🔻' : a.type === 'spike' ? '🔺' : '⭐';
      const color = a.type === 'drop' ? '#c00' : a.type === 'spike' ? '#080' : '#06c';
      html += '<li>' + icon + ' <b style="color:' + color + '">' + _esc(a.name) + '</b> '
            + '<span class="muted small">' + _esc(a.msg) + '</span></li>';
    });
    html += '</ul>';
    t2.innerHTML = html;
  }

  const cluster = clusterPraises();
  if (!cluster || cluster.length === 0) {
    t3.innerHTML = '<p class="muted small">ほめ記録の蓄積待ち</p>';
  } else {
    let html = '<div class="ai-cloud">';
    const max = cluster[0].count;
    cluster.forEach(w => {
      const sz = 10 + Math.round((w.count / max) * 8);
      html += '<span class="ai-word" style="font-size:' + sz + 'px;opacity:' + (0.5 + (w.count / max) * 0.5) + ';">'
            + _esc(w.word) + '<sub>' + w.count + '</sub></span>';
    });
    html += '</div>';
    t3.innerHTML = html;
  }
}

function injectStyles() {
  if (document.getElementById('aiStyles')) return;
  const s = document.createElement('style');
  s.id = 'aiStyles';
  s.textContent =
    '.ai-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:10px; margin-top:6px; }' +
    '.ai-card { background:#fafbfc; border:1px solid #e8eef5; border-radius:6px; padding:10px; }' +
    '.ai-card h4 { margin:0 0 6px; font-size:12px; color:#444; }' +
    '.ai-list { list-style:none; padding:0; margin:0; font-size:12px; }' +
    '.ai-list li { padding:3px 0; border-bottom:1px solid #f0f0f0; }' +
    '.ai-cloud { line-height:1.8; }' +
    '.ai-word { display:inline-block; padding:2px 6px; margin:2px; background:#e8eef5; border-radius:10px; color:#1976d2; }' +
    '.ai-word sub { font-size:8px; margin-left:2px; color:#888; }';
  document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn && btn.getAttribute('data-tab') === 'overview') {
      setTimeout(() => {
        injectInsightsUI();
        refreshInsights();
      }, 100);
    }
  });
});

window.AiInsights = {
  predictObservationTargets, detectAnomalies, clusterPraises, refresh: refreshInsights
};

})();
