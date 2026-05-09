/* ============================================================
 * Service Worker for sansuu-app
 * v0.1: 最小限のキャッシュ。POST 系は素通し。
 * ============================================================ */
const CACHE_NAME = 'sansuu-app-v1';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './cloud-sync.js',
  './idb-storage.js',
  './data/prompts.js',
  './data/unit_master.json',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // POSTやGAS呼び出しは素通し（同期はoffline時にCloudSync側でリトライ）
  if (req.method !== 'GET') return;
  if (req.url.includes('script.google.com') || req.url.includes('supabase.co')) return;

  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      // 成功した同オリジン GET をキャッシュ
      if (res.ok && req.url.startsWith(self.location.origin)) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => cached))
  );
});
