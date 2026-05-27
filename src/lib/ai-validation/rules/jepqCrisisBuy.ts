import { hasNegationNearby, snippetAround, type Detector, type Violation } from "./types";

/**
 * Detects suggestions to fund crisis/exit-style trades from QQQI, or to
 * convert QQQI directly into QLD/TQQQ.
 *
 * Rulebook v4.5.0: QQQI is legacy/inert. Detector kept active so historical
 * old-rule-shaped suggestions still surface as regressions.
 */
const QQQI_PATTERNS: readonly RegExp[] = [
  /(?:위기|crisis|T1|T2)\b.{0,40}\bQQQI\b.{0,30}(?:매도|sell|자금|소스|source|fund)/i,
  /\bQQQI\b.{0,30}(?:QLD|TQQQ|SGOV).{0,15}매수/i,
  /\bQQQI\b.{0,15}(?:매도|sell).{0,15}(?:QLD|TQQQ|SGOV)/i,
];

export const detectJepqCrisisBuy: Detector = (text) => {
  for (const re of QQQI_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    const v: Violation = {
      code: "QQQI_CRISIS_BUY",
      section: "§G / §6.1 (legacy)",
      reason: "QQQI를 위기 트리거/리밸런스/SGOV 보충 자금원 또는 QLD/TQQQ/SGOV 매수 자금으로 사용하려는 권유 감지 (legacy)",
      snippet: snippetAround(text, matchStart, matchEnd),
    };
    return v;
  }
  return null;
};

/**
 * Detects suggestions to fund crisis/exit-style trades from QQQM, or to
 * convert QQQM directly into QLD/TQQQ.
 *
 * Rulebook v4.5.0 §4 / §6.1: QQQM is legacy hold-only. Crisis / SGOV
 * refill must NEVER use QQQM as funding.
 */
const QQQM_PATTERNS: readonly RegExp[] = [
  /(?:위기|crisis|T1|T2)\b.{0,40}\bQQQM\b.{0,30}(?:매도|sell|자금|소스|source|fund)/i,
  /\bQQQM\b.{0,30}(?:QLD|TQQQ|SGOV).{0,15}매수/i,
  /\bQQQM\b.{0,15}(?:매도|sell).{0,15}(?:QLD|TQQQ|SGOV)/i,
  /(?:Emergency\s*cap|emergency\s*cap|긴급).{0,40}\bQQQM\b.{0,30}(?:매도|sell)/i,
];

export const detectQqqmCrisisBuy: Detector = (text) => {
  for (const re of QQQM_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    const v: Violation = {
      code: "QQQM_CRISIS_BUY",
      section: "§4 / §6.1 (v4.5.0)",
      reason: "QQQM을 위기 트리거/리밸런스/SGOV 보충 자금원 또는 QLD/TQQQ/SGOV 매수 자금으로 사용하려는 권유 감지 (룰북 v4.5.0: QQQM은 hold-only)",
      snippet: snippetAround(text, matchStart, matchEnd),
    };
    return v;
  }
  return null;
};
