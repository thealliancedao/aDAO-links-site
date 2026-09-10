// Alliance DAO — service worker (2026-09-10). Installability only: network-first for EVERYTHING, no data caching.
// Doctrine: every number on the site is live or cron-fresh; an offline cache would show stale data as current.
// The only thing cached is the app icon set + manifests, so the home-screen icon renders before the network answers.
const SHELL = 'ally-shell-v1';
const SHELL_FILES = ['/assets/app/icon-192.png', '/assets/app/icon-512.png', '/assets/app/icon-maskable-512.png', '/assets/app/apple-touch-icon-180.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (SHELL_FILES.includes(url.pathname)) { e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))); return; }
  // network-first, no fallback cache: a failed fetch fails honestly (the pages already show "no signal" states)
  e.respondWith(fetch(e.request));
});
