"use client";

import { useEffect } from "react";

// 2026-05-21 KILL SWITCH: do NOT register a service worker right now.
// iOS Safari kept serving stale JS chunks because the previous SW pinned a
// fixed cache name. /sw.js currently runs a self-unregister-and-purge routine
// on install. We must not call register() again until we ship a SW with a
// versioned-cache strategy that's safe to re-enable.
export function PwaRegister() {
  useEffect(() => {
    // Best-effort cleanup: if any old SW is still registered, unregister it
    // so this user reverts to direct network fetches.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => {}))))
        .catch(() => {});
    }
  }, []);

  return null;
}
