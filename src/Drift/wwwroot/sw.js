/* Service worker (the PWA frame): the app can be installed and starts when the network is briefly away.
 * It keeps ONLY the static shell (the files below), never an answer that needs a session: no API answer and no other page (SEC-08).
 * The shell is asked from the network first, so an update arrives at once; what was fetched is the fallback.
 * An app that adds a static file to its shell adds its path here. */
const CACHE = 'app-v3';
const SHELL = new Set(['/', '/index.html', '/app.css', '/app.js', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg']);
const SHELL_FOLDERS = ['/base/', '/i18n/'];   // the look of the base and the texts of the app

const isShell = (path) => SHELL.has(path) || SHELL_FOLDERS.some((p) => path.startsWith(p));

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !isShell(url.pathname)) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((m) => m || (req.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
