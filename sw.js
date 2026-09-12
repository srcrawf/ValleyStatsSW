// ValleyStats service worker — caches the app shell (HTML/CSS/JS/icons) so the
// dashboard still opens offline or on a flaky connection. Live weather and
// scores still require a network request; this only guarantees the page
// itself loads instantly and works without one.

const CACHE_NAME = 'valleystats-ns-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './cactus-icon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first for the app shell so a deployed update is picked up as soon
// as the device is online, falling back to the cached copy when it's not.
// Everything else (weather API, ESPN API, Google Fonts) just passes through
// to the network unchanged — this worker only owns the shell files above.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isShellRequest = url.origin === self.location.origin;
  if (!isShellRequest) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
