import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import {
  MAX_GROUP_NAME,
  MAX_TICKERS_PER_GROUP,
  sanitizeAccounts,
  sanitizeColor,
  sanitizeIcon,
  sanitizeTickers,
  serializeGroup,
} from "@/lib/pocket-groups";

/** PATCH /api/pocket-groups/:id — update name / color / icon / tickers / sortOrder. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: {
    name?: string;
    color?: string | null;
    icon?: string | null;
    accounts?: string[];
    tickers?: string[];
    sortOrder?: number;
  } = {};
  if (typeof body?.name === "string") {
    const n = body.name.trim().slice(0, MAX_GROUP_NAME);
    if (!n) return NextResponse.json({ error: "Name required" }, { status: 400 });
    // Reject a rename that collides with another group of the same user.
    const dup = await prisma.pocketGroup.findFirst({ where: { userId, name: n, NOT: { id } } });
    if (dup) return NextResponse.json({ error: "A portfolio with that name already exists." }, { status: 409 });
    data.name = n;
  }
  if (body?.color !== undefined) data.color = sanitizeColor(body.color);
  if (body?.icon !== undefined) data.icon = sanitizeIcon(body.icon);
  if (body?.accounts !== undefined) data.accounts = sanitizeAccounts(body.accounts);
  if (body?.tickers !== undefined) {
    if (Array.isArray(body.tickers) && body.tickers.length > MAX_TICKERS_PER_GROUP) {
      return NextResponse.json({ error: `Max ${MAX_TICKERS_PER_GROUP} tickers per portfolio.` }, { status: 400 });
    }
    data.tickers = sanitizeTickers(body.tickers);
  }
  if (typeof body?.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
    data.sortOrder = Math.trunc(body.sortOrder);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.pocketGroup.update({ where: { id, userId }, data });
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
