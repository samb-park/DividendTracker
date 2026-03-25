import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { clearPriceCache } from "@/lib/price";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  clearPriceCache();
  return NextResponse.json({ ok: true });
}
