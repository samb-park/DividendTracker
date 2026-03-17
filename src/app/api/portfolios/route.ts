import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const portfolios = await prisma.portfolio.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      holdings: {
        include: { transactions: true },
      },
    },
  });
  return NextResponse.json(portfolios);
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const portfolio = await prisma.portfolio.create({ data: { name: name.trim() } });
  return NextResponse.json(portfolio);
}
