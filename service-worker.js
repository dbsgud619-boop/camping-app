const CACHE_NAME = 'coupleLog-v29';
const ASSETS = [
  './',
  './index.html',
  './camping.html',
  './travel.html',
  './style.css',
  './app.js',
  './app-travel.js',
  './sync.js',
  './sync-ui.js',
  './supabase-config.js',
  './maps-config.js',
  './travel-seed.js',
  './manifest.json',
  './icon.svg',
  './assets/travel-429a5481-3.png',
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

/**
 * 정해진 시간 안에 못 받아오면 실패로 칩니다.
 * 파일이 고쳐져도 브라우저가 유효기간(Cache-Control: max-age) 안에는 서버에
 * 물어보지도 않고 예전 응답을 그대로 씁니다. no-store 로 그 캐시를 건너뛰고
 * 항상 서버에 새로 물어봅니다.
 */
function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT);
    fetch(request.url, { cache: 'no-store' }).then(
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
