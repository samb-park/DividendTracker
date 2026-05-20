import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteUserAiCache } from "@/lib/ai-cache";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await deleteUserAiCache(session.user.id);
  return NextResponse.json({ ok: true });
}

// Self-service refresh: any authenticated user clears their own AI cache.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deleteUserAiCache(session.user.id);
  return NextResponse.json({ ok: true });
}
