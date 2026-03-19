import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const holdingId = searchParams.get("holdingId");

  const transactions = await prisma.transaction.findMany({
    where: {
      ...(holdingId ? { holdingId } : {}),
      holding: { portfolio: { userId: session.user.id } },
    },
    orderBy: { date: "desc" },
    include: { holding: { include: { portfolio: true } } },
  });
  return NextResponse.json(transactions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { holdingId, action, date, quantity, price, commission, notes } = body;
  if (!holdingId || !action || !date || !quantity || !price) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["BUY", "SELL", "DIVIDEND"].includes(action as string)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Verify holding belongs to current user
  const holding = await prisma.holding.findUnique({
    where: { id: holdingId as string },
    select: { portfolio: { select: { userId: true } } },
  });
  if (!holding || holding.portfolio.userId !== session.user.id) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }

  const qty = Number(quantity);
  const prc = Number(price);
  const com = Number(commission ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "quantity must be a positive number" }, { status: 400 });
  }
  if (!Number.isFinite(prc) || prc <= 0) {
    return NextResponse.json({ error: "price must be a positive number" }, { status: 400 });
  }
  if (!Number.isFinite(com) || com < 0) {
    return NextResponse.json({ error: "commission must be non-negative" }, { status: 400 });
  }
  const txDate = new Date(date as string);
  if (isNaN(txDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (txDate > new Date()) {
    return NextResponse.json({ error: "Transaction date cannot be in the future" }, { status: 400 });
  }
  const tx = await prisma.transaction.create({
    data: {
      holdingId: holdingId as string,
      action: action as "BUY" | "SELL" | "DIVIDEND",
      date: txDate,
      quantity: qty,
      price: prc,
      commission: com,
      notes: notes ? String(notes).slice(0, 500) : null,
    },
  });
  return NextResponse.json(tx);
}
