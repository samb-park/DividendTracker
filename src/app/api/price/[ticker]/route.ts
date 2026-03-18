import { NextRequest, NextResponse } from "next/server";
import { getPrice, getPriceError } from "@/lib/price";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const data = await getPrice(ticker.toUpperCase());
  if (!data) {
    const reason = getPriceError(ticker.toUpperCase()) ?? "network";
    return NextResponse.json({ error: "Not found", reason }, { status: 404 });
  }
  return NextResponse.json(data);
}
