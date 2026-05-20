import { hasNegationNearby, snippetAround, type Detector, type Violation } from "./types";

/**
 * Detects framing of QQQI 5% as a fixed target rather than a hard cap.
 *
 * Rulebook v4.4.2 §G / §4: QQQI 5% is a *hard cap* (max allocation). The
 * target slot is 0–5%, not a fixed 5% goal. Weekly 25 CAD carve-out is
 * conditional on (TFSA room AND QQQI < 5%). There is no "fill to 5%" rule.
 */
const PATTERNS: readonly RegExp[] = [
  /\bQQQI\b.{0,30}5\s*%\s*(?:목표|target|fixed|고정)/i,
  /\bQQQI\b.{0,15}5\s*%.{0,20}(?:맞춤|채움|항상|유지|채워)/,
  /\bQQQI\b.{0,15}고정\s*5\s*%/,
  /\bQQQI\b.{0,15}always\s*5\s*%/i,
];

export const detectJepqFixedTarget: Detector = (text) => {
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    const v: Violation = {
      code: "QQQI_FIXED_TARGET",
      section: "§G / §4",
      reason: "QQQI 5%를 고정 target으로 취급 (룰북 §4: 5%는 hard cap이며 target slot은 0-5%)",
      snippet: snippetAround(text, matchStart, matchEnd),
    };
    return v;
  }
  return null;
};
