import { prisma } from "@/lib/db";
import { getDividendInfoBatch } from "@/lib/market/yahoo";

export interface YahooProjection {
  symbol: string;
  currency: string;
  quantity: number;
  price: number;
  marketValue: number;
  dividendYield: number | null;
  annualDividendPerShare: number | null;
  projectedAnnualDividend: number;
  projectedQuarterlyDividend: number;
  projectedMonthlyDividend: number;
}

export interface YahooProjectionSummary {
  projections: YahooProjection[];
  totalProjectedAnnual: number;
  totalProjectedMonthly: number;
  year: number;
}

export interface MonthlyYahooProjection {
  month: string;
  totalAmount: number;
  currency: string;
}

/**
 * Get historical payment schedule for a symbol
 * Returns frequency and payment months based on past dividends
 */
async function getPaymentSchedule(
  symbol: string,
  accountId?: string
): Promise<{ frequency: "monthly" | "quarterly" | "annual" | "irregular"; months: number[] }> {
  const whereClause: Record<string, unknown> = {
    action: "DIV",
    symbolMapped: symbol,
  };
  if (accountId) {
    whereClause.accountId = accountId;
  }

  const dividends = await prisma.transaction.findMany({
    where: whereClause,
    select: {
      settlementDate: true,
    },
    orderBy: {
      settlementDate: "desc",
    },
  });

  if (dividends.length === 0) {
    return { frequency: "irregular", months: [] };
  }

  // Aggregate by date to handle multiple accounts
  const dateSet = new Set<string>();
  for (const div of dividends) {
    const dateStr = new Date(div.settlementDate).toISOString().split("T")[0];
    dateSet.add(dateStr);
  }
  const uniqueDates = Array.from(dateSet).sort();

  // Detect frequency
  let frequency: "monthly" | "quarterly" | "annual" | "irregular" = "irregular";
  if (uniqueDates.length >= 2) {
    let totalGap = 0;
    for (let i = 1; i < uniqueDates.length; i++) {
      const gap =
        (new Date(uniqueDates[i]).getTime() - new Date(uniqueDates[i - 1]).getTime()) /
        (1000 * 60 * 60 * 24);
      totalGap += gap;
    }
    const avgGap = totalGap / (uniqueDates.length - 1);

    if (avgGap >= 300 && avgGap <= 400) frequency = "annual";
    else if (avgGap >= 75 && avgGap <= 120) frequency = "quarterly";
    else if (avgGap >= 20 && avgGap <= 45) frequency = "monthly";
  }

  // Get unique months from historical data
  const monthCounts = new Map<number, number>();
  for (const dateStr of uniqueDates) {
    const month = new Date(dateStr).getMonth() + 1;
    monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
  }

  // Determine payment months based on frequency
  let months: number[] = [];
  if (frequency === "monthly") {
    months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  } else if (frequency === "quarterly") {
    // Get the most common 4 months (or derive from pattern)
    const sortedMonths = Array.from(monthCounts.keys()).sort((a, b) => a - b);
    if (sortedMonths.length >= 2) {
      const firstMonth = sortedMonths[0];
      months = [
        firstMonth,
        ((firstMonth + 2) % 12) + 1,
        ((firstMonth + 5) % 12) + 1,
        ((firstMonth + 8) % 12) + 1,
      ].sort((a, b) => a - b);
    } else {
      months = [3, 6, 9, 12]; // Default quarterly
    }
  } else if (frequency === "annual") {
    // Use most common month
    const sortedMonths = Array.from(monthCounts.keys());
    months = sortedMonths.length > 0 ? [sortedMonths[0]] : [12];
  } else {
    // Irregular - use historical months
    months = Array.from(monthCounts.keys()).sort((a, b) => a - b);
  }

  return { frequency, months };
}

/**
 * Calculate monthly projected dividends using Yahoo Finance annual rate
 * combined with historical payment schedule
 */
export async function calculateYahooMonthlyProjections(
  accountId?: string,
  filterSymbol?: string
): Promise<MonthlyYahooProjection[]> {
  const currentYear = new Date().getFullYear();

  // Get current holdings with quantities
  const holdingsData = await getHoldingsWithQuantities(accountId);

  if (holdingsData.length === 0) {
    return [];
  }

  // Filter by symbol if specified
  const filteredHoldings = filterSymbol
    ? holdingsData.filter((h) => h.symbol === filterSymbol)
    : holdingsData;

  // Get dividend info from Yahoo Finance
  const symbols = filteredHoldings.map((h) => h.symbol);
  const dividendInfo = await getDividendInfoBatch(symbols);

  // Build monthly data
  const monthlyData: { [key: string]: { cad: number; usd: number } } = {};
  for (let m = 1; m <= 12; m++) {
    const monthKey = `${currentYear}-${String(m).padStart(2, "0")}`;
    monthlyData[monthKey] = { cad: 0, usd: 0 };
  }

  // Calculate projections for each holding
  for (const holding of filteredHoldings) {
    const info = dividendInfo.get(holding.symbol);
    if (!info) continue;

    // Calculate annual dividend
    let annualDividend = 0;
    if (info.trailingAnnualDividendRate && info.trailingAnnualDividendRate > 0) {
      annualDividend = info.trailingAnnualDividendRate * holding.quantity;
    } else if (info.dividendYield && info.dividendYield > 0 && info.price > 0) {
      annualDividend = (info.dividendYield / 100) * info.price * holding.quantity;
    }

    if (annualDividend <= 0) continue;

    // Get payment schedule from historical data
    const schedule = await getPaymentSchedule(holding.symbol, accountId);

    // Calculate per-payment amount based on frequency
    const paymentsPerYear = schedule.months.length || 1;
    const amountPerPayment = annualDividend / paymentsPerYear;

    // Add to monthly data for each payment month
    for (const month of schedule.months) {
      const monthKey = `${currentYear}-${String(month).padStart(2, "0")}`;
      if (monthlyData[monthKey]) {
        if (info.currency === "CAD") {
          monthlyData[monthKey].cad += amountPerPayment;
        } else {
          monthlyData[monthKey].usd += amountPerPayment;
        }
      }
    }
  }

  // Convert to array format
  const result: MonthlyYahooProjection[] = [];
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

/**
 * Calculate projected dividends using Yahoo Finance data
 * This uses current holdings and Yahoo Finance dividend yield/rate
 */
export async function calculateYahooProjectedDividends(
  accountId?: string
): Promise<YahooProjectionSummary> {
  const currentYear = new Date().getFullYear();

  // Get current holdings with quantities
  const holdingsData = await getHoldingsWithQuantities(accountId);

  if (holdingsData.length === 0) {
    return {
      projections: [],
      totalProjectedAnnual: 0,
      totalProjectedMonthly: 0,
      year: currentYear,
    };
  }

  // Get dividend info from Yahoo Finance
  const symbols = holdingsData.map((h) => h.symbol);
  const dividendInfo = await getDividendInfoBatch(symbols);

  const projections: YahooProjection[] = [];

  for (const holding of holdingsData) {
    const info = dividendInfo.get(holding.symbol);

    if (!info) continue;

    // Calculate annual dividend
    let annualDividendPerShare: number | null = null;
    let projectedAnnualDividend = 0;

    if (info.trailingAnnualDividendRate && info.trailingAnnualDividendRate > 0) {
      // Use trailing annual dividend rate directly
      annualDividendPerShare = info.trailingAnnualDividendRate;
      projectedAnnualDividend = annualDividendPerShare * holding.quantity;
    } else if (info.dividendYield && info.dividendYield > 0 && info.price > 0) {
      // Calculate from yield: yield = annual dividend / price
      // dividendYield is already in percentage (e.g., 3.74 for 3.74%)
      annualDividendPerShare = (info.dividendYield / 100) * info.price;
      projectedAnnualDividend = annualDividendPerShare * holding.quantity;
    }

    const marketValue = info.price * holding.quantity;

    projections.push({
      symbol: holding.symbol,
      currency: info.currency,
      quantity: holding.quantity,
      price: info.price,
      marketValue,
      dividendYield: info.dividendYield,
      annualDividendPerShare,
      projectedAnnualDividend,
      projectedQuarterlyDividend: projectedAnnualDividend / 4,
      projectedMonthlyDividend: projectedAnnualDividend / 12,
    });
  }

  // Sort by projected annual descending
  projections.sort((a, b) => b.projectedAnnualDividend - a.projectedAnnualDividend);

  const totalProjectedAnnual = projections.reduce(
    (sum, p) => sum + p.projectedAnnualDividend,
    0
  );

  return {
    projections,
    totalProjectedAnnual,
    totalProjectedMonthly: totalProjectedAnnual / 12,
    year: currentYear,
  };
}

/**
 * Get holdings with quantities
 */
async function getHoldingsWithQuantities(
  accountId?: string
): Promise<{ symbol: string; quantity: number }[]> {
  const whereClause: Record<string, unknown> = {
    action: { in: ["Buy", "Sell"] },
    symbolMapped: { not: null },
  };
  if (accountId) {
    whereClause.accountId = accountId;
  }

  const transactions = await prisma.transaction.findMany({
    where: whereClause,
    select: {
      symbolMapped: true,
      quantity: true,
    },
  });

  // Sum quantities by symbol
  const holdings = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.symbolMapped) {
      const current = holdings.get(tx.symbolMapped) || 0;
      holdings.set(tx.symbolMapped, current + (tx.quantity || 0));
    }
  }

  // Return symbols with positive holdings
  const result: { symbol: string; quantity: number }[] = [];
  for (const [symbol, qty] of holdings) {
    if (qty > 0) {
      result.push({ symbol, quantity: qty });
    }
  }
  return result;
}

/**
 * Get symbols with dividends that are currently held
 */
export async function getHeldDividendSymbols(accountId?: string): Promise<string[]> {
  const currentHoldings = await getCurrentHoldings(accountId);

  // Get all dividend symbols
  const whereClause: Record<string, unknown> = {
    action: "DIV",
    symbolMapped: { not: null },
  };
  if (accountId) {
    whereClause.accountId = accountId;
  }

  const results = await prisma.transaction.findMany({
    where: whereClause,
    select: { symbolMapped: true },
    distinct: ["symbolMapped"],
  });

  // Filter to only current holdings
  return results
    .map((r) => r.symbolMapped!)
    .filter((symbol) => symbol && currentHoldings.has(symbol))
    .sort();
}

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
 * Get current holdings (symbols with positive quantity)
 */
async function getCurrentHoldings(accountId?: string): Promise<Set<string>> {
  const whereClause: Record<string, unknown> = {
    action: { in: ["Buy", "Sell"] },
    symbolMapped: { not: null },
  };
  if (accountId) {
    whereClause.accountId = accountId;
  }

  const transactions = await prisma.transaction.findMany({
    where: whereClause,
    select: {
      symbolMapped: true,
      quantity: true,
    },
  });

  // Sum quantities by symbol
  const holdings = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.symbolMapped) {
      const current = holdings.get(tx.symbolMapped) || 0;
      holdings.set(tx.symbolMapped, current + (tx.quantity || 0));
    }
  }

  // Return symbols with positive holdings
  const result = new Set<string>();
  for (const [symbol, qty] of holdings) {
    if (qty > 0) {
      result.add(symbol);
    }
  }
  return result;
}

/**
 * Calculate projected dividends for the current year
 */
export async function calculateProjectedDividends(
  accountId?: string,
  year?: number
): Promise<ProjectionSummary> {
  const currentYear = year || new Date().getFullYear();

  // Get current holdings
  const currentHoldings = await getCurrentHoldings(accountId);

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

  // Group by symbol, aggregating same-day payments
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

    // Skip symbols not in current holdings
    if (!currentHoldings.has(symbol)) continue;

    if (!symbolMap.has(symbol)) {
      symbolMap.set(symbol, {
        symbol,
        currency: div.currency,
        payments: [],
      });
    }

    const date = new Date(div.settlementDate);
    const dateStr = date.toISOString().split("T")[0];
    const existingPayment = symbolMap.get(symbol)!.payments.find(
      (p) => p.date.toISOString().split("T")[0] === dateStr
    );

    if (existingPayment) {
      // Aggregate same-day payments
      existingPayment.amount += Math.abs(div.netAmount || 0);
    } else {
      symbolMap.get(symbol)!.payments.push({
        date,
        amount: Math.abs(div.netAmount || 0),
      });
    }
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

  // Get current holdings
  const currentHoldings = await getCurrentHoldings(accountId);

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

  // Group payments by symbol and date to aggregate same-day payments
  const symbolData = new Map<
    string,
    {
      currency: string;
      // Keyed by date string for deduplication
      paymentsByDate: Map<string, { month: number; amount: number }>;
    }
  >();

  for (const div of dividends) {
    const sym = div.symbolMapped || div.symbol || "UNKNOWN";

    // Skip symbols not in current holdings (unless specific symbol is requested)
    if (!symbol && !currentHoldings.has(sym)) continue;

    const date = new Date(div.settlementDate);
    const dateStr = date.toISOString().split("T")[0];
    const month = date.getMonth() + 1; // 1-12
    const amount = Math.abs(div.netAmount || 0);

    if (!symbolData.has(sym)) {
      symbolData.set(sym, {
        currency: div.currency,
        paymentsByDate: new Map(),
      });
    }

    const existing = symbolData.get(sym)!.paymentsByDate.get(dateStr);
    if (existing) {
      existing.amount += amount;
    } else {
      symbolData.get(sym)!.paymentsByDate.set(dateStr, { month, amount });
    }
  }

  // Detect frequency from payments with dates
  const detectPaymentFrequency = (
    paymentDates: string[]
  ): "monthly" | "quarterly" | "annual" | "irregular" => {
    if (paymentDates.length < 2) return "irregular";

    const sorted = paymentDates.sort();
    let totalGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap =
        (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) /
        (1000 * 60 * 60 * 24);
      totalGap += gap;
    }
    const avgGap = totalGap / (sorted.length - 1);

    if (avgGap >= 300 && avgGap <= 400) return "annual";
    if (avgGap >= 75 && avgGap <= 120) return "quarterly";
    if (avgGap >= 20 && avgGap <= 45) return "monthly";
    return "irregular";
  };

  // Get projected payment months based on frequency and historical pattern
  const getProjectedMonths = (
    payments: { month: number; amount: number }[],
    paymentDates: string[]
  ): number[] => {
    const frequency = detectPaymentFrequency(paymentDates);

    // Get unique months from historical data
    const historicalMonths = [...new Set(payments.map((p) => p.month))].sort((a, b) => a - b);

    if (frequency === "monthly") {
      // Monthly: expect all 12 months
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    } else if (frequency === "quarterly") {
      // Quarterly: use historical months to determine pattern (e.g., 3,6,9,12 or 1,4,7,10)
      if (historicalMonths.length >= 2) {
        // Find the pattern - get first month and add 3, 6, 9
        const firstMonth = historicalMonths[0];
        return [
          firstMonth,
          ((firstMonth + 2) % 12) + 1,
          ((firstMonth + 5) % 12) + 1,
          ((firstMonth + 8) % 12) + 1,
        ].sort((a, b) => a - b);
      }
      // Default quarterly pattern
      return [3, 6, 9, 12];
    } else if (frequency === "annual") {
      // Annual: use most common month
      if (historicalMonths.length > 0) {
        return [historicalMonths[0]];
      }
      return [12]; // Default December
    }

    // Irregular: just use historical months
    return historicalMonths;
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
    const payments = Array.from(data.paymentsByDate.values());
    const paymentDates = Array.from(data.paymentsByDate.keys());
    const projectedMonths = getProjectedMonths(payments, paymentDates);

    // Calculate average payment (from aggregated payments)
    const avgPayment = payments.length > 0
      ? payments.reduce((sum, p) => sum + p.amount, 0) / payments.length
      : 0;

    for (const month of projectedMonths) {
      const monthKey = `${targetYear}-${String(month).padStart(2, "0")}`;
      if (monthlyData[monthKey]) {
        if (data.currency === "CAD") {
          monthlyData[monthKey].cad += avgPayment;
        } else {
          monthlyData[monthKey].usd += avgPayment;
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
