import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBootstrapUser } from "@/lib/bootstrap-user";

export async function GET() {
  try {
    const user = await ensureBootstrapUser();

    const [targets, settings] = await Promise.all([
      prisma.portfolioTarget.findMany({
        where: { userId: user.id, isActive: true },
        orderBy: [{ symbol: "asc" }],
      }),
      prisma.portfolioSettings.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return NextResponse.json({ targets, settings });
  } catch (error) {
    console.error("Error fetching targets:", error);
    return NextResponse.json({ error: "Failed to fetch targets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureBootstrapUser();
    const body = await request.json();
    const { type } = body;

    if (type === "target") {
      const { symbol, targetWeight, currency } = body;
      if (!symbol || targetWeight === undefined || targetWeight === null) {
        return NextResponse.json({ error: "Symbol and target weight are required" }, { status: 400 });
      }

      const target = await prisma.portfolioTarget.upsert({
        where: { userId_symbol: { userId: user.id, symbol: symbol.trim().toUpperCase() } },
        update: {
          targetWeight: Number(targetWeight),
          currency: currency || "CAD",
          isActive: true,
        },
        create: {
          userId: user.id,
          symbol: symbol.trim().toUpperCase(),
          targetWeight: Number(targetWeight),
          currency: currency || "CAD",
          isActive: true,
        },
      });

      return NextResponse.json(target);
    }

    if (type === "settings") {
      const { weeklyContributionAmount, targetAnnualDividend, targetMonthlyDividend } = body;
      const existing = await prisma.portfolioSettings.findFirst({ where: { userId: user.id } });

      if (existing) {
        const updated = await prisma.portfolioSettings.update({
          where: { id: existing.id },
          data: {
            weeklyContributionAmount: weeklyContributionAmount === undefined ? existing.weeklyContributionAmount : Number(weeklyContributionAmount || 0),
            targetAnnualDividend: targetAnnualDividend === undefined || targetAnnualDividend === "" ? null : Number(targetAnnualDividend),
            targetMonthlyDividend: targetMonthlyDividend === undefined || targetMonthlyDividend === "" ? null : Number(targetMonthlyDividend),
          },
        });
        return NextResponse.json(updated);
      }

      const created = await prisma.portfolioSettings.create({
        data: {
          userId: user.id,
          weeklyContributionAmount: Number(weeklyContributionAmount || 0),
          targetAnnualDividend: targetAnnualDividend === undefined || targetAnnualDividend === "" ? null : Number(targetAnnualDividend),
          targetMonthlyDividend: targetMonthlyDividend === undefined || targetMonthlyDividend === "" ? null : Number(targetMonthlyDividend),
        },
      });
      return NextResponse.json(created);
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (error) {
    console.error("Error saving targets:", error);
    return NextResponse.json({ error: "Failed to save targets" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await ensureBootstrapUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Target ID is required" }, { status: 400 });

    const target = await prisma.portfolioTarget.findFirst({ where: { id, userId: user.id } });
    if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

    await prisma.portfolioTarget.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting target:", error);
    return NextResponse.json({ error: "Failed to delete target" }, { status: 500 });
  }
}
