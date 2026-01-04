/**
 * CON/WDR 트랜잭션의 description에서 C$ EQUIVALENT 금액 추출
 * 예: "SCHWAB STRATEGIC TR US DIVIDEND EQUITY ETF TFSA WITHDRAWAL 4,485.78 U$ CNV@ 1.37940000 6,187.68 C$ EQUIVALENT MARKET VALUE $4,485.78"
 */
export function extractCadEquivalent(description: string): number | null {
  // Pattern 1: "6,187.68 C$ EQUIVALENT"
  const match1 = description.match(/([\d,]+\.?\d*)\s*C\$\s*EQUIVALENT/i);
  if (match1) {
    return parseFloat(match1[1].replace(/,/g, ""));
  }

  // Pattern 2: "C$ EQUIVALENT $6,187.68"
  const match2 = description.match(/C\$\s*EQUIVALENT\s*\$?([\d,]+\.?\d*)/i);
  if (match2) {
    return parseFloat(match2[1].replace(/,/g, ""));
  }

  return null;
}

/**
 * Questrade 내부 코드인지 확인
 * 내부 코드 패턴: H062990, S029913 등 (문자 + 숫자 5-6자리)
 */
export function isInternalCode(symbol: string | null): boolean {
  if (!symbol) return false;
  return /^[A-Z]\d{5,6}$/.test(symbol);
}

/**
 * Description에서 실제 티커 추출 시도
 * 예: "INVESCO QQQ TR UNIT SER 1" -> "QQQ"
 * 예: "SCHWAB STRATEGIC TR US DIVIDEND EQUITY ETF" -> "SCHD"
 */
export function extractTickerFromDescription(description: string): string | null {
  // 알려진 패턴 매칭
  const patterns: Array<{ pattern: RegExp; ticker: string }> = [
    { pattern: /INVESCO QQQ/i, ticker: "QQQ" },
    { pattern: /SCHWAB STRATEGIC TR US DIVID/i, ticker: "SCHD" },
    { pattern: /ISHARES 20 PLUS YEAR TREASURY/i, ticker: "TLT" },
    { pattern: /ISHARES 7.?10 YEAR TREASURY/i, ticker: "IEF" },
    { pattern: /ISHARES.*MORTGAGE REAL ESTATE/i, ticker: "REM" },
    { pattern: /ISHARES.*GLOBAL CLEAN ENERGY/i, ticker: "ICLN" },
    { pattern: /VANGUARD.*REAL ESTATE ETF/i, ticker: "VNQ" },
    { pattern: /VANGUARD.*DIVIDEND APPRECIATION/i, ticker: "VIG" },
    { pattern: /VANGUARD S&P 500/i, ticker: "VOO" },
    { pattern: /INVESCO.*KBW BANK/i, ticker: "KBWB" },
    { pattern: /INVESCO.*S&P 500 HIGH DIVID/i, ticker: "SPHD" },
    { pattern: /INVESCO DB COMMODITY/i, ticker: "DBC" },
  ];

  for (const { pattern, ticker } of patterns) {
    if (pattern.test(description)) {
      return ticker;
    }
  }

  return null;
}

/**
 * Account Type에서 단축명 추출
 * "Individual TFSA" -> "TFSA"
 * "Individual RRSP" -> "RRSP"
 */
export function normalizeAccountType(accountType: string): string {
  if (accountType.includes("TFSA")) return "TFSA";
  if (accountType.includes("RRSP") || accountType.includes("RSP")) return "RRSP";
  return accountType;
}
