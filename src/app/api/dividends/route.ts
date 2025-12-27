import { NextResponse } from "next/server";
import {
  calculateExpectedAnnualDividend,
  getYtdDividends,
  getDividendHistory,
} from "@/lib/calculations/dividends";

export async function GET() {
  try {
    const [expected, ytd, history] = await Promise.all([
      calculateExpectedAnnualDividend(),
      getYtdDividends(),
      getDividendHistory(12),
    ]);

    return NextResponse.json({
      expected: {
        annualCAD: expected.CAD,
        annualUSD: expected.USD,
        monthlyCAD: expected.monthlyCAD,
        monthlyUSD: expected.monthlyUSD,
      },
      ytd: {
        CAD: ytd.CAD,
        USD: ytd.USD,
      },
      history,
    });
  } catch (error) {
    console.error("Failed to fetch dividend summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch dividend summary" },
      { status: 500 }
    );
  }
}
