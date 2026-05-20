import { hasNegationNearby, snippetAround, type Detector, type Violation } from "./types";

/**
 * Detects "SCHD 매도" / "SCHD를 매도" / "sell SCHD" / "SCHD 판매" recommendations.
 *
 * Suppressed when a negation phrase appears within the lookahead window
 * (e.g. "SCHD 매도 금지", "SCHD를 매도하지 마세요").
 *
 * Rulebook §15 (v4.3.1): SCHD is never sold in static 70/30 / Crisis / Hard Exit.
 * The only exception is RRSP meltdown distributions (§11) — those use
 * portfolio withdrawals, not the word "매도".
 *
 * Two pattern shapes:
 *  - Korean: SCHD followed within ~15 chars by 매도 / 판매 (covers
 *    "SCHD를 매도", "SCHD 30%를 매도", "SCHD 매도").
 *  - English: an explicit selling verb followed by SCHD ("sell SCHD",
 *    "selling SCHD", "sold SCHD").
 */
const SCHD_SELL_PATTERNS: readonly RegExp[] = [
  /SCHD\b.{0,15}(?:매도|판매)/i,
  /\b(?:sell|selling|sold)\s+SCHD\b/i,
];

export const detectSchdSell: Detector = (text) => {
  for (const re of SCHD_SELL_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    const v: Violation = {
      code: "SCHD_SELL",
      section: "§15 / §F",
      reason: "SCHD 매도 권유 감지 (룰북 §15: SCHD 절대 매도 금지)",
      snippet: snippetAround(text, matchStart, matchEnd),
    };
    return v;
  }
  return null;
};
