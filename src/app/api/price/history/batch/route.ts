import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/price";
import { auth } from "@/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { tickers, range, from } = body as { tickers: string[]; range?: string; from?: string };

  if (!Array.isArray(tickers) || tickers.length === 0 || tickers.length > 60) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const results = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const data = await getHistory(ticker.toUpperCase(), range ?? "3m", from);
        return [ticker, data] as const;
      } catch {
        return [ticker, []] as const;
      }
    })
  );

  return NextResponse.json(Object.fromEntries(results));
}
