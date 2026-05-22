// KILL SWITCH (2026-05-21-all-default):
// iOS Safari was serving stale chart JS even after deploys. Once-off reset —
// this version of /sw.js purges ALL caches, unregisters itself, and reloads
// every open tab. After the next page load the user has no service worker;
// /pwa-register will reinstall a fresh SW the next time we ship a new one.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch { /* ignore cross-origin */ }
    }
  })());
});

// Network-only fetch — no caching whatsoever while the kill switch is active.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
