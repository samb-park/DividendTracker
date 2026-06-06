import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { runQuestradeSync } from "@/lib/questrade-sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/questrade/sync — run a Questrade sync.
 *
 * Optional body `{ maxAgeSec }`: an opportunistic throttle. When the last sync
 * is newer than maxAgeSec, the sync is SKIPPED (returns `{ skipped: true }`)
 * instead of re-running. This lets surfaces like /pocket fire a sync on every
 * open without burning Questrade's single-use refresh token on rapid revisits.
 * No body (or maxAgeSec ≤ 0) → always sync (unchanged behavior for Settings).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  let maxAgeSec = 0;
  try {
    const body = await req.json();
    if (typeof body?.maxAgeSec === "number" && body.maxAgeSec > 0) maxAgeSec = body.maxAgeSec;
  } catch {
    /* no/invalid body → always sync */
  }

  const lastSyncKey = `${userId}:qt_last_sync`;
  const before = await prisma.setting.findUnique({ where: { key: lastSyncKey } });
  const lastSync = before?.value ?? null;

  if (maxAgeSec > 0 && lastSync) {
    const ageMs = Date.now() - new Date(lastSync).getTime();
    if (ageMs >= 0 && ageMs < maxAgeSec * 1000) {
      return NextResponse.json({ ok: true, skipped: true, lastSync });
    }
  }

  try {
    const result = await runQuestradeSync(userId);
    const after = await prisma.setting.findUnique({ where: { key: lastSyncKey } });
    return NextResponse.json({ ok: true, result, lastSync: after?.value ?? lastSync });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
