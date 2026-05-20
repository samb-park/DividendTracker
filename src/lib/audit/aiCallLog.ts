/**
 * AiCallLog audit helper.
 *
 * Records a single immutable row in AiCallLog summarising one AI call. Wired
 * by the AI routes (and only by them) right before returning to the user.
 *
 * Storage policy:
 *  - rawResponse  : only stored when env AI_AUDIT_STORE_RAW=true. Still passed
 *                   through redactString() defensively.
 *  - sanitizedResponse / errorMessage : always passed through redactString().
 *  - userQuery raw text : NEVER accepted. Callers must hash with a user-
 *                         specific salt and pass userQueryHash (chat routes
 *                         only). Non-chat routes leave it null.
 *
 * Audit-disabled (AI_AUDIT_ENABLED=false) and DB-failure paths return a
 * non-throwing result so callers never see audit errors.
 */
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { redactString } from "@/lib/audit/redact";

export type AiCallStatus =
  | "ok"
  | "throttled"
  | "auth_error"
  | "upstream_error"
  | "validation_rejected"
  | (string & {});

export interface RecordAiCallInput {
  /** Soft reference; no FK. cuid from session.user.id. */
  userId: string;
  /** Route key, e.g. "ai/briefing", "ai/insights", "ai/chat". */
  route: string;
  provider: string;
  model: string;
  /** RULEBOOK_PROMPT_VERSION snapshot at the time of this call. */
  rulebookVersion: string;
  /** sha256(systemPrompt). Detects unannounced guardrail edits. */
  systemPromptHash: string;
  /** Chat-only. NEVER raw text. NULL for briefing/insights/projection/news. */
  userQueryHash?: string | null;
  contextSizeChars?: number | null;
  cached?: boolean;
  status: AiCallStatus;
  httpStatus: number;
  durationMs: number;
  upstreamDurationMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  /** Raw upstream payload, pre-sanitize. Stored only when AI_AUDIT_STORE_RAW=true. */
  rawResponse?: string | null;
  /** Post-sanitize text shown to user. Always redacted defensively before storage. */
  sanitizedResponse?: string | null;
  errorMessage?: string | null;
  // ── Phase 2 semantic-validation fields ────────────────────────────────────
  /** Timestamp when validateAiOutput() ran. NULL when validator was not invoked
   *  (cache-hit / throttled / upstream_error / computation_error). */
  validatedAt?: Date | null;
  /** "pass" | "violation". NULL when validator was not invoked. */
  validationStatus?: string | null;
  /** Array of detected ViolationCode strings. Empty when pass or not run. */
  violationCodes?: string[];
}

export interface RecordAiCallResult {
  ok: boolean;
  id: string | null;
}

function isAuditEnabled(): boolean {
  return process.env.AI_AUDIT_ENABLED !== "false";
}

function isStoreRawEnabled(): boolean {
  return process.env.AI_AUDIT_STORE_RAW === "true";
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

export async function recordAiCall(
  input: RecordAiCallInput,
): Promise<RecordAiCallResult> {
  if (!isAuditEnabled()) {
    log.debug({
      event: "audit.aiCallLog.disabled",
      route: input.route,
      userId: input.userId,
    });
    return { ok: true, id: null };
  }

  const started = Date.now();
  try {
    const storeRaw = isStoreRawEnabled();
    const rawForStorage =
      storeRaw && input.rawResponse ? redactString(input.rawResponse) : null;
    const sanitizedForStorage = input.sanitizedResponse
      ? redactString(input.sanitizedResponse)
      : null;
    const errorForStorage = input.errorMessage
      ? redactString(input.errorMessage)
      : null;

    const row = await prisma.aiCallLog.create({
      data: {
        userId: input.userId,
        route: input.route,
        provider: input.provider,
        model: input.model,
        rulebookVersion: input.rulebookVersion,
        systemPromptHash: input.systemPromptHash,
        userQueryHash: input.userQueryHash ?? null,
        contextSizeChars: input.contextSizeChars ?? null,
        cached: input.cached ?? false,
        status: input.status,
        httpStatus: input.httpStatus,
        durationMs: input.durationMs,
        upstreamDurationMs: input.upstreamDurationMs ?? null,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        totalTokens: input.totalTokens ?? null,
        rawResponse: rawForStorage,
        sanitizedResponse: sanitizedForStorage,
        errorMessage: errorForStorage,
        // Phase 2 — semantic validation fields. Callers that did not invoke
        // validateAiOutput() leave these undefined; we fall back to NULL /
        // empty-array so the column NOT-NULL constraints (violationCodes)
        // are satisfied without forcing each caller to pass them.
        validatedAt: input.validatedAt ?? null,
        validationStatus: input.validationStatus ?? null,
        violationCodes: input.violationCodes ?? [],
      },
      select: { id: true },
    });

    log.info({
      event: "audit.aiCallLog.recorded",
      route: input.route,
      userId: input.userId,
      status: input.status,
      cached: input.cached ?? false,
      callLogId: row.id,
      durationMs: Date.now() - started,
    });
    return { ok: true, id: row.id };
  } catch (err) {
    log.error({
      event: "audit.aiCallLog.failed",
      route: input.route,
      userId: input.userId,
      durationMs: Date.now() - started,
      err: serializeError(err),
    });
    return { ok: false, id: null };
  }
}
