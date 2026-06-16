// PUSH + OFFLINE-NOTICE SERVICE WORKER (replaces the 2026-05-21 kill switch).
//
// CACHE-SAFETY GUARANTEE — why this cannot reintroduce the stale-asset bug:
//   The prior regression came from a `fetch` handler that did event.respondWith()
//   reading from a FIXED-NAME Cache Storage entry, so after a deploy the browser
//   was served OLD chart JS out of that cache. This SW still has NO caches.open(),
//   NO cache.put(), and Cache Storage is NEVER populated — there is physically
//   nothing stale to serve. The one 'fetch' listener below handles NAVIGATION
//   requests ONLY, and is strictly network-first with NO cache read: it either
//   returns the live network response untouched, or — only when the network
//   itself fails (offline) — an offline notice built INLINE from a string
//   constant baked into this file. Subresources (/_next/static hashed chunks,
//   CSS, images, API calls) are never routed through respondWith(): the handler
//   returns early without calling it, so they hit the network / HTTP disk cache
//   exactly as if no SW existed.
//
// TRANSITION: same path (/sw.js) AND same scope ('/') as the old kill switch, so
//   the browser performs a normal byte-diff UPDATE of the existing registration
//   rather than creating a second coexisting one.
//
// To force a future update (e.g. payload format change), bump this marker: v3

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Minimal offline notice for NAVIGATIONS only (the installed /pocket PWA used to
// show a blank browser error page when launched offline). Inline constant — not
// cached, not fetched — so it can never go stale relative to the app.
const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Offline</title>
<style>
  html,body{margin:0;height:100%;background:#f2f2f7;color:#0a0a0a;
    font-family:-apple-system,"SF Pro Display",system-ui,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
  @media (prefers-color-scheme: dark){html,body{background:#000;color:#fff}}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center}
  h1{font-size:20px;font-weight:800;letter-spacing:-.4px;margin:0}
  p{font-size:13px;font-weight:600;color:#6e6e73;margin:0}
  @media (prefers-color-scheme: dark){p{color:#8e8e93}}
  button{appearance:none;border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;
    font:inherit;font-size:15px;font-weight:700;padding:12px 16px;border-radius:12px;margin-top:8px}
</style></head>
<body><div class="wrap">
  <h1>You&rsquo;re offline</h1>
  <p>Dividends needs a connection to load. Try again when you&rsquo;re back online.</p>
  <button onclick="location.reload()">Retry</button>
</div></body></html>`;

self.addEventListener("fetch", (event) => {
  // NAVIGATIONS ONLY — every other request returns here without respondWith()
  // and is handled by the browser as if no SW existed (see safety note above).
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    // Strictly network-first, no cache lookup: pass the live response through
    // untouched; only a genuine network failure gets the inline offline notice.
    fetch(event.request).catch(
      () =>
        new Response(OFFLINE_HTML, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
    )
  );
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
