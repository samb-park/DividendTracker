"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: string;
  titleRight?: React.ReactNode;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRetry?: () => void;
  collapsible?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/** Ported from MDD terminal/Panel — hairline-bordered block with a 28px header
 *  bar (raised bg, tiny ALL-CAPS tracked muted title + titleRight controls).
 *  Skeleton inlined (no shadcn dep). */
export function Panel({
  title,
  titleRight,
  loading,
  stale,
  error,
  onRetry,
  collapsible,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <section className={cn("flex min-w-0 flex-col border border-hairline bg-panel", className)}>
      <header
        className={cn(
          "flex h-7 shrink-0 items-center justify-between gap-2 border-b border-hairline bg-panel-header px-2 pointer-coarse:h-9",
          collapsible && "cursor-pointer select-none lg:cursor-default",
        )}
        onClick={collapsible ? () => setCollapsed((c) => !c) : undefined}
      >
        <span className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-text-mid">
          {title}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {stale && !loading && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-warn">recomputing…</span>
          )}
          {titleRight}
        </span>
      </header>
      {!collapsed && (
        <div className={cn("min-h-0 flex-1 p-2", stale && "opacity-60 transition-opacity", bodyClassName)}>
          {error ? (
            <div className="flex h-full min-h-16 flex-col items-center justify-center gap-2">
              <span className="font-mono text-xs text-neg">ERR — {error}</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="border border-border-bright px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-text-mid hover:bg-panel-header hover:text-text-hi"
                >
                  Retry
                </button>
              )}
            </div>
          ) : loading ? (
            <div className="space-y-1.5">
              <div className="h-5 w-2/3 animate-pulse bg-inset" />
              <div className="h-5 w-full animate-pulse bg-inset" />
              <div className="h-5 w-5/6 animate-pulse bg-inset" />
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}
