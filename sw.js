// Service worker: la app funciona sin conexión y el motor de recorte
// solo se descarga la primera vez.
const VERSION = 'vestidor-v2';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/db.js', './js/data.js', './js/color.js', './js/match.js', './js/imaging.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
const RUNTIME = 'vestidor-runtime-v1';
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'esm.sh', 'staticimgly.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Recursos externos (fuentes, librería y modelo de recorte): primero caché.
  if (RUNTIME_HOSTS.some(h => url.hostname.endsWith(h))) {
    e.respondWith(
      caches.open(RUNTIME).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Archivos propios: red primero (para recibir actualizaciones), caché si no hay conexión.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
  }
});
