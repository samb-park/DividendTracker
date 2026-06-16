export type TqqqTierLabel = "LT15" | "D15_30" | "D30_50" | "D50_PLUS";

export interface TqqqTierPortfolio {
  getBalance(symbol: string, account: string, currency: string): number;
  sell(order: { symbol: string; account: "TFSA"; amount: number; reason: string }): Promise<void>;
  buy(order: { symbol: string; account: "TFSA"; amount: number; reason: string }): Promise<void>;
  transaction?<T>(fn: (portfolio: TqqqTierPortfolio) => Promise<T>): Promise<T>;
}

export type TQQQBuyResult =
  | {
      status: "SKIPPED";
      reason: "INSUFFICIENT_SGOV_BALANCE" | "INVALID_252D_HIGH";
      required: number;
      available: number;
      drawdown?: number;
      tier?: TqqqTierLabel;
    }
  | {
      status: "EXECUTED";
      drawdown: number;
      tier: TqqqTierLabel;
      amount: number;
    };

export function getTqqqTierForDrawdown(drawdownPct: number): { tier: TqqqTierLabel; amountUsd: number } {
  if (drawdownPct > -15) return { tier: "LT15", amountUsd: 10 };
  if (drawdownPct > -30) return { tier: "D15_30", amountUsd: 20 };
  if (drawdownPct > -50) return { tier: "D30_50", amountUsd: 40 };
  return { tier: "D50_PLUS", amountUsd: 60 };
}

export async function executeTQQQTierBuy(
  portfolio: TqqqTierPortfolio,
  fridayClose: number,
  high252: number,
): Promise<TQQQBuyResult> {
  if (!Number.isFinite(high252) || high252 <= 0) {
    return {
      status: "SKIPPED",
      reason: "INVALID_252D_HIGH",
      required: 0,
      available: portfolio.getBalance("SGOV", "TFSA", "USD"),
    };
  }

  const drawdown = ((fridayClose - high252) / high252) * 100;
  const { tier, amountUsd } = getTqqqTierForDrawdown(drawdown);
  const available = portfolio.getBalance("SGOV", "TFSA", "USD");

  if (available < amountUsd) {
    return {
      status: "SKIPPED",
      reason: "INSUFFICIENT_SGOV_BALANCE",
      required: amountUsd,
      available,
      drawdown,
      tier,
    };
  }

  const run = async (p: TqqqTierPortfolio) => {
    await p.sell({
      symbol: "SGOV",
      account: "TFSA",
      amount: amountUsd,
      reason: "TQQQ_TIER_FUNDING",
    });
    await p.buy({
      symbol: "TQQQ",
      account: "TFSA",
      amount: amountUsd,
      reason: `TQQQ_TIER_${tier}`,
    });
  };

  if (portfolio.transaction) await portfolio.transaction(run);
  else await run(portfolio);

  return {
    status: "EXECUTED",
    drawdown,
    tier,
    amount: amountUsd,
  };
}
