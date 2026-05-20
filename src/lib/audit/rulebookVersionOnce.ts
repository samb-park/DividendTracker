/**
 * Process-level memoised wrapper around ensureRulebookVersion().
 *
 * Designed for fire-and-forget use at the top of AI routes:
 *   void ensureCurrentRulebookVersion();
 *
 * The first caller in a given Node process triggers the underlying DB upsert
 * (so the RulebookVersion table reflects the current guardrail blob hash).
 * Subsequent callers receive the cached promise — no extra DB round-trip.
 *
 * On failure the cache is cleared so the next call will retry. This keeps the
 * hot path zero-cost while still recovering from transient DB hiccups when
 * the process is long-lived.
 */
import { createHash } from "node:crypto";

import { ensureRulebookVersion } from "@/lib/audit/rulebookVersion";
import { log } from "@/lib/logger";
import {
  AI_OUTPUT_RULES,
  BRIEFING_STRUCTURE,
  INSIGHT_STRUCTURE,
  PROJECTION_STRUCTURE,
  RULEBOOK_GUARDRAILS,
  RULEBOOK_PROMPT_VERSION,
} from "@/lib/ai-output-rules";

let inflight: Promise<void> | null = null;

/**
 * Stable promptHash across process restarts. Concatenates the five guardrail
 * constants in a fixed order, separated by a sentinel string that cannot
 * appear inside any of the inputs.
 */
function computePromptHash(): string {
  const SEP = "\n---rulebookVersionOnce---\n";
  const blob = [
    RULEBOOK_GUARDRAILS,
    AI_OUTPUT_RULES,
    BRIEFING_STRUCTURE,
    INSIGHT_STRUCTURE,
    PROJECTION_STRUCTURE,
  ].join(SEP);
  return createHash("sha256").update(blob).digest("hex");
}

export function ensureCurrentRulebookVersion(): Promise<void> {
  if (inflight) return inflight;

  const promptHash = computePromptHash();
  const started = Date.now();

  inflight = ensureRulebookVersion({
    version: RULEBOOK_PROMPT_VERSION,
    promptHash,
    changelog: `Auto-registered by rulebookVersionOnce for ${RULEBOOK_PROMPT_VERSION}`,
  })
    .then((result) => {
      if (!result.ok) {
        // ensureRulebookVersion already swallowed the error; clear the cache
        // so the next caller retries.
        inflight = null;
        log.warn({
          event: "audit.rulebookVersionOnce.upsert_failed_retryable",
          version: RULEBOOK_PROMPT_VERSION,
          durationMs: Date.now() - started,
        });
      } else {
        log.debug({
          event: "audit.rulebookVersionOnce.ok",
          version: RULEBOOK_PROMPT_VERSION,
          durationMs: Date.now() - started,
        });
      }
      return undefined;
    })
    .catch((err: unknown) => {
      // Defensive: ensureRulebookVersion is already non-throwing, but if it
      // ever changed that contract this catch keeps the route from crashing.
      inflight = null;
      log.error({
        event: "audit.rulebookVersionOnce.unexpected_error",
        version: RULEBOOK_PROMPT_VERSION,
        durationMs: Date.now() - started,
        err: { message: err instanceof Error ? err.message : String(err) },
      });
    });

  return inflight;
}
