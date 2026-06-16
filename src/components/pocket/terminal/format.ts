/** Ported from the MDD app (frontend/src/lib/format.ts) — formatting helpers for
 *  the /pocket terminal components. Wire convention: *_pct fields are PERCENT
 *  UNITS (-18.2 = -18.2%). */

export function fmtPct(v: number | null | undefined, opts?: { dp?: number; sign?: boolean }): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const dp = opts?.dp ?? 1;
  const sign = opts?.sign && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(dp)}%`;
}

export function fmtUsd(v: number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function fmtUsdCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${(v / 1_000).toFixed(1)}K`;
  return fmtUsd(v);
}

export function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Sign-colored P&L class (Tailwind tokens defined in tailwind.config). */
export function pnlClass(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "text-text-mid";
  if (v > 0) return "text-pos";
  if (v < 0) return "text-neg";
  return "text-text-mid";
}
