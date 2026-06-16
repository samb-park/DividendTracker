"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Persisted, drag-resizable column layout for the terminal.
 *
 * Center column is flexible (minmax(0,1fr)); left/right widths are user-draggable
 * and saved to localStorage (per-browser; single-user deployment = per-user).
 * SSR-safe: defaults render on server + first client paint, saved values applied
 * in an effect afterwards to avoid hydration mismatch. Persistence happens once
 * at drag-end (not per pointer frame), and listeners are cleaned up on
 * pointercancel and on unmount-mid-drag.
 */

const KEY = "snapterminal-layout-v1";

export const DEFAULT_LEFT = 210;
export const DEFAULT_RIGHT = 290;
const LEFT_MIN = 150;
const LEFT_MAX = 420;
const RIGHT_MIN = 200;
const RIGHT_MAX = 520;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function save(leftW: number, rightW: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ leftW, rightW }));
  } catch {
    /* ignore quota/availability errors */
  }
}

export interface PanelLayout {
  leftW: number;
  rightW: number;
  hydrated: boolean;
  startResize: (edge: "left" | "right") => (e: React.PointerEvent) => void;
  reset: () => void;
}

export function usePanelLayout(): PanelLayout {
  const [leftW, setLeftW] = useState(DEFAULT_LEFT);
  const [rightW, setRightW] = useState(DEFAULT_RIGHT);
  const [hydrated, setHydrated] = useState(false);
  // Holds the active drag's teardown so we can run it on unmount-mid-drag.
  const activeEndRef = useRef<null | (() => void)>(null);

  // Load saved layout once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { leftW?: number; rightW?: number };
        if (typeof parsed.leftW === "number") setLeftW(clamp(parsed.leftW, LEFT_MIN, LEFT_MAX));
        if (typeof parsed.rightW === "number") setRightW(clamp(parsed.rightW, RIGHT_MIN, RIGHT_MAX));
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  // Safety net: if the component unmounts mid-drag, tear the drag down.
  useEffect(() => () => activeEndRef.current?.(), []);

  const startResize = useCallback(
    (edge: "left" | "right") => (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startLeft = leftW;
      const startRight = rightW;
      let finalLeft = startLeft;
      let finalRight = startRight;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        if (edge === "left") {
          finalLeft = clamp(startLeft + dx, LEFT_MIN, LEFT_MAX);
          setLeftW(finalLeft);
        } else {
          finalRight = clamp(startRight - dx, RIGHT_MIN, RIGHT_MAX);
          setRightW(finalRight);
        }
      };
      const end = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        activeEndRef.current = null;
        save(finalLeft, finalRight); // persist once, at drag end
      };

      activeEndRef.current = end;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [leftW, rightW]
  );

  const reset = useCallback(() => {
    setLeftW(DEFAULT_LEFT);
    setRightW(DEFAULT_RIGHT);
    save(DEFAULT_LEFT, DEFAULT_RIGHT);
  }, []);

  return { leftW, rightW, hydrated, startResize, reset };
}
