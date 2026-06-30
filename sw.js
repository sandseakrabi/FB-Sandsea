/* SandSea Restaurant — minimal service worker.
   Its only job is to satisfy PWA installability requirements
   and provide basic offline caching of the app shell. */

const CACHE_NAME = "sandsea-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event)=>{
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event)=>{
  // Network-first for the Apps Script API (menu data must stay fresh),
  // cache-first for the static app shell.
  const url = event.request.url;
  if(url.includes("script.google.com")){
    return; // let it go straight to network, no caching of live data
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
