export interface YearEndPosition {
  symbol: string;
  account: "TFSA" | string;
  marketValue: number;
  costBasis: number;
}

export interface YearEndTradeOrder {
  symbol: "TQQQ" | "SGOV" | "SCHD" | "QLD" | string;
  account: "TFSA";
  amount: number;
  reason: string;
}

export interface YearEndPortfolio {
  totalValue: number;
  getPosition(symbol: string, account: "TFSA"): YearEndPosition | null;
  getWeight(symbol: string): number;
  sell(order: YearEndTradeOrder): Promise<void>;
  buy(order: YearEndTradeOrder): Promise<void>;
  rebalanceCoreToSGOV(args: {
    targets: { SCHD: 0.6; QLD: 0.4 };
    destination: "SGOV";
    account: "TFSA";
  }): Promise<unknown>;
  snapshot(): Record<string, unknown>;
  transaction?<T>(fn: (portfolio: YearEndPortfolio) => Promise<T>): Promise<T>;
}

export interface YearEndLog {
  step: number;
  action: string;
  amount?: number;
  excess?: number;
  schdAmount?: number;
  qldAmount?: number;
  detail?: unknown;
}

export interface YearEndResult {
  log: YearEndLog[];
  finalSnapshot: Record<string, unknown>;
}

const SGOV_MAX_WEIGHT = 0.08;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertDec31(date: Date) {
  if (date.getUTCMonth() !== 11 || date.getUTCDate() !== 31) {
    throw new Error("executeYearEndSequence must run on Dec 31");
  }
}

export async function executeYearEndSequence(
  portfolio: YearEndPortfolio,
  date: Date,
): Promise<YearEndResult> {
  assertDec31(date);

  const run = async (p: YearEndPortfolio): Promise<YearEndResult> => {
    const log: YearEndLog[] = [];

    const tqqqPos = p.getPosition("TQQQ", "TFSA");
    if (tqqqPos && tqqqPos.marketValue > tqqqPos.costBasis) {
      const profit = tqqqPos.marketValue - tqqqPos.costBasis;
      await p.sell({
        symbol: "TQQQ",
        account: "TFSA",
        amount: profit,
        reason: "YEAR_END_PROFIT_TAKE",
      });
      await p.buy({
        symbol: "SGOV",
        account: "TFSA",
        amount: profit,
        reason: "TQQQ_PROFIT_ROUTED",
      });
      log.push({ step: 1, action: "TQQQ profit take to SGOV", amount: profit });
    } else {
      log.push({ step: 1, action: "TQQQ profit take skipped", amount: 0 });
    }

    const trimResult = await p.rebalanceCoreToSGOV({
      targets: { SCHD: 0.6, QLD: 0.4 },
      destination: "SGOV",
      account: "TFSA",
    });
    log.push({ step: 2, action: "Core rebalance trim to SGOV", detail: trimResult });

    const sgovWeight = p.getWeight("SGOV");
    log.push({ step: 3, action: "SGOV cap check", amount: sgovWeight });

    if (sgovWeight > SGOV_MAX_WEIGHT) {
      const excess = roundMoney((sgovWeight - SGOV_MAX_WEIGHT) * p.totalValue);
      const schdAmount = roundMoney(excess * 0.6);
      const qldAmount = roundMoney(excess - schdAmount);

      await p.sell({
        symbol: "SGOV",
        account: "TFSA",
        amount: excess,
        reason: "SGOV_CAP_EXCEEDED",
      });
      await p.buy({
        symbol: "SCHD",
        account: "TFSA",
        amount: schdAmount,
        reason: "SGOV_CAP_OVERFLOW",
      });
      await p.buy({
        symbol: "QLD",
        account: "TFSA",
        amount: qldAmount,
        reason: "SGOV_CAP_OVERFLOW",
      });

      log.push({
        step: 4,
        action: "SGOV cap overflow to Core",
        excess,
        schdAmount,
        qldAmount,
      });
    }

    return { log, finalSnapshot: p.snapshot() };
  };

  if (portfolio.transaction) return portfolio.transaction(run);
  return run(portfolio);
}
