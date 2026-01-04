import { NextRequest, NextResponse } from "next/server";
import { getCachedQuote, getCachedFxRate } from "@/lib/market/cache";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const type = searchParams.get("type");

    // 환율 조회
    if (type === "fx") {
      const rate = await getCachedFxRate();
      return NextResponse.json({ pair: "USDCAD", rate });
    }

    // 개별 종목 시세 조회
    if (symbol) {
      const quote = await getCachedQuote(symbol);
      if (!quote) {
        return NextResponse.json({ error: "시세 조회 실패" }, { status: 404 });
      }
      return NextResponse.json(quote);
    }

    return NextResponse.json({ error: "symbol 또는 type 파라미터 필요" }, { status: 400 });
  } catch (error) {
    console.error("Market API error:", error);
    return NextResponse.json({ error: "시세 조회 실패" }, { status: 500 });
  }
}
