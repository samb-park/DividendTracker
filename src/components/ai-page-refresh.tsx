"use client";

// Page-level "refresh all AI cards" control.
// Clicking it: (1) POSTs /api/ai/cache to clear server-side cache for the
// current user, then (2) dispatches a window event each AI card listens for
// to re-fetch its data with ?force=1.
//
// Client-side debounce: 1s minimum between successful fires. Prevents accidental
// double-clicks from doubling LLM cost. Server-side per-user/min throttle (see
// src/lib/ai-throttle.ts) is the harder safety net for runaway loops.
import { useRef, useState } from "react";

export const AI_REFRESH_EVENT = "ai:force-refresh";
const DEBOUNCE_MS = 1000;

export function dispatchAiForceRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AI_REFRESH_EVENT));
}

export function AiPageRefreshButton() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const lastFireRef = useRef<number>(0);

  const onClick = async () => {
    const now = Date.now();
    if (busy) return;
    if (now - lastFireRef.current < DEBOUNCE_MS) return;
    lastFireRef.current = now;
    setBusy(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/ai/cache", { method: "POST" });
      setStatus(res.ok ? "ok" : "err");
    } catch {
      setStatus("err");
    }
    dispatchAiForceRefresh();
    setTimeout(() => {
      setBusy(false);
      setStatus("idle");
    }, DEBOUNCE_MS);
  };

  const icon =
    busy ? "…"
      : status === "ok" ? "✓"
        : status === "err" ? "!"
          : "↻";

  return (
    <button
      onClick={onClick}
      disabled={busy}
      title="AI 데이터 다시 가져오기"
      aria-label="AI 데이터 다시 가져오기"
      className="btn-retro text-xs px-2 py-1 leading-none disabled:opacity-50"
    >
      {icon}
    </button>
  );
}
