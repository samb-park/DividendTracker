import { prisma } from "@/lib/db";
import Decimal from "decimal.js";

const FREQUENCY_MULTIPLIER: Record<string, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  SEMI_ANNUAL: 2,
  ANNUAL: 1,
  IRREGULAR: 4, // Assume quarterly for irregular
};

export async function calculateExpectedAnnualDividend() {
  const holdings = await prisma.holding.findMany();
  const schedules = await prisma.dividendSchedule.findMany();

  const scheduleMap = new Map(schedules.map((s) => [s.ticker, s]));

  let totalExpectedCAD = new Decimal(0);
  let totalExpectedUSD = new Decimal(0);

  for (const holding of holdings) {
    const schedule = scheduleMap.get(holding.ticker);
    if (!schedule) continue;

    const qty = new Decimal(holding.quantity.toString());
    const divPerShare = new Decimal(schedule.lastDividendPerShare.toString());
    const multiplier = FREQUENCY_MULTIPLIER[schedule.frequency] || 4;

    const annualDiv = qty.mul(divPerShare).mul(multiplier);

    if (holding.currency === "CAD") {
      totalExpectedCAD = totalExpectedCAD.add(annualDiv);
    } else {
      totalExpectedUSD = totalExpectedUSD.add(annualDiv);
    }
  }

  return {
    CAD: totalExpectedCAD.toFixed(2),
    USD: totalExpectedUSD.toFixed(2),
    totalCAD: totalExpectedCAD.toFixed(2),
    monthlyCAD: totalExpectedCAD.div(12).toFixed(2),
    monthlyUSD: totalExpectedUSD.div(12).toFixed(2),
  };
}

export async function getYtdDividends() {
  const startOfYear = new Date(new Date().getFullYear(), 0, 1);

  const dividends = await prisma.transaction.findMany({
    where: {
      type: { in: ["DIVIDEND_CASH", "DIVIDEND_DRIP"] },
      tradeDate: { gte: startOfYear },
    },
    include: {
      account: { select: { currency: true } },
    },
  });

  let totalCAD = new Decimal(0);
  let totalUSD = new Decimal(0);

  for (const div of dividends) {
    const amount = new Decimal(div.quantity.toString()).mul(div.price.toString());

    if (div.account.currency === "CAD") {
      totalCAD = totalCAD.add(amount);
    } else {
      totalUSD = totalUSD.add(amount);
    }
  }

  return {
    CAD: totalCAD.toFixed(2),
    USD: totalUSD.toFixed(2),
  };
}

export async function getDividendHistory(months: number = 12) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const dividends = await prisma.transaction.findMany({
    where: {
      type: { in: ["DIVIDEND_CASH", "DIVIDEND_DRIP"] },
      tradeDate: { gte: startDate },
    },
    orderBy: { tradeDate: "asc" },
    include: {
      account: { select: { currency: true } },
    },
  });

  // Group by month
  const monthlyData = new Map<string, { CAD: Decimal; USD: Decimal }>();

  for (const div of dividends) {
    const monthKey = `${div.tradeDate.getFullYear()}-${String(div.tradeDate.getMonth() + 1).padStart(2, "0")}`;
    const amount = new Decimal(div.quantity.toString()).mul(div.price.toString());

    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, { CAD: new Decimal(0), USD: new Decimal(0) });
    }

    const data = monthlyData.get(monthKey)!;
    if (div.account.currency === "CAD") {
      data.CAD = data.CAD.add(amount);
    } else {
      data.USD = data.USD.add(amount);
    }
  }

  return Array.from(monthlyData.entries())
    .map(([month, data]) => ({
      month,
      CAD: data.CAD.toFixed(2),
      USD: data.USD.toFixed(2),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
