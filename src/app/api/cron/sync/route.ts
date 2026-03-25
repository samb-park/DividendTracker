import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runQuestradeSync } from "@/lib/questrade-sync";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Find all users with a Questrade token
    const tokenSettings = await prisma.setting.findMany({
      where: { key: { endsWith: ":qt_refresh_token" } },
      select: { key: true },
    });

    const results = [];
    for (const setting of tokenSettings) {
      const userId = setting.key.replace(/:qt_refresh_token$/, "");
      const result = await runQuestradeSync(userId);
      results.push({ userId, result });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
