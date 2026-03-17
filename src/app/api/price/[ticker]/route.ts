import { NextRequest, NextResponse } from "next/server";
import { getPrice } from "@/lib/price";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const data = await getPrice(ticker.toUpperCase());
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
