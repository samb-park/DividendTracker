import { hasNegationNearby, snippetAround, type Detector, type Violation } from "./types";

const LEGACY_INCOME_TICKER = ["JE", "PQ"].join("");

export const detectLegacyIncomeTicker: Detector = (text) => {
  const re = new RegExp(`\\b${LEGACY_INCOME_TICKER}\\b`, "i");
  const m = re.exec(text);
  if (!m) return null;
  const matchStart = m.index;
  const matchEnd = m.index + m[0].length;
  return {
    code: "LEGACY_INCOME_TICKER",
    section: "§4 / Rulebook v4.5.1",
    reason: "Legacy ticker new-buy mention detected. Rulebook v4.5.1 treats QQQM/QQQI/JEPQ/IAUM as hold-only.",
    snippet: snippetAround(text, matchStart, matchEnd),
  } satisfies Violation;
};

export const detectQqqiCapWarning: Detector = (text) => {
  const patterns = [
    /\bQQQI\b.{0,30}(?:>|초과|over|above|exceed).{0,20}5\s*%/i,
    /\bQQQI\b.{0,30}(?:5\.[0-9]+|[6-9](?:\.\d+)?)\s*%/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    return {
      code: "QQQI_CAP_WARNING",
      section: "§4",
      reason: "QQQI 5% cap 초과/초과 가능성 감지 (WARNING: soft stop, 즉시 매도 룰 아님)",
      snippet: snippetAround(text, matchStart, matchEnd),
    } satisfies Violation;
  }
  return null;
};

export const detectQqqiAutoRouting: Detector = (text) => {
  const patterns = [
    /\bQQQI\b.{0,20}(?:분배금|distribution|dividend).{0,60}(?:자동|auto).{0,40}(?:SCHD|QLD|SGOV)/i,
    /\bQQQI\b.{0,20}(?:분배금|distribution|dividend).{0,60}(?:SCHD|QLD|SGOV).{0,40}(?:자동|auto)/i,
    /\bQQQI\b.{0,20}(?:분배금|distribution|dividend).{0,60}(?:라우팅|routing|route|재투자).{0,40}(?:SCHD|QLD|SGOV)/i,
    /\bQQQI\b.{0,20}(?:분배금|distribution|dividend).{0,60}(?:SCHD|QLD|SGOV).{0,40}(?:라우팅|routing|route|재투자)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    return {
      code: "QQQI_AUTO_ROUTING",
      section: "§4",
      reason: "QQQI 분배금 자동 라우팅 감지 (룰북 v4.5.1: 자동 라우팅 없음)",
      snippet: snippetAround(text, matchStart, matchEnd),
    } satisfies Violation;
  }
  return null;
};

export const detectQqqiFundedByCoreSale: Detector = (text) => {
  const patterns = [
    /(?:SCHD|QLD|TQQQ).{0,20}(?:매도|sell|sold).{0,40}\bQQQI\b.{0,20}(?:매수|buy)/i,
    /\bQQQI\b.{0,20}(?:매수|buy).{0,40}(?:SCHD|QLD|TQQQ).{0,20}(?:매도|sell|sold)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    return {
      code: "QQQI_FUNDED_BY_CORE_SALE",
      section: "§4 / §15",
      reason: "SCHD/QLD/TQQQ 매도로 QQQI를 매수하는 흐름 감지",
      snippet: snippetAround(text, matchStart, matchEnd),
    } satisfies Violation;
  }
  return null;
};

/**
 * QQQM sibling of detectQqqiFundedByCoreSale.
 * Rulebook v4.5.1: SCHD/QLD/TQQQ 매도로 QQQM 매수 금지. QQQM 자금원은
 * 사용자 외부의 TFSA CAD 입금 → quarterly NG batch 뿐.
 */
export const detectQqqmFundedByCoreSale: Detector = (text) => {
  const patterns = [
    /(?:SCHD|QLD|TQQQ).{0,20}(?:매도|sell|sold).{0,40}\bQQQM\b.{0,20}(?:매수|buy)/i,
    /\bQQQM\b.{0,20}(?:매수|buy).{0,40}(?:SCHD|QLD|TQQQ).{0,20}(?:매도|sell|sold)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    return {
      code: "QQQM_FUNDED_BY_CORE_SALE",
      section: "§4 / §15 (v4.5.1)",
      reason: "SCHD/QLD/TQQQ 매도로 QQQM을 매수하는 흐름 감지 (룰북 v4.5.1: QQQM 자금원은 TFSA 별도 입금만)",
      snippet: snippetAround(text, matchStart, matchEnd),
    } satisfies Violation;
  }
  return null;
};

/**
 * QQQM sibling of detectQqqiAutoRouting.
 * Rulebook v4.5.1: QQQM distribution은 TFSA USD cash로 누적, 자동 라우팅 없음.
 */
export const detectQqqmAutoRouting: Detector = (text) => {
  const patterns = [
    /\bQQQM\b.{0,20}(?:분배금|distribution|dividend).{0,60}(?:자동|auto).{0,40}(?:SCHD|QLD|SGOV)/i,
    /\bQQQM\b.{0,20}(?:분배금|distribution|dividend).{0,60}(?:SCHD|QLD|SGOV).{0,40}(?:자동|auto)/i,
    /\bQQQM\b.{0,20}(?:분배금|distribution|dividend).{0,60}(?:라우팅|routing|route|재투자).{0,40}(?:SCHD|QLD|SGOV)/i,
    /\bQQQM\b.{0,20}(?:분배금|distribution|dividend).{0,60}(?:SCHD|QLD|SGOV).{0,40}(?:라우팅|routing|route|재투자)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (hasNegationNearby(text, matchStart, matchEnd)) continue;
    return {
      code: "QQQM_AUTO_ROUTING",
      section: "§4 (v4.5.1)",
      reason: "QQQM 분배금 자동 라우팅 감지 (룰북 v4.5.1: 자동 라우팅 없음, TFSA USD cash 누적)",
      snippet: snippetAround(text, matchStart, matchEnd),
    } satisfies Violation;
  }
  return null;
};
