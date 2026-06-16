"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, KeyRound, Inbox, Clock } from "lucide-react";

/**
 * Honest data-state primitives for the terminal.
 *
 * RULE: a panel with no real data source must NEVER show fabricated numbers.
 * It renders one of these states instead. The SnapTerminal mockup's
 * Level II / Options Flow / Vol Surface numbers are illustrative fakes and
 * are intentionally NOT reproduced.
 */

export type PanelStateKind = "loading" | "delayed" | "api_required" | "no_data" | "error";

const META: Record<
  PanelStateKind,
  { label: string; Icon: typeof AlertTriangle; tone: string }
> = {
  loading: { label: "불러오는 중", Icon: Loader2, tone: "text-muted-foreground" },
  delayed: { label: "지연 데이터", Icon: Clock, tone: "text-accent" },
  api_required: { label: "API 필요", Icon: KeyRound, tone: "text-accent" },
  no_data: { label: "데이터 없음", Icon: Inbox, tone: "text-muted-foreground" },
  error: { label: "오류", Icon: AlertTriangle, tone: "text-destructive" },
};

export function PanelEmpty({
  kind,
  message,
  className,
}: {
  kind: PanelStateKind;
  message?: string;
  className?: string;
}) {
  const { label, Icon, tone } = META[kind];
  return (
    <div
      className={cn(
        "flex h-full min-h-[80px] flex-col items-center justify-center gap-1.5 px-3 py-6 text-center",
        className
      )}
    >
      <Icon
        size={18}
        strokeWidth={1.5}
        className={cn(tone, kind === "loading" && "animate-spin")}
      />
      <div className={cn("text-[11px] font-semibold uppercase tracking-wide", tone)}>{label}</div>
      {message && (
        <div className="max-w-[240px] text-[10px] leading-relaxed text-muted-foreground">
          {message}
        </div>
      )}
    </div>
  );
}

/** Small inline badge for labelling a panel's data freshness/source. */
export function DataBadge({
  kind,
  label,
  className,
}: {
  kind: PanelStateKind;
  label?: string;
  className?: string;
}) {
  const meta = META[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        meta.tone,
        className
      )}
    >
      <meta.Icon size={9} strokeWidth={2} className={cn(kind === "loading" && "animate-spin")} />
      {label ?? meta.label}
    </span>
  );
}
