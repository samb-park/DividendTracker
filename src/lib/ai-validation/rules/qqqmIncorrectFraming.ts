import { hasNegationNearby, snippetAround, type Detector, type Violation } from "./types";

/**
 * Detects framing of QQQI 5% as a fixed target rather than a hard cap.
 *
 * Rulebook v4.5.1 keeps QQQI as inert legacy (no new BUY). This detector
 * remains in service for historical AI-output regression checks: any
 * statement that treats QQQI's old 5% cap as a fill-to-target or persistent
 * goal is still a old-rule violation that must be flagged.
 */
const QQQI_PATTERNS: readonly RegExp[] = [
  /\bQQQI\b.{0,30}5\s*%\s*(?:목표|target|fixed|고정)/i,
  /\bQQQI\b.{0,15}5\s*%.{0,20}(?:맞춤|채움|항상|유지|채워)/,
  /\bQQQI\b.{0,15}고정\s*5\s*%/,
  /\bQQQI\b.{0,15}always\s*5\s*%/i,
];

export const detectJepqFixedTarget: Detector = (text) => {
  for (const re of QQQI_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    const v: Violation = {
      code: "QQQI_FIXED_TARGET",
      section: "§G / §4 (legacy)",
      reason: "QQQI 5%를 고정 target으로 취급 (룰북 v4.5.1: QQQI는 inert legacy, 신규 매수 금지; v4.4.2 hard cap framing 잔존)",
      snippet: snippetAround(text, matchStart, matchEnd),
    };
    return v;
  }
  return null;
};

/**
 * Detects incorrect framing of QQQM:
 *   - any "QQQM 5%" cap/target/limit phrasing (QQQM has NO cap in v4.5.1)
 *   - any "QQQM 고정 N%" / "fill-to" / "hard cap N%" suggestions
 *
 * Rulebook v4.5.1 §4: QQQM is legacy hold-only. No cap/target,
 * new buy, quarterly profit-taking, 12/31 skim, or discretionary sell.
 */
const QQQM_INCORRECT_FRAMING_PATTERNS: readonly RegExp[] = [
  // QQQM cap / target / limit (no such concept in v4.5.1)
  /\bQQQM\b.{0,30}5\s*%\s*(?:cap|상한|목표|target|fixed|고정|limit)/i,
  /\bQQQM\b.{0,15}고정\s*\d{1,2}\s*%/,
  /\bQQQM\b.{0,30}(?:hard\s*cap|상한)\s*\d{1,2}\s*%/i,
  /\bQQQM\b.{0,30}\d{1,2}\s*%.{0,20}(?:채워|maintain|fill\s*to)/i,
];

export const detectQqqmIncorrectFraming: Detector = (text) => {
  for (const re of QQQM_INCORRECT_FRAMING_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    return {
      code: "QQQM_INCORRECT_FRAMING",
      section: "§4 (v4.5.1)",
      reason: "QQQM에 cap/fixed-target 프레이밍 감지 (룰북 v4.5.1: QQQM은 hold-only이며 신규 매수/skim/target/cap 없음)",
      snippet: snippetAround(text, matchStart, matchEnd),
    } satisfies Violation;
  }
  return null;
};

/**
 * Detects QQQM quarterly profit-taking / discretionary sell suggestions.
 * v4.5.1 removed annual 12/31 skim; QQQM is hold-only.
 */
const QQQM_QUARTERLY_PROFIT_PATTERNS: readonly RegExp[] = [
  /\bQQQM\b.{0,30}(?:분기|quarterly|3\s*개월|매분기)\s*.{0,15}(?:매도|sell|차익|profit)/i,
  /\bQQQM\b.{0,30}(?:차익실현|profit\s*taking|take\s*profit)/i,
  /(?:차익실현|profit\s*taking|take\s*profit).{0,30}\bQQQM\b/i,
];

export const detectQqqmQuarterlyProfitTaking: Detector = (text) => {
  for (const re of QQQM_QUARTERLY_PROFIT_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    return {
      code: "QQQM_QUARTERLY_PROFIT_TAKING",
      section: "§4 (v4.5.1)",
      reason: "QQQM 분기 매도 / 차익실현 권유 감지 (룰북 v4.5.1: QQQM은 hold-only이며 신규 매수/skim/매도 권유 금지)",
      snippet: snippetAround(text, matchStart, matchEnd),
    } satisfies Violation;
  }
  return null;
};
