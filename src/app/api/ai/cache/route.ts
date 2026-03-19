import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;

  await prisma.setting.deleteMany({
    where: {
      key: {
        in: [
          `${userId}:ai_cache:ai_briefing`,
          `${userId}:ai_cache_ts:ai_briefing`,
          `${userId}:ai_cache:ai_insights`,
          `${userId}:ai_cache_ts:ai_insights`,
        ],
      },
    },
  });

  return NextResponse.json({ ok: true });
}
