/* HYPNOS v2.0 — Service Worker: caché del app shell (Local-First, 100 % offline). */
const CACHE_PREFIX = 'hypnos-';
const CACHE = CACHE_PREFIX + 'v2.1-cache';
const SHELL = ['./', './index.html', './style.css', './engine.js', './app.js', './manifest.json', './icon.svg'];
const SHELL_PATHS = SHELL.map((p) => new URL(p, self.location).pathname);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

/* Solo elimina cachés propias de HYPNOS (prefijo) de versiones anteriores. */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Cache-first con actualización en segundo plano (stale-while-revalidate), limitado al app shell. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const esShell = SHELL_PATHS.indexOf(url.pathname) !== -1;
  if (!esShell && req.mode !== 'navigate') return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const red = fetch(req).then((res) => {
        if (esShell && res && res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return res;
      }).catch(() => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return hit || red;
    })
  );
});
