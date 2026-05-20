/**
 * Defensive secret redactor.
 *
 * Used by the structured logger (and, later, audit DB writers) to scrub
 * credential-shaped substrings before they reach stdout, stderr, or
 * persistent storage. Pure, deterministic, non-mutating.
 *
 * Scope: defence-in-depth only. It is NOT a substitute for keeping secrets
 * out of code in the first place. Patterns are intentionally conservative
 * (length-gated, prefix-anchored) to avoid stripping legitimate text.
 */

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 16;

type Rule = { readonly pattern: RegExp; readonly replace: string };

/**
 * Token-shape patterns. Each rule keeps a short identifying prefix so logs
 * remain debuggable while withholding the secret payload itself.
 */
const TOKEN_RULES: readonly Rule[] = [
  // HTTP "Bearer xxxxx" (Authorization header style)
  { pattern: /\bBearer\s+[A-Za-z0-9._\-+/]+=*/g, replace: `Bearer ${REDACTED}` },
  // Hermes API key prefix "hdt_..."
  { pattern: /\bhdt_[A-Za-z0-9]{8,}/g, replace: `hdt_${REDACTED}` },
  // OpenAI / Anthropic-style "sk-..." keys (length-gated to avoid false positives)
  { pattern: /\bsk-[A-Za-z0-9_\-]{20,}/g, replace: `sk-${REDACTED}` },
  // JWTs: header.payload.signature anchored on the well-known "eyJ" header prefix
  {
    pattern: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
    replace: `eyJ${REDACTED}`,
  },
  // GitHub fine-grained Personal Access Token
  { pattern: /\bghp_[A-Za-z0-9]{30,}/g, replace: `ghp_${REDACTED}` },
  // AWS Access Key ID (well-defined shape)
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replace: `AKIA${REDACTED}` },
  // Slack bot token
  { pattern: /\bxoxb-[A-Za-z0-9\-]{10,}/g, replace: `xoxb-${REDACTED}` },
];

/**
 * Generic "key=value" / "key: value" patterns where the field name strongly
 * implies a secret. Matched case-insensitively. The right-hand side may be
 * quoted or whitespace-delimited.
 */
const KV_RULES: readonly Rule[] = [
  {
    pattern:
      /\b(api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|secret|password|passwd|pwd|client[_-]?secret)\b(\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|\S+)/gi,
    replace: `$1$2${REDACTED}`,
  },
];

/** Apply all redaction rules to a single string. */
export function redactString(input: string): string {
  if (!input) return input;
  let out = input;
  for (const rule of TOKEN_RULES) {
    out = out.replace(rule.pattern, rule.replace);
  }
  for (const rule of KV_RULES) {
    out = out.replace(rule.pattern, rule.replace);
  }
  return out;
}

/**
 * Field-name allowlist for hard mask. If a structured-object key matches one
 * of these exactly, its value is replaced wholesale regardless of shape.
 * Case-sensitive on purpose: environment-variable style names (UPPER_SNAKE)
 * and JS-style camelCase are listed explicitly.
 */
const SENSITIVE_FIELD_NAMES: ReadonlySet<string> = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "client_secret",
  "clientSecret",
  "api_key",
  "apiKey",
  "apikey",
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "auth_token",
  "authToken",
  "authorization",
  "Authorization",
  "DATABASE_URL",
  "database_url",
  "databaseUrl",
  "TELEGRAM_BOT_TOKEN",
  "telegram_bot_token",
  "HERMES_API_KEY",
  "hermes_api_key",
  "HERMES_GATEWAY_TOKEN",
  "CRON_SECRET",
  "cron_secret",
  "AUTH_SECRET",
  "auth_secret",
  "QT_ENCRYPTION_KEY",
  "qt_encryption_key",
  "AUTH_GOOGLE_SECRET",
  "auth_google_secret",
  "MINIMAX_API_KEY",
  "KIMI_API_KEY",
  "GITHUB_TOKEN",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "N8N_API_KEY",
  "N8N_BASIC_AUTH_PASSWORD",
  "HASS_TOKEN",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Recursively redact strings inside arbitrary structured input.
 *
 * - Returns a *new* copy; never mutates the input.
 * - Non-plain objects (Date, Map, Set, Buffer, class instances, functions, …)
 *   are passed through unchanged so caller invariants are preserved.
 * - Recursion is depth-bounded ({@link MAX_DEPTH}) so pathological inputs
 *   cannot blow the stack.
 */
export function redact<T>(value: T): T {
  return redactInternal(value, 0) as T;
}

function redactInternal(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return value;
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return redactString(value);
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactInternal(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_FIELD_NAMES.has(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redactInternal(v, depth + 1);
      }
    }
    return out;
  }

  // Date, Map, Set, RegExp, Buffer, class instance, function, symbol, … —
  // pass through unchanged so callers do not see surprise shape mutations.
  return value;
}
