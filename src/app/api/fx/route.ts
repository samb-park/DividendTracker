import { NextResponse } from "next/server";
import { getFxRate } from "@/lib/price";

export const dynamic = "force-dynamic";

export async function GET() {
  const { rate, fallback } = await getFxRate();
  return NextResponse.json({ rate, fallback });
}
