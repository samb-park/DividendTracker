import { hasNegationNearby, snippetAround, type Detector, type Violation } from "./types";

/**
 * Detects language that treats SGOV as a return-maximizing / yield-chasing
 * asset rather than a reserve.
 *
 * Rulebook §G: SGOV is the rulebook's reserve asset. It is not a vehicle
 * for return maximization. Phrases like "SGOV의 yield를 극대화" or
 * "SGOV를 return-maximizing asset으로" are forbidden.
 *
 * Reporting SGOV's actual yield (e.g. "SGOV 수익률 4%") is fine and not
 * matched here — the rules require both a yield/return keyword AND a
 * maximization / core-asset framing keyword within a short window.
 */
const PATTERNS: readonly RegExp[] = [
  /\bSGOV\b.{0,30}(?:수익|return|yield|profit)\b.{0,20}(?:극대화|maximi[sz]e|증대|중심|core\s*asset)/i,
  /\bSGOV\b.{0,15}(?:수익\s*자산|return[-\s]?maximizing|return\s*asset)/i,
];

export const detectSgovReturnAsset: Detector = (text) => {
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    const v: Violation = {
      code: "SGOV_RETURN_ASSET",
      section: "§G / §8",
      reason: "SGOV을 수익 극대화 자산으로 취급하는 표현 감지 (룰북 §8: SGOV는 예비자산)",
      snippet: snippetAround(text, matchStart, matchEnd),
    };
    return v;
  }
  return null;
};
