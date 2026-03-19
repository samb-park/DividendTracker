import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRemainingAiCalls } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const remaining = await getRemainingAiCalls(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  return NextResponse.json({ hasKey: true, remaining, maxCalls: 2, isAdmin });
}
