/**
 * RulebookVersion audit helper.
 *
 * Registers (or refreshes) a row in the RulebookVersion table so that
 * AiCallLog.rulebookVersion has a soft-reference target. Designed to be
 * called once on application boot or when RULEBOOK_PROMPT_VERSION changes.
 *
 * Idempotent: repeated calls with the same {version} are safe and only
 * update the metadata fields. Audit-disabled or DB-failure paths return
 * a non-throwing result so callers never see audit errors.
 */
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

export interface EnsureRulebookVersionInput {
  /** Stable identifier, e.g. "v4.1.10-3" (matches RULEBOOK_PROMPT_VERSION). */
  version: string;
  /** sha256 of (RULEBOOK_GUARDRAILS + AI_OUTPUT_RULES + structure constants). */
  promptHash: string;
  /** Human-readable changelog string for this version. */
  changelog: string;
  /** Defaults to "now" when omitted. */
  effectiveFrom?: Date;
}

export interface EnsureRulebookVersionResult {
  ok: boolean;
  version: string | null;
}

function isAuditEnabled(): boolean {
  return process.env.AI_AUDIT_ENABLED !== "false";
}

function serializeError(err: unknown): {
  message: string;
  name?: string;
  code?: string;
} {
  if (err instanceof Error) {
    const out: { message: string; name?: string; code?: string } = {
      message: err.message,
      name: err.name,
    };
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") out.code = code;
    return out;
  }
  return { message: String(err) };
}

export async function ensureRulebookVersion(
  input: EnsureRulebookVersionInput,
): Promise<EnsureRulebookVersionResult> {
  if (!isAuditEnabled()) {
    log.debug({
      event: "audit.rulebookVersion.disabled",
      version: input.version,
    });
    return { ok: true, version: null };
  }

  const started = Date.now();
  const effectiveFrom = input.effectiveFrom ?? new Date();
  try {
    await prisma.rulebookVersion.upsert({
      where: { version: input.version },
      create: {
        version: input.version,
        promptHash: input.promptHash,
        changelog: input.changelog,
        effectiveFrom,
      },
      update: {
        promptHash: input.promptHash,
        changelog: input.changelog,
        effectiveFrom,
      },
    });
    log.info({
      event: "audit.rulebookVersion.upserted",
      version: input.version,
      durationMs: Date.now() - started,
    });
    return { ok: true, version: input.version };
  } catch (err) {
    log.error({
      event: "audit.rulebookVersion.failed",
      version: input.version,
      durationMs: Date.now() - started,
      err: serializeError(err),
    });
    return { ok: false, version: null };
  }
}
