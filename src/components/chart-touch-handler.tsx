"use client";

import { useEffect } from "react";

// Intent detection threshold in px — below this, treat as a tap
const INTENT_THRESHOLD = 10;

export function ChartTouchHandler() {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let intentDetermined = false;
    let isHorizontal = false;
    let pendingZone: Element | null = null;

    const getZone = (el: EventTarget | null): Element | null => {
      if (!el || !(el instanceof Element)) return null;
      return el.closest(".chart-touch-zone");
    };

    const activate = (zone: Element) => {
      document.querySelectorAll(".chart-touch-active").forEach((el) => {
        if (el !== zone) el.classList.remove("chart-touch-active");
      });
      zone.classList.add("chart-touch-active");
    };

    const deactivate = () => {
      document.querySelectorAll(".chart-touch-active").forEach((el) =>
        el.classList.remove("chart-touch-active")
      );
    };

    const onTouchStart = (e: TouchEvent) => {
      const zone = getZone(e.target);
      if (!zone) {
        // Tap outside any chart zone → dismiss
        deactivate();
        pendingZone = null;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      intentDetermined = false;
      isHorizontal = false;
      pendingZone = zone;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pendingZone) return;

      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);

      if (!intentDetermined && (dx > INTENT_THRESHOLD || dy > INTENT_THRESHOLD)) {
        intentDetermined = true;
        isHorizontal = dx > dy;

        if (isHorizontal) {
          // Horizontal drag → scrub mode
          activate(pendingZone);
        } else {
          // Vertical → scroll, don't interfere
          pendingZone = null;
          return;
        }
      }

      if (isHorizontal) {
        // Block page scroll while scrubbing
        e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (pendingZone && !intentDetermined) {
        // Pure tap → toggle
        if (pendingZone.classList.contains("chart-touch-active")) {
          deactivate();
        } else {
          activate(pendingZone);
        }
      }
      pendingZone = null;
      intentDetermined = false;
      isHorizontal = false;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return null;
}
