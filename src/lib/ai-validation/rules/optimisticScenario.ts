import { hasNegationNearby, snippetAround, type Detector, type Violation } from "./types";

/**
 * Detects creation/citation of an optimistic / best-case scenario.
 *
 * Rulebook §G: scenarios are BASE 6% / PESS 4% / WORST 2% only. Any
 * "낙관 시나리오", "optimistic scenario", "상승 시나리오", "장밋빛" framing
 * is forbidden.
 *
 * False-positive guard: phrases like "낙관 시나리오는 사용하지 않음" are
 * suppressed by the shared negation check.
 */
const PATTERNS: readonly RegExp[] = [
  /낙관(?:\s*적)?\s*(?:시나리오|case|scenario|예측|전망)/,
  /\boptimistic\b.{0,20}(?:scenario|case|projection|view)/i,
  /상승\s*시나리오/,
  /장밋빛/,
  /best[-\s]?case\s+scenario/i,
];

export const detectOptimisticScenario: Detector = (text) => {
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    const v: Violation = {
      code: "OPTIMISTIC_SCENARIO",
      section: "§G",
      reason: "낙관/optimistic 시나리오 도입 감지 (룰북 §G: BASE 6 / PESS 4 / WORST 2 외 금지)",
      snippet: snippetAround(text, matchStart, matchEnd),
    };
    return v;
  }
  return null;
};
