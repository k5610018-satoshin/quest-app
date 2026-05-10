/* ==========================================================================
 * service-worker.js — オフライン対応 + 静的キャッシュ
 *
 * 戦略:
 *  - 静的ファイル: Cache First（速度優先、オフライン対応）
 *  - GAS同期: ネットワークのみ（オフライン時はpending queueへ）
 *  - HTML: NetworkFirst with cache fallback
 * ========================================================================== */

const CACHE_VERSION = 'v20260510f';
const CACHE_NAME = 'interaction-app-' + CACHE_VERSION;

const STATIC_FILES = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './students.js',
  './eval-data.js',
  './eval-data-extra.js',
  './idb-storage.js',
  './app.js',
  './cloud-sync.js',
  './health-monitor.js',
  './analytics-plus.js',
  './dashboard-overview.js',
  './seating-planner.js',
  './seating-correlation.js',
  './centrality-extra.js',
  './print-report.js',
  './search-bar.js',
  './templates.js',
  './photo-library.js',
  './voice-memo.js',
  './ai-insights.js',
  './extra-features.js',
  './onboarding-wizard.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// インストール時: 静的ファイルをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_FILES.map(url => new Request(url, { cache: 'reload' })));
    }).then(() => self.skipWaiting())
  );
});

// アクティベート時: 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('interaction-app-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// fetch: ファイル種別ごとに戦略を切替
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // GAS への通信は常にネットワーク経由（オフライン時は失敗してpending queueへ）
  if (url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent')) {
    return; // デフォルトのネットワーク経由
  }

  // GET 以外はキャッシュしない
  if (event.request.method !== 'GET') return;

  // 同一オリジンの静的ファイル: Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          // バックグラウンドで更新
          fetch(event.request).then(res => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then(c => c.put(event.request, res));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(event.request).then(res => {
          if (res && res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => {
          // オフライン時: HTMLリクエストには index.html を返す
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
    );
  }
});

// メインスレッドからのメッセージ（手動キャッシュクリアなど）
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
