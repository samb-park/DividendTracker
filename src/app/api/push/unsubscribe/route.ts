import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST /api/push/unsubscribe — drop a device's subscription (idempotent). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const endpoint: unknown = body?.endpoint;
  if (typeof endpoint !== "string") {
    return NextResponse.json({ error: "Endpoint required" }, { status: 400 });
  }
  await prisma.pushSubscription.deleteMany({ where: { endpoint } }); // no throw if absent
  return NextResponse.json({ ok: true });
}
