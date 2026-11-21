/* Provenance service worker: offline app shell.
   Precaches the app shell and the current build's static chunks at install
   (route HTML names the build's hashed files, so the list stays current),
   and caches any other same-origin asset (audio samples, chord data) on first use.
   Navigations are cache-first with background revalidation, so the installed app
   launches instantly and keeps working fully offline. Song data lives in
   localStorage/IndexedDB on the device. */
const CACHE = 'provenance-v2-shell-v3';
const BASE = '/provenance-v2';
const ROUTES = ['/', '/song/', '/songs/', '/chord-finder/', '/chords/', '/song/timeline/'];
const CORE = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.webmanifest',
  BASE + '/icons/icon-192.png',
  BASE + '/icons/icon-512.png',
  BASE + '/icons/apple-touch-icon.png',
];

function cacheOne(cache, url) {
  return cache.add(url).catch(() => {});
}

function cacheRouteAssets(cache) {
  return Promise.all(
    ROUTES.map((route) =>
      cacheOne(cache, BASE + route)
        .then(() => cache.match(BASE + route))
        .then((res) => (res ? res.text() : ''))
        .then((html) => {
          const urls = new Set();
          const re = /\/provenance-v2\/_next\/[^"'\\\s)]+/g;
          let m;
          while ((m = re.exec(html))) urls.add(m[0]);
          return Promise.all([...urls].map((u) => cacheOne(cache, u)));
        })
    )
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(CORE.map((u) => cacheOne(cache, u))).then(() => cacheRouteAssets(cache))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE + '/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(fresh);
          return cached;
        }
        return fresh.then((res) => res || caches.match(BASE + '/index.html'));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
    )
  );
});
