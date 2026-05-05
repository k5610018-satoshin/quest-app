'use strict';
/* ==========================================================================
 * photo-library.js — 児童ごと写真ライブラリ
 *
 * 各児童に作品・ノート写真を紐付けて保存（ローカルのみ・同期しない）
 * Canvas で 800px 以下にリサイズして容量節約
 *
 * 起動: 児童ダッシュボードに「📷 写真ライブラリ」セクション追加
 *       設定タブにも「📷 全写真ギャラリー」セクション追加
 * 保存先: localStorage (interactionApp_photos)
 * ========================================================================== */

(function() {

const STORAGE_KEY = 'interactionApp_photos';
const MAX_DIM = 800;
const QUALITY = 0.75;

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

function loadPhotos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (_) { return {}; }
}

function savePhotos(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert('容量オーバーです。古い写真を削除してください。');
    }
    return false;
  }
}

// 画像リサイズ
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(MAX_DIM / img.width, MAX_DIM / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
        resolve({ dataUrl, w, h, originalSize: file.size });
      };
      img.onerror = () => reject(new Error('画像読込失敗'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('ファイル読込失敗'));
    reader.readAsDataURL(file);
  });
}

async function addPhotoForStudent(studentId, file, caption) {
  const photos = loadPhotos();
  if (!photos[studentId]) photos[studentId] = [];
  try {
    const { dataUrl, w, h, originalSize } = await resizeImage(file);
    photos[studentId].push({
      id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      data: dataUrl,
      caption: caption || '',
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      w, h,
      originalSize
    });
    if (!savePhotos(photos)) return false;
    return true;
  } catch (e) {
    alert('写真追加失敗: ' + e.message);
    return false;
  }
}

function deletePhoto(studentId, photoId) {
  const photos = loadPhotos();
  if (!photos[studentId]) return;
  photos[studentId] = photos[studentId].filter(p => p.id !== photoId);
  if (photos[studentId].length === 0) delete photos[studentId];
  savePhotos(photos);
}

function getPhotosForStudent(studentId) {
  const photos = loadPhotos();
  return photos[studentId] || [];
}

// ===== UI: 児童プロファイルモーダルに「📷 写真」セクション追加 =====
function injectPhotoSectionInDashboard() {
  const body = document.getElementById('dashboardBody');
  if (!body || body.dataset.photoInjected) return;
  body.dataset.photoInjected = '1';

  // 児童 ID を取得（既存の構造から推定）
  const h2 = body.querySelector('h2');
  if (!h2) return;
  // 「(出席番号 X)」から ID 抽出
  const meta = body.querySelector('.dashboard-header span.muted');
  const m = meta ? meta.textContent.match(/出席番号\s*(\d+)/) : null;
  if (!m) return;
  const studentId = parseInt(m[1], 10);
  const photos = getPhotosForStudent(studentId);

  const sec = document.createElement('div');
  sec.className = 'card';
  sec.id = 'phStudentPhotos';
  sec.style.marginTop = '8px';
  sec.dataset.studentId = String(studentId);
  let html = '<h3>📷 写真ライブラリ (' + photos.length + ')</h3>'
    + '<div style="margin-bottom:6px;">'
    + ' <input type="file" id="phUploadInput" accept="image/*" multiple capture="environment" style="font-size:12px;">'
    + ' <input type="text" id="phCaptionInput" placeholder="キャプション（任意）" style="padding:3px 8px;font-size:12px;width:200px;">'
    + ' <button class="primary" id="phUploadBtn">＋ 追加</button>'
    + '</div>'
    + '<div class="ph-grid">';
  photos.forEach(p => {
    html += '<div class="ph-item" data-id="' + _esc(p.id) + '">'
      + '<img src="' + _esc(p.data) + '" alt="" loading="lazy">'
      + '<div class="ph-meta"><span>' + _esc(p.date) + '</span>'
      + '<button class="ph-del" title="削除">🗑</button></div>'
      + (p.caption ? '<div class="ph-cap">' + _esc(p.caption) + '</div>' : '')
      + '</div>';
  });
  if (photos.length === 0) {
    html += '<p class="muted small">まだ写真がありません</p>';
  }
  html += '</div>';
  sec.innerHTML = html;
  body.appendChild(sec);

  document.getElementById('phUploadBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('phUploadInput');
    const capInput = document.getElementById('phCaptionInput');
    const files = Array.from(fileInput.files || []);
    if (files.length === 0) { alert('写真を選択してください'); return; }
    const caption = capInput.value.trim();
    let added = 0;
    for (const f of files) {
      const ok = await addPhotoForStudent(studentId, f, caption);
      if (ok) added++;
    }
    if (added > 0) {
      // 再描画
      body.dataset.photoInjected = '';
      sec.remove();
      injectPhotoSectionInDashboard();
    }
  });

  sec.querySelector('.ph-grid').addEventListener('click', e => {
    const del = e.target.closest('.ph-del');
    if (del) {
      const item = del.closest('.ph-item');
      if (confirm('この写真を削除しますか？')) {
        deletePhoto(studentId, item.dataset.id);
        body.dataset.photoInjected = '';
        sec.remove();
        injectPhotoSectionInDashboard();
      }
      return;
    }
    const img = e.target.closest('img');
    if (img) {
      // 拡大表示
      showLightbox(img.src);
    }
  });
}

function showLightbox(src) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
  div.innerHTML = '<img src="' + src + '" style="max-width:95vw;max-height:95vh;box-shadow:0 4px 20px rgba(0,0,0,0.5);">';
  div.addEventListener('click', () => div.remove());
  document.body.appendChild(div);
}

function injectStyles() {
  if (document.getElementById('phStyles')) return;
  const s = document.createElement('style');
  s.id = 'phStyles';
  s.textContent =
    '.ph-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:8px; }' +
    '.ph-item { border:1px solid #eee; border-radius:6px; overflow:hidden; background:white; }' +
    '.ph-item img { width:100%; height:100px; object-fit:cover; cursor:zoom-in; display:block; }' +
    '.ph-meta { display:flex; justify-content:space-between; align-items:center; padding:2px 6px; font-size:10px; color:#666; }' +
    '.ph-del { padding:0 4px !important; font-size:11px !important; opacity:0.5; }' +
    '.ph-del:hover { opacity:1; color:#c00; }' +
    '.ph-cap { font-size:11px; padding:2px 6px; color:#444; border-top:1px solid #f0f0f0; }';
  document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  // 児童ダッシュボードを開いた時に写真セクション注入
  // openStudentDashboard が body.innerHTML を書き換えた後を観察
  const observer = new MutationObserver(() => {
    const modal = document.getElementById('dashboardModal');
    if (modal && !modal.classList.contains('hidden')) {
      setTimeout(injectPhotoSectionInDashboard, 100);
    }
  });
  const target = document.getElementById('dashboardModal');
  if (target) observer.observe(target, { attributes: true, attributeFilter: ['class'] });
});

window.PhotoLibrary = {
  add: addPhotoForStudent,
  delete: deletePhoto,
  getForStudent: getPhotosForStudent,
  loadAll: loadPhotos
};

})();
