import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const portfolios = await prisma.portfolio.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { holdings: { include: { transactions: true } } },
  });
  return NextResponse.json(portfolios);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, accountType } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const validAccountTypes = ["TFSA", "RRSP", "FHSA", "NON_REG", "CASH"];
  const portfolio = await prisma.portfolio.create({
    data: {
      name: name.trim(),
      userId: session.user.id,
      ...(accountType && validAccountTypes.includes(accountType) && { accountType }),
    },
  });
  return NextResponse.json(portfolio);
}
