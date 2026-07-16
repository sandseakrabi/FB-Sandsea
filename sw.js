/* SandSea Restaurant — minimal service worker.
   Its only job is to satisfy PWA installability requirements
   and provide basic offline caching of the app shell.

   *** FIX: bump this version string EVERY time you deploy changes
   to index.html / app.js / style.css so old clients pick up the
   new files instead of being stuck on a stale cached copy. *** */

const SW_VERSION = "v2-2026-07-16";              // <-- bump this on every deploy
const CACHE_NAME = "sandsea-shell-" + SW_VERSION;

// Files that change often -> always try network first (falls back to cache offline)
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];

// Files that rarely change -> safe to cache-first
const STATIC_ASSETS = [
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([...APP_SHELL, ...STATIC_ASSETS]))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Live menu data must always be fresh — never touch it
  if (url.includes("script.google.com")) return;

  const isAppShell = APP_SHELL.some(path => url.endsWith(path.replace("./", "")));

  if (isAppShell || event.request.mode === "navigate") {
    // Network-first: always try to get the latest HTML/JS/CSS.
    // Falls back to cache only when offline.
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (icons etc.)
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
