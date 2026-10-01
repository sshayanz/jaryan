const CACHE_NAME = 'jaryan-0.7.0-account-db-shell';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=0.7.0-account-db',
  './app.js?v=0.7.0-account-db',
  './search-worker.js',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/fonts/Ravi-VF.ttf',
  './assets/fonts/Yekan.woff2',
  './assets/fonts/IranNastaliq.ttf',
  './assets/fonts/ShekastehNastaliq.ttf',
  './assets/fonts/MirEmad.ttf',
  './data/catalog.json',
  './data/poem-index.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const current = await caches.open(CACHE_NAME);
    const previous = keys.filter(key => key.startsWith('jaryan-') && key !== CACHE_NAME);
    for (const key of previous) {
      const oldCache = await caches.open(key);
      for (const request of await oldCache.keys()) {
        if (await current.match(request)) continue;
        const response = await oldCache.match(request);
        if (response) await current.put(request, response);
      }
    }
    await Promise.all(previous.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'DELETE_CACHE_URL') {
    let url;
    try { url = new URL(event.data.url); } catch { return; }
    if (url.origin !== self.location.origin) return;
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.delete(url.href)));
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response?.status === 200 && response.type !== 'opaque') {
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())));
    }
    return response;
  })());
});
