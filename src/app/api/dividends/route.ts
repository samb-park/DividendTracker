import { NextRequest, NextResponse } from "next/server";
import {
  calculateMonthlyDividends,
  calculateDividendsBySymbol,
  getDividendSymbols,
} from "@/lib/calculations/dividends";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const months = parseInt(searchParams.get("months") || "12");
    const accountId = searchParams.get("accountId");
    const symbol = searchParams.get("symbol");
    const type = searchParams.get("type") || "monthly";

    if (type === "symbols") {
      // 배당 심볼 목록
      const symbols = await getDividendSymbols(accountId);
      return NextResponse.json(symbols);
    }

    if (type === "bySymbol") {
      // 심볼별 배당
      const dividends = await calculateDividendsBySymbol(months, accountId);
      return NextResponse.json(dividends);
    }

    // 월별 배당
    const dividends = await calculateMonthlyDividends(months, accountId, symbol);
    return NextResponse.json(dividends);
  } catch (error) {
    console.error("Error fetching dividends:", error);
    return NextResponse.json({ error: "배당 조회 실패" }, { status: 500 });
  }
}
