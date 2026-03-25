import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const tx = await prisma.transaction.findUnique({
      where: { id },
      select: { holding: { select: { portfolio: { select: { userId: true } } } } },
    });
    if (!tx || tx.holding.portfolio.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.transaction.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action, date, quantity, price, commission, notes } = body;

  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: { holding: { select: { portfolio: { select: { userId: true } } } } },
  });
  if (!tx || tx.holding.portfolio.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      ...(action ? { action } : {}),
      ...(date ? { date: new Date(date) } : {}),
      ...(quantity != null ? { quantity: Number(quantity) } : {}),
      ...(price != null ? { price: Number(price) } : {}),
      ...(commission != null ? { commission: Number(commission) } : {}),
      ...(notes !== undefined ? { notes: notes ? String(notes).slice(0, 500) : null } : {}),
    },
  });
  return NextResponse.json(updated);
}
