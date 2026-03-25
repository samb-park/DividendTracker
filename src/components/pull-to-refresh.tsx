"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const THRESHOLD = 72;
const MAX_PULL = 96;

export function PullToRefresh() {
  const [pullY, setPullY] = useState(0);
  const [phase, setPhase] = useState<"idle" | "pulling" | "ready" | "refreshing">("idle");
  const startYRef = useRef<number | null>(null);
  const router = useRouter();

  const doRefresh = useCallback(async () => {
    setPhase("refreshing");
    setPullY(THRESHOLD);
    try {
      await fetch("/api/cache/clear", { method: "POST" });
    } catch { /* ignore */ }
    router.refresh();
    await new Promise((r) => setTimeout(r, 1400));
    setPhase("idle");
    setPullY(0);
  }, [router]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startYRef.current = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;
      if (phase === "refreshing") return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) { startYRef.current = null; return; }
      const clamped = Math.min(dy * 0.45, MAX_PULL);
      setPullY(clamped);
      setPhase(clamped >= THRESHOLD ? "ready" : "pulling");
    };

    const onTouchEnd = () => {
      if (phase === "ready") {
        doRefresh();
      } else if (phase === "pulling") {
        setPullY(0);
        setPhase("idle");
      }
      startYRef.current = null;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [phase, doRefresh]);

  if (phase === "idle") return null;

  const progress = Math.min(pullY / THRESHOLD, 1);
  const isRefreshing = phase === "refreshing";

  return (
    <div
      className="overflow-hidden flex items-center justify-center border-b border-border/40 bg-card/60 transition-all"
      style={{
        height: isRefreshing ? THRESHOLD : pullY,
        transition: isRefreshing ? "height 0.15s ease" : undefined,
      }}
    >
      <div className="flex items-center gap-2.5">
        {/* Spinner / arrow */}
        <div
          className="w-4 h-4 relative flex items-center justify-center"
          style={{
            transform: isRefreshing ? undefined : `rotate(${progress * 180}deg)`,
            transition: isRefreshing ? undefined : "transform 0.1s",
          }}
        >
          {isRefreshing ? (
            <svg
              className="animate-spin text-primary"
              viewBox="0 0 24 24"
              fill="none"
              width={14}
              height={14}
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              width={14}
              height={14}
              className="text-muted-foreground"
              style={{ opacity: 0.4 + progress * 0.6 }}
            >
              <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        <span className="text-[10px] tracking-widest text-muted-foreground">
          {isRefreshing
            ? "SYNCING..."
            : phase === "ready"
            ? "RELEASE"
            : "PULL TO REFRESH"}
        </span>
      </div>
    </div>
  );
}
