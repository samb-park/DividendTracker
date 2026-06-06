import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import {
  MAX_GROUP_NAME,
  sanitizeColor,
  sanitizeIcon,
  sanitizeTickers,
  serializeGroup,
} from "@/lib/pocket-groups";

/** PATCH /api/pocket-groups/:id — update name / tickers / sortOrder. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: {
    name?: string;
    color?: string | null;
    icon?: string | null;
    tickers?: string[];
    sortOrder?: number;
  } = {};
  if (typeof body?.name === "string") {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "Name required" }, { status: 400 });
    data.name = n.slice(0, MAX_GROUP_NAME);
  }
  if (body?.color !== undefined) data.color = sanitizeColor(body.color);
  if (body?.icon !== undefined) data.icon = sanitizeIcon(body.icon);
  if (body?.tickers !== undefined) data.tickers = sanitizeTickers(body.tickers);
  if (typeof body?.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
    data.sortOrder = Math.trunc(body.sortOrder);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.pocketGroup.update({
      where: { id, userId: session.user.id },
      data,
    });
    return NextResponse.json(serializeGroup(updated));
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

/** DELETE /api/pocket-groups/:id — remove a group. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await prisma.pocketGroup.delete({ where: { id, userId: session.user.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
