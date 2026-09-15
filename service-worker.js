const CACHE_NAME = 'camping-app-v15';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './sync.js',
  './supabase-config.js',
  './manifest.json',
  './icon.svg',
];

// 인터넷이 느릴 때 얼마나 기다렸다가 저장해 둔 파일로 넘어갈지
const NETWORK_TIMEOUT = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/** 정해진 시간 안에 못 받아오면 실패로 칩니다. */
function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT);
    fetch(request).then(
      (response) => { clearTimeout(timer); resolve(response); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

/**
 * 인터넷이 되면 항상 새 파일을 먼저 받아옵니다. (고친 내용이 바로 반영되도록)
 * 안 되거나 느리면 저장해 둔 파일로 넘어갑니다. (캠핑장에서도 열리도록)
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetchWithTimeout(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const home = await caches.match('./index.html');
          if (home) return home;
        }
        return Response.error();
      })
  );
});
