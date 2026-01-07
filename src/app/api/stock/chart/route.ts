import { NextRequest, NextResponse } from "next/server";

// Period에 따른 캐시 TTL (초)
function getCacheTTL(period: string): number {
  switch (period) {
    case "1D":
      return 5 * 60; // 5분
    case "5D":
      return 15 * 60; // 15분
    default:
      return 60 * 60; // 1시간 (1M, 6M, YTD, 1Y, 5Y)
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const period = searchParams.get("period") || "1M";

    if (!symbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    }

    // Map period to Yahoo Finance parameters
    let range: string;
    let interval: string;

    switch (period) {
      case "1D":
        range = "1d";
        interval = "5m";
        break;
      case "5D":
        range = "5d";
        interval = "15m";
        break;
      case "1M":
        range = "1mo";
        interval = "1d";
        break;
      case "6M":
        range = "6mo";
        interval = "1d";
        break;
      case "YTD":
        range = "ytd";
        interval = "1d";
        break;
      case "1Y":
        range = "1y";
        interval = "1wk";
        break;
      case "5Y":
        range = "5y";
        interval = "1mo";
        break;
      default:
        range = "1mo";
        interval = "1d";
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: getCacheTTL(period) }, // Next.js 캐싱 활성화
    });

    if (!res.ok) {
      console.error("Yahoo chart response status:", res.status);
      throw new Error(`Failed to fetch chart data: ${res.status}`);
    }

    const data = await res.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ error: "No chart data" }, { status: 404 });
    }

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];

    const chartData = timestamps
      .map((timestamp: number, index: number) => ({
        timestamp: timestamp * 1000, // Convert to milliseconds
        close: closes[index],
      }))
      .filter((d: { close: number | null }) => d.close !== null);

    return NextResponse.json(chartData);
  } catch (error) {
    console.error("Chart API error:", error);
    return NextResponse.json({ error: "Failed to fetch chart" }, { status: 500 });
  }
}
