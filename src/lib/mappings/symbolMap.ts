import { prisma } from "@/lib/db";
import { isInternalCode, extractTickerFromDescription } from "@/lib/excel/normalizer";

// 알려진 하드코딩 매핑 (Questrade 내부 코드 -> 실제 티커)
const KNOWN_MAPPINGS: Record<string, string> = {
  H062990: "QQQ",
  S029913: "SCHD",
  H011456: "TLT",
  H011457: "IEF",
  H018936: "ICLN",
  H052678: "REM",
  H061833: "SPHD",
  H062670: "KBWB",
  V003293: "VNQ",
  V003656: "VIG",
  V007563: "VOO",
};

/**
 * 심볼을 실제 티커로 변환
 * 1. 이미 정상 티커면 그대로 반환 (SCHD, CGL.TO 등)
 * 2. DB에서 매핑 검색
 * 3. 하드코딩된 매핑에서 검색
 * 4. Description에서 추출 시도
 */
export async function resolveSymbol(
  symbol: string | null,
  description: string
): Promise<string | null> {
  if (!symbol) return null;

  // 이미 정상 티커인 경우 (예: SCHD, CGL.TO, XSB.TO)
  if (!isInternalCode(symbol)) {
    return symbol;
  }

  // DB에서 매핑 검색
  try {
    const dbMapping = await prisma.symbolMapping.findUnique({
      where: { internalCode: symbol },
    });
    if (dbMapping) {
      return dbMapping.ticker;
    }
  } catch {
    // DB 에러는 무시하고 계속 진행
  }

  // 하드코딩된 매핑에서 검색
  if (KNOWN_MAPPINGS[symbol]) {
    // DB에 저장해두기 (다음번에 빠르게 조회)
    try {
      await prisma.symbolMapping.upsert({
        where: { internalCode: symbol },
        create: {
          internalCode: symbol,
          ticker: KNOWN_MAPPINGS[symbol],
          name: description.substring(0, 100),
        },
        update: {},
      });
    } catch {
      // 저장 실패해도 계속 진행
    }
    return KNOWN_MAPPINGS[symbol];
  }

  // Description에서 추출 시도
  const extracted = extractTickerFromDescription(description);
  if (extracted) {
    // DB에 저장
    try {
      await prisma.symbolMapping.upsert({
        where: { internalCode: symbol },
        create: {
          internalCode: symbol,
          ticker: extracted,
          name: description.substring(0, 100),
        },
        update: {},
      });
    } catch {
      // 저장 실패해도 계속 진행
    }
    return extracted;
  }

  // 매핑 실패 - 원본 반환
  console.warn(`Unknown symbol mapping: ${symbol} - ${description.substring(0, 50)}`);
  return symbol;
}

/**
 * 모든 알려진 매핑을 DB에 시드
 */
export async function seedKnownMappings(): Promise<void> {
  for (const [internalCode, ticker] of Object.entries(KNOWN_MAPPINGS)) {
    try {
      await prisma.symbolMapping.upsert({
        where: { internalCode },
        create: { internalCode, ticker },
        update: {},
      });
    } catch {
      // 무시
    }
  }
}
