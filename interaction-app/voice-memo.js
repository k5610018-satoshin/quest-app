'use strict';
/* ==========================================================================
 * voice-memo.js — 児童ごと 音声メモ
 *
 * 録音 → base64 で localStorage 保存 → 再生・削除
 * 注意: 音声は容量大なので 60 秒以内推奨
 *
 * 起動: 児童プロファイルモーダルに「🎙 音声メモ」セクション
 * 保存先: localStorage (interactionApp_voiceMemos)
 * ========================================================================== */

(function() {

const STORAGE_KEY = 'interactionApp_voiceMemos';
const MAX_DURATION_MS = 90000; // 90秒で自動停止

function _esc(s) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch (_) { return {}; }
}

function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert('容量オーバーです。古い音声メモを削除してください。');
    }
    return false;
  }
}

function getMemosForStudent(id) {
  const all = load();
  return all[id] || [];
}

function deleteMemoForStudent(id, memoId) {
  const all = load();
  if (!all[id]) return;
  all[id] = all[id].filter(m => m.id !== memoId);
  if (all[id].length === 0) delete all[id];
  save(all);
}

function addMemoForStudent(id, blob, durationSec, memo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const all = load();
      if (!all[id]) all[id] = [];
      all[id].push({
        id: 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        data: e.target.result,
        memo: memo || '',
        date: new Date().toISOString().slice(0, 10),
        timestamp: new Date().toISOString(),
        durationSec: durationSec,
        size: blob.size
      });
      const ok = save(all);
      ok ? resolve(true) : reject(new Error('容量オーバー'));
    };
    reader.onerror = () => reject(new Error('読込失敗'));
    reader.readAsDataURL(blob);
  });
}

// ===== 録音制御 =====
let _recorder = null;
let _chunks = [];
let _startedAt = 0;
let _autoStopTimer = null;

function startRecording(onComplete) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('お使いのブラウザは音声録音に対応していません');
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    _chunks = [];
    _recorder = new MediaRecorder(stream);
    _recorder.ondataavailable = e => { if (e.data.size > 0) _chunks.push(e.data); };
    _recorder.onstop = () => {
      const dur = (Date.now() - _startedAt) / 1000;
      const blob = new Blob(_chunks, { type: _recorder.mimeType || 'audio/webm' });
      stream.getTracks().forEach(t => t.stop());
      onComplete && onComplete(blob, dur);
    };
    _recorder.start();
    _startedAt = Date.now();
    if (_autoStopTimer) clearTimeout(_autoStopTimer);
    _autoStopTimer = setTimeout(() => {
      if (_recorder && _recorder.state === 'recording') _recorder.stop();
    }, MAX_DURATION_MS);
  }).catch(err => {
    alert('マイクへのアクセスが拒否されました: ' + err.message);
  });
}

function stopRecording() {
  if (_recorder && _recorder.state === 'recording') {
    if (_autoStopTimer) { clearTimeout(_autoStopTimer); _autoStopTimer = null; }
    _recorder.stop();
  }
}

// ===== UI: 児童プロファイルに「🎙 音声メモ」セクション挿入 =====
function injectVoiceSectionInDashboard() {
  const body = document.getElementById('dashboardBody');
  if (!body || body.dataset.voiceInjected) return;
  body.dataset.voiceInjected = '1';

  const meta = body.querySelector('.dashboard-header span.muted');
  const m = meta ? meta.textContent.match(/出席番号\s*(\d+)/) : null;
  if (!m) return;
  const studentId = parseInt(m[1], 10);
  const memos = getMemosForStudent(studentId);

  const sec = document.createElement('div');
  sec.className = 'card';
  sec.id = 'vmStudentVoices';
  sec.style.marginTop = '8px';
  sec.dataset.studentId = String(studentId);
  let html = '<h3>🎙 音声メモ (' + memos.length + ')</h3>'
    + '<p class="muted small">最大90秒で自動停止。音声は端末内のみ保存（同期しない）。</p>'
    + '<div style="margin-bottom:8px;">'
    + ' <button class="primary vm-rec-btn" id="vmStartBtn">⏺ 録音開始</button>'
    + ' <button class="ghost" id="vmStopBtn" disabled>⏹ 停止</button>'
    + ' <input type="text" id="vmMemoInput" placeholder="メモ（録音内容のラベル）" style="padding:4px 8px;font-size:12px;width:240px;">'
    + ' <span id="vmStatus" class="muted small"></span>'
    + '</div>'
    + '<div class="vm-list">';
  memos.forEach(mm => {
    html += '<div class="vm-item" data-id="' + _esc(mm.id) + '">'
      + '<audio controls preload="metadata" src="' + _esc(mm.data) + '"></audio>'
      + '<div class="vm-meta">'
      + '<span>' + _esc(mm.date) + ' (' + Math.round(mm.durationSec || 0) + '秒)</span>'
      + (mm.memo ? '<span class="vm-cap">' + _esc(mm.memo) + '</span>' : '')
      + '<button class="vm-del" title="削除">🗑</button>'
      + '</div></div>';
  });
  if (memos.length === 0) html += '<p class="muted small">まだ録音がありません</p>';
  html += '</div>';
  sec.innerHTML = html;
  body.appendChild(sec);

  let recording = false;
  document.getElementById('vmStartBtn').addEventListener('click', () => {
    if (recording) return;
    recording = true;
    document.getElementById('vmStartBtn').disabled = true;
    document.getElementById('vmStartBtn').textContent = '🔴 録音中...';
    document.getElementById('vmStopBtn').disabled = false;
    const status = document.getElementById('vmStatus');
    status.textContent = '0 秒';
    let secCounter = 0;
    const tick = setInterval(() => { secCounter++; status.textContent = secCounter + ' 秒 (最大90)'; }, 1000);
    startRecording(async (blob, dur) => {
      clearInterval(tick);
      recording = false;
      const memo = document.getElementById('vmMemoInput').value.trim();
      try {
        await addMemoForStudent(studentId, blob, dur, memo);
        body.dataset.voiceInjected = '';
        sec.remove();
        injectVoiceSectionInDashboard();
      } catch (e) {
        alert('保存失敗: ' + e.message);
      }
    });
  });
  document.getElementById('vmStopBtn').addEventListener('click', () => {
    stopRecording();
    document.getElementById('vmStartBtn').disabled = false;
    document.getElementById('vmStartBtn').textContent = '⏺ 録音開始';
    document.getElementById('vmStopBtn').disabled = true;
  });
  sec.querySelector('.vm-list').addEventListener('click', e => {
    const del = e.target.closest('.vm-del');
    if (del) {
      const item = del.closest('.vm-item');
      if (confirm('この音声メモを削除しますか？')) {
        deleteMemoForStudent(studentId, item.dataset.id);
        body.dataset.voiceInjected = '';
        sec.remove();
        injectVoiceSectionInDashboard();
      }
    }
  });
}

function injectStyles() {
  if (document.getElementById('vmStyles')) return;
  const s = document.createElement('style');
  s.id = 'vmStyles';
  s.textContent =
    '.vm-list { display:flex; flex-direction:column; gap:6px; }' +
    '.vm-item { padding:6px; border:1px solid #eee; border-radius:6px; background:#fafbfc; }' +
    '.vm-item audio { width:100%; height:30px; }' +
    '.vm-meta { display:flex; justify-content:space-between; align-items:center; padding:2px 0; font-size:11px; color:#666; }' +
    '.vm-cap { color:#444; font-style:italic; }' +
    '.vm-del { padding:0 4px !important; font-size:11px !important; opacity:0.5; background:none !important; }' +
    '.vm-del:hover { opacity:1; color:#c00; }' +
    '.vm-rec-btn { background:#e74c3c !important; }';
  document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  const observer = new MutationObserver(() => {
    const modal = document.getElementById('dashboardModal');
    if (modal && !modal.classList.contains('hidden')) {
      setTimeout(injectVoiceSectionInDashboard, 200);
    }
  });
  const target = document.getElementById('dashboardModal');
  if (target) observer.observe(target, { attributes: true, attributeFilter: ['class'] });
});

window.VoiceMemo = {
  startRecording, stopRecording,
  addMemoForStudent, deleteMemoForStudent, getMemosForStudent
};

})();
