import { prisma } from "@/lib/db";

export interface DividendProjection {
  symbol: string;
  currency: string;
  totalPastYear: number;
  paymentCount: number;
  avgPayment: number;
  frequency: "monthly" | "quarterly" | "annual" | "irregular";
  projectedAnnual: number;
  remainingPayments: number;
  projectedRemaining: number;
  confidence: number; // 0-100%
}

export interface ProjectionSummary {
  projections: DividendProjection[];
  totalProjectedRemaining: number;
  totalProjectedAnnual: number;
  year: number;
}

export interface MonthlyProjection {
  month: string;
  totalAmount: number;
  currency: string;
}

/**
 * Calculate projected dividends for the current year
 */
export async function calculateProjectedDividends(
  accountId?: string,
  year?: number
): Promise<ProjectionSummary> {
  const currentYear = year || new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12

  // Get all dividend transactions
  const whereClause: Record<string, unknown> = {
    action: "DIV",
  };
  if (accountId) {
    whereClause.accountId = accountId;
  }

  const dividends = await prisma.transaction.findMany({
    where: whereClause,
    select: {
      symbolMapped: true,
      symbol: true,
      netAmount: true,
      currency: true,
      settlementDate: true,
    },
    orderBy: {
      settlementDate: "desc",
    },
  });

  // Group by symbol
  const symbolMap = new Map<
    string,
    {
      symbol: string;
      currency: string;
      payments: { date: Date; amount: number }[];
    }
  >();

  for (const div of dividends) {
    const symbol = div.symbolMapped || div.symbol || "UNKNOWN";
    if (!symbolMap.has(symbol)) {
      symbolMap.set(symbol, {
        symbol,
        currency: div.currency,
        payments: [],
      });
    }
    symbolMap.get(symbol)!.payments.push({
      date: new Date(div.settlementDate),
      amount: Math.abs(div.netAmount || 0),
    });
  }

  // Calculate projections for each symbol
  const projections: DividendProjection[] = [];

  for (const [symbol, data] of symbolMap) {
    const { currency, payments } = data;

    // Filter payments from last 12 months
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const recentPayments = payments.filter((p) => p.date >= oneYearAgo);
    const totalPastYear = recentPayments.reduce((sum, p) => sum + p.amount, 0);
    const paymentCount = recentPayments.length;

    if (paymentCount === 0) continue;

    // Determine frequency
    const frequency = detectFrequency(recentPayments);

    // Calculate average payment
    const avgPayment = totalPastYear / paymentCount;

    // Estimate payments per year based on frequency
    const paymentsPerYear =
      frequency === "monthly"
        ? 12
        : frequency === "quarterly"
          ? 4
          : frequency === "annual"
            ? 1
            : paymentCount; // irregular: use actual count

    // Projected annual dividend
    const projectedAnnual = avgPayment * paymentsPerYear;

    // Calculate remaining payments this year
    const paymentsThisYear = payments.filter(
      (p) => p.date.getFullYear() === currentYear
    ).length;

    const expectedPaymentsThisYear = paymentsPerYear;
    const remainingPayments = Math.max(0, expectedPaymentsThisYear - paymentsThisYear);

    // Projected remaining for this year
    const projectedRemaining = avgPayment * remainingPayments;

    // Calculate confidence based on data history
    const allYears = new Set(payments.map((p) => p.date.getFullYear()));
    const yearsOfData = allYears.size;

    let confidence = 50; // Base confidence
    if (yearsOfData >= 3) confidence = 85;
    else if (yearsOfData >= 2) confidence = 75;
    else if (yearsOfData >= 1) confidence = 60;

    // Adjust for consistency
    if (frequency !== "irregular") confidence += 10;

    confidence = Math.min(100, confidence);

    projections.push({
      symbol,
      currency,
      totalPastYear,
      paymentCount,
      avgPayment,
      frequency,
      projectedAnnual,
      remainingPayments,
      projectedRemaining,
      confidence,
    });
  }

  // Sort by projected annual descending
  projections.sort((a, b) => b.projectedAnnual - a.projectedAnnual);

  // Calculate totals (convert to same currency would be better, but for now sum separately)
  const totalProjectedRemaining = projections.reduce(
    (sum, p) => sum + p.projectedRemaining,
    0
  );
  const totalProjectedAnnual = projections.reduce(
    (sum, p) => sum + p.projectedAnnual,
    0
  );

  return {
    projections,
    totalProjectedRemaining,
    totalProjectedAnnual,
    year: currentYear,
  };
}

/**
 * Detect dividend payment frequency
 */
function detectFrequency(
  payments: { date: Date; amount: number }[]
): "monthly" | "quarterly" | "annual" | "irregular" {
  if (payments.length < 2) return "irregular";

  // Sort by date
  const sorted = [...payments].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Calculate average gap between payments in days
  let totalGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap =
      (sorted[i].date.getTime() - sorted[i - 1].date.getTime()) /
      (1000 * 60 * 60 * 24);
    totalGap += gap;
  }
  const avgGap = totalGap / (sorted.length - 1);

  // Determine frequency based on average gap
  if (avgGap >= 300 && avgGap <= 400) return "annual"; // ~365 days
  if (avgGap >= 75 && avgGap <= 120) return "quarterly"; // ~90 days
  if (avgGap >= 20 && avgGap <= 45) return "monthly"; // ~30 days

  return "irregular";
}

/**
 * Calculate monthly projected dividends for a year
 * Based on historical payment months
 */
export async function calculateMonthlyProjectedDividends(
  accountId?: string,
  year?: number,
  symbol?: string
): Promise<MonthlyProjection[]> {
  const targetYear = year || new Date().getFullYear();

  // Get all dividend transactions
  const whereClause: Record<string, unknown> = {
    action: "DIV",
  };
  if (accountId) {
    whereClause.accountId = accountId;
  }
  if (symbol) {
    whereClause.symbolMapped = symbol;
  }

  const dividends = await prisma.transaction.findMany({
    where: whereClause,
    select: {
      symbolMapped: true,
      symbol: true,
      netAmount: true,
      currency: true,
      settlementDate: true,
    },
    orderBy: {
      settlementDate: "desc",
    },
  });

  // Group payments by symbol to calculate average per symbol
  const symbolData = new Map<
    string,
    {
      currency: string;
      payments: { month: number; amount: number }[];
      avgPayment: number;
    }
  >();

  for (const div of dividends) {
    const sym = div.symbolMapped || div.symbol || "UNKNOWN";
    const date = new Date(div.settlementDate);
    const month = date.getMonth() + 1; // 1-12
    const amount = Math.abs(div.netAmount || 0);

    if (!symbolData.has(sym)) {
      symbolData.set(sym, {
        currency: div.currency,
        payments: [],
        avgPayment: 0,
      });
    }
    symbolData.get(sym)!.payments.push({ month, amount });
  }

  // Calculate average payment per symbol
  for (const [, data] of symbolData) {
    if (data.payments.length > 0) {
      data.avgPayment =
        data.payments.reduce((sum, p) => sum + p.amount, 0) / data.payments.length;
    }
  }

  // Get typical payment months for each symbol (based on historical data)
  const getTypicalMonths = (payments: { month: number; amount: number }[]): number[] => {
    const monthCounts = new Map<number, number>();
    for (const p of payments) {
      monthCounts.set(p.month, (monthCounts.get(p.month) || 0) + 1);
    }
    // Return months that appear frequently (more than once or at least once if limited data)
    const threshold = payments.length > 4 ? 2 : 1;
    return Array.from(monthCounts.entries())
      .filter(([, count]) => count >= threshold)
      .map(([month]) => month)
      .sort((a, b) => a - b);
  };

  // Build monthly projections
  const monthlyData: { [key: string]: { cad: number; usd: number } } = {};

  // Initialize all months
  for (let m = 1; m <= 12; m++) {
    const monthKey = `${targetYear}-${String(m).padStart(2, "0")}`;
    monthlyData[monthKey] = { cad: 0, usd: 0 };
  }

  // Add projections for each symbol
  for (const [, data] of symbolData) {
    const typicalMonths = getTypicalMonths(data.payments);

    for (const month of typicalMonths) {
      const monthKey = `${targetYear}-${String(month).padStart(2, "0")}`;
      if (monthlyData[monthKey]) {
        if (data.currency === "CAD") {
          monthlyData[monthKey].cad += data.avgPayment;
        } else {
          monthlyData[monthKey].usd += data.avgPayment;
        }
      }
    }
  }

  // Convert to array format (separate CAD and USD entries like regular dividends)
  const result: MonthlyProjection[] = [];

  for (const [month, amounts] of Object.entries(monthlyData)) {
    if (amounts.cad > 0) {
      result.push({ month, totalAmount: amounts.cad, currency: "CAD" });
    }
    if (amounts.usd > 0) {
      result.push({ month, totalAmount: amounts.usd, currency: "USD" });
    }
  }

  return result;
}
