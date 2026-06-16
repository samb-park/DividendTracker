"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * MDD-style labeled panel: a hairline-bordered block with a 28px header bar
 * (raised bg, 10px ALL-CAPS tracked muted title + an optional right-side caption).
 * Mirrors MDD's <Panel> so Activity/Settings sections read as terminal panels.
 *
 * bodyClassName:
 *   "flush" — child (a .pk-card / list) owns its own padding
 *   "list"  — row list: 12px gutter, rows divide full-width
 *   (default) 10px padding for free content (e.g. a segmented control)
 */
export function PocketPanel({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("pk-panel", className)}>
      <header className="pk-panel-head">
        <span className="pk-panel-title">{title}</span>
        {right != null && right !== false && <span className="pk-panel-right">{right}</span>}
      </header>
      <div className={cn("pk-panel-body", bodyClassName)}>{children}</div>
    </section>
  );
}
