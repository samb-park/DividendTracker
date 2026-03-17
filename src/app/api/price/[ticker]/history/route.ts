import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/price";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const range = req.nextUrl.searchParams.get("range") ?? "3m";
  const from = req.nextUrl.searchParams.get("from") ?? undefined;

  try {
    const data = await getHistory(ticker.toUpperCase(), range, from);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
