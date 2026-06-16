import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/push/vapid-public-key — the non-secret VAPID public key for subscribe(). */
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });
  return NextResponse.json({ publicKey });
}
