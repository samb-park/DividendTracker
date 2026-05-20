// Per-user per-minute safety-net throttle for AI routes.
// In-memory sliding window. Fine for a single-instance homelab deployment;
// would need Redis or similar if horizontally scaled.
//
// Purpose: prevent runaway client-side click loops from causing AI cost
// blow-ups. NOT a UX-facing limit — UI does not need to display it. Only
// triggers on abnormal usage.
//
// Override via env: AI_THROTTLE_PER_MINUTE (default 30).

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 30;
const buckets = new Map<string, number[]>();

function limit(): number {
  const env = parseInt(process.env.AI_THROTTLE_PER_MINUTE ?? "", 10);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_LIMIT;
}

export interface ThrottleResult {
  allowed: boolean;
  /** Seconds until the oldest in-window timestamp expires. 0 when allowed. */
  retryAfterSec: number;
  /** Current count inside the window after this attempt. */
  count: number;
  /** Active limit for the window. */
  perMinute: number;
}

export function checkAiThrottle(userId: string): ThrottleResult {
  const now = Date.now();
  const max = limit();
  const arr = buckets.get(userId) ?? [];
  const recent = arr.filter((t) => now - t < WINDOW_MS);

  if (recent.length >= max) {
    const oldest = recent[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    buckets.set(userId, recent);
    return { allowed: false, retryAfterSec, count: recent.length, perMinute: max };
  }

  recent.push(now);
  buckets.set(userId, recent);
  return { allowed: true, retryAfterSec: 0, count: recent.length, perMinute: max };
}

/** Test/admin reset (not exposed via route). */
export function resetAiThrottle(userId?: string): void {
  if (userId) buckets.delete(userId);
  else buckets.clear();
}
