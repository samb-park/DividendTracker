import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { serializeGroup } from "@/lib/pocket-groups";

export const dynamic = "force-dynamic";

/**
 * POST /api/pocket-groups/reorder — rewrite every group's sortOrder atomically.
 * Body: { ids: string[] } — the user's COMPLETE group set in the desired order.
 * A partial list would leave omitted groups with stale sortOrder that collide
 * with the new 0..N-1 range (GET's [sortOrder asc, createdAt asc] tie-break would
 * then silently hide a wrong order), so we require an exact match of the owned set.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
    return NextResponse.json({ error: "ids must be a string[]" }, { status: 400 });
  }
  const idList = ids as string[];
  if (new Set(idList).size !== idList.length) {
    return NextResponse.json({ error: "Duplicate ids" }, { status: 400 });
  }

  const owned = await prisma.pocketGroup.findMany({ where: { userId }, select: { id: true } });
  const ownedIds = new Set(owned.map((g) => g.id));
  if (idList.length !== ownedIds.size || idList.some((id) => !ownedIds.has(id))) {
    return NextResponse.json(
      { error: "ids must list all of the user's groups exactly once" },
      { status: 400 }
    );
  }

  // All-or-nothing: a bad id throws and rolls the whole batch back.
  const updated = await prisma.$transaction(
    idList.map((id, i) => prisma.pocketGroup.update({ where: { id, userId }, data: { sortOrder: i } }))
  );
  // Return in the new canonical order so the client can reconcile without a re-fetch.
  const byId = new Map(updated.map((g) => [g.id, g]));
  return NextResponse.json(idList.map((id) => serializeGroup(byId.get(id)!)));
}
