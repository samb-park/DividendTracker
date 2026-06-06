"use client";

import { useEffect } from "react";

// Registers the push-only /sw.js at scope '/' — the SAME scope the historical SW
// used, so this is a clean UPDATE of any existing registration, not a second
// coexisting one. Scope '/' is required: the /v1 surface and the installed
// /pocket PWA must share one worker. The SW has NO fetch handler, so a '/'-scoped
// worker is cache-safe (it cannot serve stale assets — see public/sw.js).
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.debug("SW registration failed:", err));
  }, []);

  return null;
}
