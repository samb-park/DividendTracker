import { hasNegationNearby, snippetAround, type Detector, type Violation } from "./types";

/**
 * Detects QLD weight decisions framed against total portfolio rather than
 * the core (SCHD + QLD) basis.
 *
 * Rulebook §A: QLD core weight = QLD / (SCHD + QLD). All §5 / §6 / §9
 * decisions reference this core basis. Decisions that cite "QLD 전체 비중"
 * (total) as the trigger are wrong-basis reasoning.
 *
 * High-confidence shape we look for: QLD + total-basis weight phrasing
 * within 15 chars, followed within 40 chars by a sell/buy/decision verb.
 * Pure data reporting like "QLD 전체 비중은 18%이다" without an action
 * verb in the window will not match.
 */
const PATTERNS: readonly RegExp[] = [
  /\bQLD\b.{0,15}전체\s*비중.{0,40}(?:매도|매수|판단|결정|초과|기준으로\s*매)/i,
  /\bQLD\b.{0,15}total\s*(?:weight|basis).{0,40}(?:sell|buy|decision|trigger)/i,
];

export const detectQldWrongBasis: Detector = (text) => {
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    const v: Violation = {
      code: "QLD_WRONG_BASIS",
      section: "§A",
      reason: "QLD 비중을 total 기준으로 판단 (룰북 §A: QLD는 코어 기준 = QLD/(SCHD+QLD))",
      snippet: snippetAround(text, matchStart, matchEnd),
    };
    return v;
  }
  return null;
};
