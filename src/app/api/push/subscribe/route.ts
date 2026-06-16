import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSingleUserId } from "@/lib/single-user-mode";

export const dynamic = "force-dynamic";

// SSRF guard: the cron later POSTs to whatever endpoint we store, so only accept
// real push-service hosts. "." prefix = suffix match (subdomains); else exact host.
const ALLOWED_HOSTS = [
  ".push.apple.com",
  "fcm.googleapis.com",
  ".notify.windows.com",
  ".push.services.mozilla.com",
];
const MAX_SUBS_PER_USER = 20;

/** POST /api/push/subscribe — store/refresh this device's push subscription. */
export async function POST(req: NextRequest) {
  const userId = getSingleUserId();
  const body = await req.json().catch(() => ({}));
  const endpoint: unknown = body?.endpoint;
  const keys = body?.keys;
  if (typeof endpoint !== "string" || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  let host: string;
  try {
    host = new URL(endpoint).host;
  } catch {
    return NextResponse.json({ error: "Bad endpoint" }, { status: 400 });
  }
  const allowed = ALLOWED_HOSTS.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));
  if (!allowed) return NextResponse.json({ error: "Endpoint host not allowed" }, { status: 400 });

  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  if (!existing) {
    const count = await prisma.pushSubscription.count({ where: { userId } });
    if (count >= MAX_SUBS_PER_USER) {
      return NextResponse.json({ error: "Too many subscriptions" }, { status: 429 });
    }
  }

  const userAgent = req.headers.get("user-agent") || undefined;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent, lastSeenAt: new Date() },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });
  return NextResponse.json({ ok: true });
}
