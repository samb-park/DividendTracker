/**
 * Structured JSON-line logger.
 *
 * Zero external dependencies. Each call emits exactly one JSON object as a
 * single line on stdout (info / debug) or stderr (warn / error). All record
 * fields are passed through {@link redact} so accidental credential leaks
 * are scrubbed defensively before output.
 *
 * Scope is intentionally minimal: this is a single-instance homelab app, so
 * there are no transports, no batching, no sampling. The harness's `json-file`
 * Docker log driver already provides rotation.
 *
 * Phase 1 — Slice 1.3: this module is created but is NOT yet imported by any
 * existing app code. It will be wired in during a later slice.
 */
import { redact } from "./audit/redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Required shape for every log call. `event` is the only mandatory field; the
 * other named fields are common cross-cutting concerns hoisted into the type
 * for autocompletion and consistent indexing.
 */
export interface LogFields {
  /** Short dotted event identifier, e.g. "ai.call.complete". */
  event: string;
  /** Optional API route ("ai/briefing", "cron/snapshot", ...). */
  route?: string;
  /** Optional user identifier (cuid; not PII on its own). */
  userId?: string;
  /** Optional elapsed time in milliseconds for the logged operation. */
  durationMs?: number;
  /** Optional outcome status ("ok", "throttled", "upstream_error", ...). */
  status?: string;
  /** Arbitrary additional structured fields. */
  [extra: string]: unknown;
}

interface LogRecord extends LogFields {
  level: LogLevel;
  ts: string;
}

function isDebugSuppressed(level: LogLevel): boolean {
  if (level !== "debug") return false;
  return process.env.NODE_ENV === "production";
}

function safeStringify(record: LogRecord): string {
  try {
    return JSON.stringify(record);
  } catch {
    // Fallback for non-serialisable payloads (circular refs, BigInt without
    // replacer, etc.). Surface a minimal record so the failure itself is
    // observable without crashing the caller.
    return JSON.stringify({
      level: record.level,
      ts: record.ts,
      event: record.event,
      err: "logger.serialize_failed",
    });
  }
}

function emit(level: LogLevel, fields: LogFields): void {
  if (isDebugSuppressed(level)) return;

  const record: LogRecord = {
    level,
    ts: new Date().toISOString(),
    ...fields,
  };

  // Defensive redaction — credentials must never reach stdout/stderr.
  const safe = redact(record) as LogRecord;
  const line = safeStringify(safe) + "\n";

  if (level === "warn" || level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

/**
 * The public logger surface. Use the level helpers — never call `emit`
 * directly so the redaction pipeline cannot be bypassed.
 */
export const log = {
  debug: (fields: LogFields): void => emit("debug", fields),
  info: (fields: LogFields): void => emit("info", fields),
  warn: (fields: LogFields): void => emit("warn", fields),
  error: (fields: LogFields): void => emit("error", fields),
} as const;
