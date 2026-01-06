import { NextRequest, NextResponse } from "next/server";
import {
  calculateMonthlyDividends,
  calculateDividendsBySymbol,
  getDividendSymbols,
  getDividendYears,
} from "@/lib/calculations/dividends";
import { calculateProjectedDividends, calculateMonthlyProjectedDividends } from "@/lib/calculations/projectedDividends";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null;
    const accountId = searchParams.get("accountId");
    const symbol = searchParams.get("symbol");
    const type = searchParams.get("type") || "monthly";

    if (type === "symbols") {
      // Dividend symbol list (filtered by year if provided)
      const symbols = await getDividendSymbols(accountId, year);
      return NextResponse.json(symbols);
    }

    if (type === "years") {
      // Available years list
      const years = await getDividendYears(accountId);
      return NextResponse.json(years);
    }

    if (type === "bySymbol") {
      // Dividends by symbol
      const dividends = await calculateDividendsBySymbol(year, accountId);
      return NextResponse.json(dividends);
    }

    if (type === "projected") {
      // Projected dividends summary
      const projections = await calculateProjectedDividends(accountId || undefined, year || undefined);
      return NextResponse.json(projections);
    }

    if (type === "projectedMonthly") {
      // Monthly projected dividends (same format as regular monthly dividends)
      const projections = await calculateMonthlyProjectedDividends(
        accountId || undefined,
        year || undefined,
        symbol || undefined
      );
      return NextResponse.json(projections);
    }

    // Monthly dividends
    const dividends = await calculateMonthlyDividends(year, accountId, symbol);
    return NextResponse.json(dividends);
  } catch (error) {
    console.error("Error fetching dividends:", error);
    return NextResponse.json({ error: "Failed to fetch dividends" }, { status: 500 });
  }
}
