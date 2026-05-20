/**
 * Pure functions for technical indicator calculations.
 * No side effects, no external dependencies.
 */

// ---------------------------------------------------------------------------
// SMA (Simple Moving Average)
// ---------------------------------------------------------------------------

export function sma(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += closes[j];
      }
      result.push(Math.round((sum / period) * 100) / 100);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// RSI (Relative Strength Index) — Wilder's smoothed method
// ---------------------------------------------------------------------------

export function rsi(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];

  if (closes.length < period + 1) {
    return closes.map(() => null);
  }

  // First `period` entries are null (need period+1 prices to get period changes)
  for (let i = 0; i <= period; i++) {
    result.push(null);
  }

  // Calculate initial average gain/loss from first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // RSI for index = period
  const firstRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = Math.round((100 - 100 / (1 + firstRs)) * 100) / 100;

  // Smoothed RSI for subsequent values
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    result.push(Math.round(rsiVal * 100) / 100);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Signal detection (Golden Cross, Death Cross, RSI extremes)
// ---------------------------------------------------------------------------

export interface Signal {
  date: string;
  type: "BUY" | "SELL";
  reason: "GOLDEN_CROSS" | "DEATH_CROSS" | "RSI_OVERSOLD" | "RSI_OVERBOUGHT";
  price: number;
}

export function detectSignals(
  dates: string[],
  closes: number[],
  sma50: (number | null)[],
  sma200: (number | null)[],
  rsi14: (number | null)[]
): Signal[] {
  const signals: Signal[] = [];

  for (let i = 1; i < dates.length; i++) {
    const prevSma50 = sma50[i - 1];
    const prevSma200 = sma200[i - 1];
    const currSma50 = sma50[i];
    const currSma200 = sma200[i];

    // Golden Cross: SMA50 crosses above SMA200
    if (
      prevSma50 != null && prevSma200 != null &&
      currSma50 != null && currSma200 != null
    ) {
      if (prevSma50 <= prevSma200 && currSma50 > currSma200) {
        signals.push({
          date: dates[i],
          type: "BUY",
          reason: "GOLDEN_CROSS",
          price: closes[i],
        });
      }
      // Death Cross: SMA50 crosses below SMA200
      if (prevSma50 >= prevSma200 && currSma50 < currSma200) {
        signals.push({
          date: dates[i],
          type: "SELL",
          reason: "DEATH_CROSS",
          price: closes[i],
        });
      }
    }

    // RSI extremes
    const prevRsi = rsi14[i - 1];
    const currRsi = rsi14[i];
    if (prevRsi != null && currRsi != null) {
      // RSI crosses below 30 (entering oversold territory)
      if (prevRsi >= 30 && currRsi < 30) {
        signals.push({
          date: dates[i],
          type: "BUY",
          reason: "RSI_OVERSOLD",
          price: closes[i],
        });
      }
      // RSI crosses above 70 (entering overbought territory)
      if (prevRsi <= 70 && currRsi > 70) {
        signals.push({
          date: dates[i],
          type: "SELL",
          reason: "RSI_OVERBOUGHT",
          price: closes[i],
        });
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Quant buy signal evaluation (for dividend investors)
// ---------------------------------------------------------------------------

export interface BuySignalResult {
  level: "HOLD" | "STANDARD" | "AGGRESSIVE";
  score: number; // 0-4
  reasons: string[];
  allocationMultiplier: number; // 0, 1, 2
}

export function evaluateBuySignal(params: {
  currentYield: number | null;
  avg5YYield: number | null;
  rsi14: number | null;
  priceVs200SMA: number | null; // % above/below 200 SMA (negative = below)
  fromHighPct: number; // negative = below 52w high
  payoutRatio: number | null;
  divStreakYears: number;
  div5YCAGR: number | null;
}): BuySignalResult {
  const reasons: string[] = [];

  // Safety filter: disqualify if fundamentals are weak
  if (params.divStreakYears < 5) {
    reasons.push(`Dividend streak only ${params.divStreakYears} years (< 5)`);
    return { level: "HOLD", score: 0, reasons, allocationMultiplier: 0 };
  }
  if (params.div5YCAGR != null && params.div5YCAGR < 5) {
    reasons.push(`5Y dividend CAGR ${params.div5YCAGR.toFixed(1)}% (< 5%)`);
    return { level: "HOLD", score: 0, reasons, allocationMultiplier: 0 };
  }
  if (params.payoutRatio != null && params.payoutRatio > 75) {
    reasons.push(`Payout ratio ${params.payoutRatio}% (> 75%)`);
    return { level: "HOLD", score: 0, reasons, allocationMultiplier: 0 };
  }

  // Individual condition flags
  const yieldAboveAvg115 =
    params.currentYield != null &&
    params.avg5YYield != null &&
    params.avg5YYield > 0 &&
    params.currentYield > params.avg5YYield * 1.15;
  const yieldAboveAvg130 =
    params.currentYield != null &&
    params.avg5YYield != null &&
    params.avg5YYield > 0 &&
    params.currentYield > params.avg5YYield * 1.30;
  const rsiBelow25 = params.rsi14 != null && params.rsi14 < 25;
  const rsiBelow35 = params.rsi14 != null && params.rsi14 < 35;
  const priceBelow200SMA = params.priceVs200SMA != null && params.priceVs200SMA < 0;
  const fromHighBelow15 = params.fromHighPct < -15;
  const fromHighBelow25 = params.fromHighPct < -25;

  // Score for STANDARD: count of 4 conditions met
  let score = 0;
  if (yieldAboveAvg115) {
    score++;
    reasons.push(
      `Yield ${params.currentYield!.toFixed(2)}% > 115% of 5Y avg ${params.avg5YYield!.toFixed(2)}%`
    );
  }
  if (rsiBelow35) {
    score++;
    reasons.push(`RSI ${params.rsi14!.toFixed(1)} < 35 (oversold)`);
  }
  if (priceBelow200SMA) {
    score++;
    reasons.push(`Price ${params.priceVs200SMA!.toFixed(1)}% below 200 SMA`);
  }
  if (fromHighBelow15) {
    score++;
    reasons.push(`${params.fromHighPct.toFixed(1)}% from 52-week high (< -15%)`);
  }

  // AGGRESSIVE: any 2-of-3 extreme conditions
  const isAggressive =
    (yieldAboveAvg130 && rsiBelow25) ||
    (yieldAboveAvg130 && fromHighBelow25) ||
    (rsiBelow25 && fromHighBelow25);

  if (isAggressive) {
    return { level: "AGGRESSIVE", score, reasons, allocationMultiplier: 2.0 };
  }
  if (score >= 2) {
    return { level: "STANDARD", score, reasons, allocationMultiplier: 1.0 };
  }

  if (reasons.length === 0) {
    reasons.push("No buy conditions met");
  }
  return { level: "HOLD", score, reasons, allocationMultiplier: 0 };
}
