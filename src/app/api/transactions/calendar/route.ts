import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const transactions = await prisma.transaction.findMany({
    where: { holding: { portfolio: { userId: session.user.id } } },
    include: { holding: { select: { ticker: true, currency: true } } },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(
    transactions.map((t) => ({
      id: t.id,
      action: t.action as "BUY" | "SELL" | "DIVIDEND",
      date: t.date.toISOString().split("T")[0],
      ticker: t.holding.ticker,
      quantity: parseFloat(t.quantity.toString()),
      price: parseFloat(t.price.toString()),
      commission: parseFloat((t.commission ?? 0).toString()),
      total: parseFloat(t.quantity.toString()) * parseFloat(t.price.toString()),
      currency: t.holding.currency,
    }))
  );
}
