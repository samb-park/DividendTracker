/** Server-side helpers for /pocket ticker groups ("포트폴리오"). */
import type { PocketGroup } from "@/lib/pocket-types";

export const MAX_GROUP_NAME = 40;
export const MAX_GROUPS = 50;
export const MAX_TICKERS_PER_GROUP = 200;

/** Account types a group may be scoped to (matches Prisma AccountType enum). */
export const VALID_ACCOUNT_TYPES = ["TFSA", "RRSP", "FHSA", "NON_REG", "CASH"] as const;

/** Keep only valid, de-duplicated account types (uppercased). Empty = all. */
export function sanitizeAccounts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const a = v.trim().toUpperCase();
    if (!(VALID_ACCOUNT_TYPES as readonly string[]).includes(a) || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

/** Validate a hex color string ("#rrggbb"); anything else → null. */
export function sanitizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

/** Keep a short emoji/label icon (≤ 8 chars); empty or oversized → null. */
export function sanitizeIcon(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v && v.length <= 8 ? v : null;
}

/** Normalize an arbitrary JSON value into a clean, de-duplicated ticker list. */
export function sanitizeTickers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const t = v.trim().toUpperCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TICKERS_PER_GROUP) break;
  }
  return out;
}

/** Shape a Prisma PocketGroup row into the client-facing payload. */
export function serializeGroup(g: {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  accounts: string[];
  tickers: string[];
  sortOrder: number;
}): PocketGroup {
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    icon: g.icon,
    accounts: g.accounts,
    tickers: g.tickers,
    sortOrder: g.sortOrder,
  };
}
