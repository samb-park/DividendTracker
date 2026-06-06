import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import {
  MAX_GROUP_NAME,
  MAX_GROUPS,
  sanitizeColor,
  sanitizeIcon,
  sanitizeTickers,
  serializeGroup,
} from "@/lib/pocket-groups";

export const dynamic = "force-dynamic";

/** GET /api/pocket-groups — list the current user's ticker groups, ordered. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groups = await prisma.pocketGroup.findMany({
    where: { userId: session.user.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(groups.map(serializeGroup));
}

/** POST /api/pocket-groups — create a new group ({ name, tickers? }). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const count = await prisma.pocketGroup.count({ where: { userId: session.user.id } });
  if (count >= MAX_GROUPS) return NextResponse.json({ error: "Too many groups" }, { status: 400 });

  const last = await prisma.pocketGroup.findFirst({
    where: { userId: session.user.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.pocketGroup.create({
    data: {
      userId: session.user.id,
      name: name.slice(0, MAX_GROUP_NAME),
      color: sanitizeColor(body?.color),
      icon: sanitizeIcon(body?.icon),
      tickers: sanitizeTickers(body?.tickers),
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json(serializeGroup(created));
}
