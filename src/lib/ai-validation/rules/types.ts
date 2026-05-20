/**
 * Shared types and helpers for AI-output semantic validation rules.
 *
 * Pure module: no Prisma, no fetch, no logger, no side effects.
 * Each detector is a `(text: string) => Violation | null` function.
 */

export type ViolationCode =
  | "SCHD_SELL"
  | "QQQI_CRISIS_BUY"
  | "LEGACY_INCOME_TICKER"
  | "QQQI_CAP_WARNING"
  | "QQQI_AUTO_ROUTING"
  | "QQQI_FUNDED_BY_CORE_SALE"
  | "SGOV_RETURN_ASSET"
  | "OPTIMISTIC_SCENARIO"
  | "NDX_TRIGGER"
  | "QLD_WRONG_BASIS"
  | "QQQI_FIXED_TARGET"
  | "AUTO_TRADE_LANGUAGE";

export interface Violation {
  code: ViolationCode;
  /** Rulebook section reference (e.g. "§15", "§6.1"). */
  section: string;
  /** Human-readable Korean description for logging / dashboards. */
  reason: string;
  /** Matched / surrounding text snippet (truncated). Optional. */
  snippet?: string;
}

export type Detector = (text: string) => Violation | null;

/**
 * Negation tokens that, when found in a small window AFTER the candidate
 * match, suppress the violation. Covers the user-listed false-positive
 * shapes plus common Korean / English negation phrasing.
 *
 * Examples that should suppress:
 *   "SCHD 매도 금지"              → 금지
 *   "SCHD를 매도하지 마세요"      → 하지 마 / 하지 마세요
 *   "낙관 시나리오는 사용하지 않음" → 하지 않 / 않음
 *   "NDX 기반 트리거 금지"        → 금지
 *   "자동 매수 안 함"              → 안 함
 */
export const NEGATION_REGEX =
  /금지|불가|안\s*돼|안\s*됨|안\s*함|하지\s*(?:마|않)|절대\s*(?:안|금지|불가)|불허|않(?:음|습|는|아|다|기)|배제|prohibited|forbidden|not\s+allowed|never\s+(?:do|buy|sell|use)|do\s+not|don['']?t/i;

/**
 * Check whether a negation phrase appears within `windowChars` characters
 * after the matched span. Defaults to 30 chars (covers the documented
 * false-positive cases without bleeding into unrelated sentences).
 */
export function hasNegationNearby(
  text: string,
  matchStart: number,
  matchEnd: number,
  windowChars = 30,
): boolean {
  const after = text.slice(matchEnd, Math.min(text.length, matchEnd + windowChars));
  return NEGATION_REGEX.test(after);
}

/** Extract a short snippet around a match for audit-log readability. */
export function snippetAround(
  text: string,
  matchStart: number,
  matchEnd: number,
  padding = 20,
): string {
  const start = Math.max(0, matchStart - padding);
  const end = Math.min(text.length, matchEnd + padding);
  return text.slice(start, end).trim();
}
