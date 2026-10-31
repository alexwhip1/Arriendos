// Permite abrir la aplicación aunque no haya internet.
// Al cambiar archivos de la aplicación, suba el número de VERSION.
const VERSION = 'arriendos-v1';
const FILES = [
  './', 'index.html', 'css/styles.css', 'js/util.js', 'js/db.js', 'js/templates.js', 'js/app.js',
  'manifest.webmanifest', 'icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero intenta internet (para recibir mejoras); si no hay, usa lo guardado.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
