/* ==========================================================================
 * pwa-install.js — ホーム画面に追加プロンプト
 *
 * - Android/Chrome: beforeinstallprompt を捕捉してボタン表示 → ネイティブプロンプト
 * - iOS Safari:    UA判定で「共有 → ホーム画面に追加」手順を modal 表示
 * - 一度「インストール完了」or「閉じる」を押したら localStorage に記録して再表示しない
 * - スタンドアロン起動時(=既にインストール済)はボタン自体を表示しない
 * ========================================================================== */
(function () {
  'use strict';

  var LS_KEY = 'pwaInstallDismissed_v1';
  var deferredPrompt = null;

  // 既に閉じた / インストール完了 / スタンドアロン起動中 → 何もしない
  function isDismissed() { try { return localStorage.getItem(LS_KEY) === '1'; } catch (e) { return false; } }
  function markDismissed() { try { localStorage.setItem(LS_KEY, '1'); } catch (e) {} }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           window.navigator.standalone === true;
  }
  function isIOS() {
    var ua = window.navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  }

  function ensureButton() {
    if (document.getElementById('pwaInstallBtn')) return document.getElementById('pwaInstallBtn');
    var btn = document.createElement('button');
    btn.id = 'pwaInstallBtn';
    btn.className = 'pwa-install-btn';
    btn.type = 'button';
    btn.title = 'このアプリをホーム画面に追加';
    btn.textContent = '📱 ホーム画面に追加';
    var header = document.querySelector('.app-header .header-left') || document.body;
    header.appendChild(btn);
    btn.addEventListener('click', onInstallClick);
    return btn;
  }

  function removeButton() {
    var btn = document.getElementById('pwaInstallBtn');
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
  }

  function onInstallClick() {
    if (isIOS()) { showIOSModal(); return; }
    if (!deferredPrompt) { showIOSModal(); return; } // フォールバック
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') { markDismissed(); removeButton(); }
      deferredPrompt = null;
    });
  }

  function showIOSModal() {
    if (document.getElementById('pwaInstallModal')) return;
    var ov = document.createElement('div');
    ov.id = 'pwaInstallModal';
    ov.className = 'pwa-install-modal';
    ov.innerHTML =
      '<div class="pwa-install-modal-inner">' +
        '<h3>ホーム画面に追加</h3>' +
        '<ol>' +
          '<li>Safariの下部にある <b>共有ボタン</b>（□↑）をタップ</li>' +
          '<li>メニューから <b>「ホーム画面に追加」</b> を選択</li>' +
          '<li>右上の <b>「追加」</b> をタップして完了</li>' +
        '</ol>' +
        '<p class="muted small">アプリのように起動でき、オフラインでも利用できます。</p>' +
        '<div class="pwa-install-modal-btns">' +
          '<button type="button" class="ghost" id="pwaModalClose">閉じる</button>' +
          '<button type="button" class="primary" id="pwaModalDone">インストール完了</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.getElementById('pwaModalClose').addEventListener('click', function () { closeModal(false); });
    document.getElementById('pwaModalDone').addEventListener('click', function () { closeModal(true); });
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(false); });
  }

  function closeModal(done) {
    var m = document.getElementById('pwaInstallModal');
    if (m && m.parentNode) m.parentNode.removeChild(m);
    if (done) { markDismissed(); removeButton(); }
  }

  function init() {
    if (isStandalone() || isDismissed()) return;
    if (isIOS()) { ensureButton(); return; } // iOSは即ボタン表示
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      ensureButton();
    });
    window.addEventListener('appinstalled', function () { markDismissed(); removeButton(); deferredPrompt = null; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
