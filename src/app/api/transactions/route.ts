import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const holdingId = searchParams.get("holdingId");

  const transactions = await prisma.transaction.findMany({
    where: holdingId ? { holdingId } : undefined,
    orderBy: { date: "desc" },
    include: { holding: { include: { portfolio: true } } },
  });
  return NextResponse.json(transactions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { holdingId, action, date, quantity, price, commission, notes } = await req.json();
  if (!holdingId || !action || !date || !quantity || !price) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const tx = await prisma.transaction.create({
    data: {
      holdingId,
      action,
      date: new Date(date),
      quantity,
      price,
      commission: commission ?? 0,
      notes: notes ?? null,
    },
  });
  return NextResponse.json(tx);
}
