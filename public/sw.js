// PUSH-ONLY SERVICE WORKER (replaces the 2026-05-21 kill switch).
//
// CACHE-SAFETY GUARANTEE — why this cannot reintroduce the stale-asset bug:
//   The prior regression came from a `fetch` handler that did event.respondWith()
//   reading from a FIXED-NAME Cache Storage entry, so after a deploy the browser
//   was served OLD chart JS out of that cache. This SW has NO 'fetch' listener,
//   NO caches.open(), NO cache.put(), NO event.respondWith() anywhere. With no
//   fetch handler, navigations and subresources (HTML, /_next/static hashed
//   chunks, CSS) are NEVER routed through this worker — they hit the network /
//   HTTP disk cache exactly as if no SW existed. Cache Storage is never
//   populated, so there is physically nothing stale to serve. The ABSENCE of a
//   fetch handler IS the safety mechanism. clients.claim() only takes control of
//   open pages for push delivery; it does not touch asset delivery.
//
// TRANSITION: same path (/sw.js) AND same scope ('/') as the old kill switch, so
//   the browser performs a normal byte-diff UPDATE of the existing registration
//   rather than creating a second coexisting one. Even mid-transition there is no
//   stale-asset path: old kill switch = network-only, new SW = no fetch handler.
//
// To force a future update (e.g. payload format change), bump this marker: v2

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Incoming web push from /api/cron/dividend-events.
// Payload JSON: { title: string, body: string, tag?: string }
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Dividends", body: event.data ? event.data.text() : "Dividend alert" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Dividends", {
      body: data.body || "Dividend event today.",
      tag: data.tag || "dividend-alert",
      icon: "/icon-v3.png",
      badge: "/icon-v3.png",
      requireInteraction: false,
    })
  );
});

// Tap → focus an existing /pocket window or open one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes("/pocket"));
      if (existing) return existing.focus();
      return self.clients.openWindow("/pocket");
    })
  );
});

// Best-effort recovery if the push service rotates/expires the subscription.
// (iOS support for this event is weak — load-time reconciliation in the app is
// the real recovery path.)
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/api/push/vapid-public-key");
        const { publicKey } = await res.json();
        if (!publicKey) return;
        const pad = "=".repeat((4 - (publicKey.length % 4)) % 4);
        const b64 = (publicKey + pad).replace(/-/g, "+").replace(/_/g, "/");
        const raw = atob(b64);
        const key = Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys }),
        });
      } catch (e) {
        /* app-side reconciliation will recover */
      }
    })()
  );
});
