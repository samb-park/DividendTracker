import { NextRequest, NextResponse } from "next/server";
import { getCachedQuote } from "@/lib/api/price-cache";
import { searchTickers } from "@/lib/api/yahoo-finance";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toUpperCase();
    const mode = searchParams.get("mode") || "quote"; // quote or search

    if (!query || query.length < 1) {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }

    // Mode: quote - get specific ticker quote
    if (mode === "quote") {
      const quote = await getCachedQuote(query);

      if (!quote) {
        return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
      }

      return NextResponse.json(quote);
    }

    // Mode: search - search for tickers
    const results = await searchTickers(query);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
