import { strict as assert } from "node:assert";

import {
  executeYearEndSequence,
  type YearEndPortfolio,
  type YearEndTradeOrder,
} from "./year-end-sequence";

class FakeYearEndPortfolio implements YearEndPortfolio {
  readonly orders: Array<YearEndTradeOrder & { action: "BUY" | "SELL" }> = [];
  atomicCalls = 0;
  totalValue: number;
  tqqqMarketValue: number;
  tqqqCostBasis: number;
  sgovValue: number;
  schdValue: number;
  qldValue: number;

  constructor(args: {
    totalValue: number;
    tqqqMarketValue: number;
    tqqqCostBasis: number;
    sgovValue: number;
    schdValue: number;
    qldValue: number;
  }) {
    this.totalValue = args.totalValue;
    this.tqqqMarketValue = args.tqqqMarketValue;
    this.tqqqCostBasis = args.tqqqCostBasis;
    this.sgovValue = args.sgovValue;
    this.schdValue = args.schdValue;
    this.qldValue = args.qldValue;
  }

  getPosition(symbol: string, account: string) {
    if (symbol === "TQQQ" && account === "TFSA") {
      return { symbol, account, marketValue: this.tqqqMarketValue, costBasis: this.tqqqCostBasis };
    }
    return null;
  }

  getWeight(symbol: string): number {
    if (symbol === "SGOV") return this.sgovValue / this.totalValue;
    return 0;
  }

  async sell(order: YearEndTradeOrder) {
    assert.equal(order.account, "TFSA");
    this.orders.push({ action: "SELL", ...order });
    if (order.symbol === "TQQQ") this.tqqqMarketValue -= order.amount;
    if (order.symbol === "SGOV") this.sgovValue -= order.amount;
  }

  async buy(order: YearEndTradeOrder) {
    assert.equal(order.account, "TFSA");
    this.orders.push({ action: "BUY", ...order });
    if (order.symbol === "SGOV") this.sgovValue += order.amount;
    if (order.symbol === "SCHD") this.schdValue += order.amount;
    if (order.symbol === "QLD") this.qldValue += order.amount;
  }

  async rebalanceCoreToSGOV() {
    const trimAmount = 100;
    this.qldValue -= trimAmount;
    this.sgovValue += trimAmount;
    this.orders.push({
      action: "SELL",
      symbol: "QLD",
      account: "TFSA",
      amount: trimAmount,
      reason: "CORE_REBALANCE_TRIM",
    });
    this.orders.push({
      action: "BUY",
      symbol: "SGOV",
      account: "TFSA",
      amount: trimAmount,
      reason: "CORE_TRIM_ROUTED",
    });
    return { active: true, trimAmount };
  }

  snapshot() {
    return {
      totalValue: this.totalValue,
      tqqqMarketValue: this.tqqqMarketValue,
      sgovValue: this.sgovValue,
      schdValue: this.schdValue,
      qldValue: this.qldValue,
    };
  }

  async transaction<T>(fn: (portfolio: YearEndPortfolio) => Promise<T>): Promise<T> {
    this.atomicCalls++;
    return fn(this);
  }
}

const portfolio = new FakeYearEndPortfolio({
  totalValue: 10_000,
  tqqqMarketValue: 1_600,
  tqqqCostBasis: 1_000,
  sgovValue: 500,
  schdValue: 5_000,
  qldValue: 2_900,
});

async function main() {
  const result = await executeYearEndSequence(portfolio, new Date(Date.UTC(2026, 11, 31)));

  assert.equal(portfolio.atomicCalls, 1);
  assert.deepEqual(
    portfolio.orders.map((order) => `${order.action}:${order.symbol}:${order.reason}:${order.amount}`),
    [
      "SELL:TQQQ:YEAR_END_PROFIT_TAKE:600",
      "BUY:SGOV:TQQQ_PROFIT_ROUTED:600",
      "SELL:QLD:CORE_REBALANCE_TRIM:100",
      "BUY:SGOV:CORE_TRIM_ROUTED:100",
      "SELL:SGOV:SGOV_CAP_EXCEEDED:400",
      "BUY:SCHD:SGOV_CAP_OVERFLOW:240",
      "BUY:QLD:SGOV_CAP_OVERFLOW:160",
    ],
  );
  assert.equal(result.log[0].action, "TQQQ profit take to SGOV");
  assert.equal(result.log[2].action, "SGOV cap check");
  assert.equal(result.log[3].schdAmount, 240);
  assert.equal(result.log[3].qldAmount, 160);
  assert.equal(result.finalSnapshot.sgovValue, 800);

  console.log("year-end-sequence tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
