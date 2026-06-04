"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Dense terminal panel: a thin uppercase title bar with an optional right-side
 * slot, and a scrollable body. Panels never overflow their grid cell — the body
 * scrolls internally so the overall layout is never clipped.
 */
export function Panel({
  title,
  right,
  children,
  className,
  bodyClassName,
  noPadding,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-sm border border-border bg-card",
        className
      )}
    >
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-secondary/40 px-2 py-1">
        <h2 className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h2>
        {right && <div className="ml-auto flex items-center gap-1.5">{right}</div>}
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto",
          !noPadding && "p-2",
          bodyClassName
        )}
      >
        {children}
      </div>
    </section>
  );
}
