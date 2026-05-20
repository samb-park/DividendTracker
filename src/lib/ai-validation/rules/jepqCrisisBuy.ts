import { hasNegationNearby, snippetAround, type Detector, type Violation } from "./types";

/**
 * Detects suggestions to fund crisis/exit-style trades from QQQI, or to
 * convert QQQI directly into QLD/TQQQ.
 *
 * Rulebook v4.4.2 §G / §6.1: QQQI is a TFSA-only weekly carve-out (§4) with a
 * hard cap of 5%. It must NOT be sold to fund crisis-trigger TQQQ buys
 * (those use SGOV per §6.1), must NOT feed QLD/TQQQ rotations, and must
 * NOT be used as SGOV refill funding.
 */
const PATTERNS: readonly RegExp[] = [
  /(?:위기|crisis|T1|T2)\b.{0,40}\bQQQI\b.{0,30}(?:매도|sell|자금|소스|source|fund)/i,
  /\bQQQI\b.{0,30}(?:QLD|TQQQ|SGOV).{0,15}매수/i,
  /\bQQQI\b.{0,15}(?:매도|sell).{0,15}(?:QLD|TQQQ|SGOV)/i,
];

export const detectJepqCrisisBuy: Detector = (text) => {
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    const v: Violation = {
      code: "QQQI_CRISIS_BUY",
      section: "§G / §6.1",
      reason: "QQQI를 위기 트리거/리밸런스/SGOV 보충 자금원 또는 QLD/TQQQ/SGOV 매수 자금으로 사용하려는 권유 감지",
      snippet: snippetAround(text, matchStart, matchEnd),
    };
    return v;
  }
  return null;
};
