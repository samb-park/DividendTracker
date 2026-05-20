/**
 * Semantic validator for AI route output.
 *
 * Phase 2 — Slice 2.1: pure helper + types only. Routes do not yet wire
 * this function in. It is intentionally a pure function with no Prisma /
 * fetch / logger / side effects so it can be unit-tested in isolation
 * and called from any route boundary without ordering hazards.
 *
 * Validation runs over the *sanitised* text (after sanitizeAiOutput) so
 * markdown noise and leaked DB field names do not produce false positives.
 * Detectors are conservative — each one suppresses on negation phrases in
 * a short window after the match.
 */
import { detectAutoTradeLanguage } from "./rules/autoTradeLanguage";
import { detectJepqCrisisBuy } from "./rules/jepqCrisisBuy";
import { detectJepqFixedTarget } from "./rules/jepqFixedTarget";
import { detectNdxTrigger } from "./rules/ndxTrigger";
import { detectOptimisticScenario } from "./rules/optimisticScenario";
import { detectQldWrongBasis } from "./rules/qldWrongBasis";
import { detectQqqiAutoRouting, detectQqqiCapWarning, detectQqqiFundedByCoreSale, detectLegacyIncomeTicker } from "./rules/qqqiRuleViolations";
import { detectSchdSell } from "./rules/schdSell";
import { detectSgovReturnAsset } from "./rules/sgovReturnAsset";
import type { Detector, Violation, ViolationCode } from "./rules/types";

export type { Violation, ViolationCode };

export interface ValidationContext {
  /** Active rulebook version (e.g. "v4.1.10-3"). Reserved for future per-version rule sets. */
  rulebookVersion?: string;
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
}

/**
 * Detector registry. Order is reproducible — when multiple detectors fire
 * on the same input the resulting `violations` array reflects this order,
 * which keeps dashboards and tests deterministic.
 */
const DETECTORS: readonly Detector[] = [
  detectLegacyIncomeTicker,
  detectSchdSell,
  detectJepqCrisisBuy,
  detectQqqiCapWarning,
  detectQqqiAutoRouting,
  detectQqqiFundedByCoreSale,
  detectSgovReturnAsset,
  detectOptimisticScenario,
  detectNdxTrigger,
  detectQldWrongBasis,
  detectJepqFixedTarget,
  detectAutoTradeLanguage,
];

/**
 * Run every detector against the sanitised AI output. Returns a
 * `ValidationResult` with `ok=true` only when no detector matched.
 *
 * @param route       Route identifier (e.g. "ai/briefing"). Reserved for
 *                    future per-route rule sets; not used in Phase 2.1.
 * @param raw         Pre-sanitize LLM content. Reserved for future
 *                    cross-checks; not used in Phase 2.1.
 * @param sanitized   Output of sanitizeAiOutput(raw). This is what the
 *                    user actually sees and what the detectors inspect.
 * @param context     Reserved for future rulebook-version-aware rules.
 */
export function validateAiOutput(
  route: string,
  raw: string,
  sanitized: string,
  context?: ValidationContext,
): ValidationResult {
  // Intentionally unused in Phase 2.1; the signature is stabilised now so
  // route wiring in Phase 2.2+ does not need a breaking change later.
  void route;
  void raw;
  void context;

  if (!sanitized) return { ok: true, violations: [] };

  const violations: Violation[] = [];
  for (const detect of DETECTORS) {
    const v = detect(sanitized);
    if (v) violations.push(v);
  }
  return { ok: violations.length === 0, violations };
}
