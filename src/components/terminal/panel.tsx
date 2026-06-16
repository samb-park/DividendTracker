"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dense terminal panel: a thin uppercase title bar with an optional right-side
 * slot, and a scrollable body. Panels never overflow their grid cell — the body
 * scrolls internally so the overall layout is never clipped.
 *
 * When `maximizable`, a button toggles the panel to a fullscreen overlay
 * ("크게 보기"): useful for the chart / portfolio. Esc or the backdrop closes it.
 */
export function Panel({
  title,
  right,
  children,
  className,
  bodyClassName,
  noPadding,
  maximizable,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
  maximizable?: boolean;
}) {
  const [max, setMax] = useState(false);

  useEffect(() => {
    if (!max) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMax(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [max]);

  // Nudge size-aware children (echarts) to reflow when entering/leaving fullscreen.
  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    return () => clearTimeout(id);
  }, [max]);

  const section = (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-sm border bg-card",
        max ? "fixed inset-2 z-50 border-primary/50 shadow-2xl" : "border-border",
        className
      )}
    >
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-secondary/40 px-2 py-1">
        <h2 className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h2>
        <div className="ml-auto flex items-center gap-1.5">
          {right}
          {maximizable && (
            <button
              onClick={() => setMax((m) => !m)}
              aria-label={max ? "패널 축소" : "크게 보기"}
              title={max ? "축소 (Esc)" : "크게 보기"}
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              {max ? <Minimize2 size={12} strokeWidth={1.75} /> : <Maximize2 size={12} strokeWidth={1.75} />}
            </button>
          )}
        </div>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-auto", !noPadding && "p-2", bodyClassName)}>
        {children}
      </div>
    </section>
  );

  if (!max) return section;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setMax(false)} aria-hidden />
      {section}
    </>
  );
}
