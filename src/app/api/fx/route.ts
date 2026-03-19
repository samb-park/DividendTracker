import { NextResponse } from "next/server";
import { getFxRate } from "@/lib/price";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { rate, fallback } = await getFxRate();
  return NextResponse.json({ rate, fallback });
}
