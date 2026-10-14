/* offline: the whole app is cached on first open; a new deploy (new VERSION) refreshes it */
const VERSION = 'pt-v62-1';
const FILES = ["./", "account.js", "app.js", "assets/icon-180.png", "assets/icon-192.png", "assets/icon-512.png", "assets/logo.png", "assets/photo-0.webp", "assets/photo-1.webp", "assets/photo-2.webp", "assets/photo-3.webp", "assets/photo-4.webp", "assets/photo-5.webp", "assets/photo-6.webp", "assets/photo-7.webp", "assets/photo-8.webp", "beforeafter.js", "brand.js", "credits.js", "drag.js", "edit.js", "engine.js", "gridcheck.js", "importgrid.js", "index.html", "launch.js", "legal.js", "manifest.webmanifest", "merge.js", "motion.js", "planning.js", "progress.js", "purpose.js", "save.js", "settings.js", "share.js", "simple.js", "store.js", "stories.js", "studio.js", "style.css", "vibe.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => { const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok){ const cp = res.clone(); caches.open(VERSION).then(c => c.put(r, cp)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('index.html')))); });
