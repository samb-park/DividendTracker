import { hasNegationNearby, snippetAround, type Detector, type Violation } from "./types";

/**
 * Detects automatic-trade execution language.
 *
 * Principle (advisory-only): the system never executes trades. AI output
 * must not imply the system itself will place orders. Phrasing like
 * "자동 매수 주문이 실행됩니다" or "automatically buy" is prohibited
 * regardless of the rulebook section.
 *
 * False-positive guard: "자동 매수 금지" or "자동 매수 안 함" pass via
 * the shared negation check.
 */
const PATTERNS: readonly RegExp[] = [
  /자동\s*(?:매수|매도|주문|체결|실행|거래)/,
  /auto[-\s]?(?:execute|trade|buy|sell)\b/i,
  /automatically\s*(?:buy|sell|order|execute|place)/i,
  /will\s+(?:buy|sell)\s+(?:automatically|on\s+your\s+behalf)/i,
];

export const detectAutoTradeLanguage: Detector = (text) => {
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    const v: Violation = {
      code: "AUTO_TRADE_LANGUAGE",
      section: "advisory-only",
      reason: "자동 거래 실행 언어 감지 (시스템은 advisory only — 자동 매수/매도 금지)",
      snippet: snippetAround(text, matchStart, matchEnd),
    };
    return v;
  }
  return null;
};
