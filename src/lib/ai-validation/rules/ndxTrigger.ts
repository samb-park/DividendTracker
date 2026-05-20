import { hasNegationNearby, snippetAround, type Detector, type Violation } from "./types";

/**
 * Detects NDX-based trigger reintroduction.
 *
 * Rulebook §G: NDX-based triggers were intentionally removed. The
 * authoritative triggers are growth-bucket / core-weight based (§6.1, §6.2).
 *
 * False-positive guard: "NDX 기반 트리거 금지" is suppressed by the
 * shared negation check.
 */
const PATTERNS: readonly RegExp[] = [
  /\bNDX\b.{0,15}(?:기준|기반|값|level|index|price).{0,40}(?:트리거|trigger|매수|매도|시그널|signal|발동|가|이\s*되면)/i,
  /NDX[-\s]?based\b.{0,20}trigger/i,
];

export const detectNdxTrigger: Detector = (text) => {
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    const v: Violation = {
      code: "NDX_TRIGGER",
      section: "§G",
      reason: "NDX 기반 트리거 도입 감지 (룰북 §G: NDX trigger 재도입 금지)",
      snippet: snippetAround(text, matchStart, matchEnd),
    };
    return v;
  }
  return null;
};
