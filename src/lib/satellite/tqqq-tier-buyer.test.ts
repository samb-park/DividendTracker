import { strict as assert } from "node:assert";

import {
  executeTQQQTierBuy,
  getTqqqTierForDrawdown,
  type TqqqTierPortfolio,
} from "./tqqq-tier-buyer";

class FakePortfolio implements TqqqTierPortfolio {
  sgovUsd: number;
  readonly orders: Array<{ action: "BUY" | "SELL"; symbol: string; account: string; amount: number; reason: string }> = [];
  atomicCalls = 0;

  constructor(sgovUsd: number) {
    this.sgovUsd = sgovUsd;
  }

  getBalance(symbol: string, account: string, currency: string): number {
    assert.equal(symbol, "SGOV");
    assert.equal(account, "TFSA");
    assert.equal(currency, "USD");
    return this.sgovUsd;
  }

  async sell(order: { symbol: string; account: string; amount: number; reason: string }) {
    assert.equal(order.account, "TFSA");
    this.sgovUsd -= order.amount;
    this.orders.push({ action: "SELL", ...order });
  }

  async buy(order: { symbol: string; account: string; amount: number; reason: string }) {
    assert.equal(order.account, "TFSA");
    this.orders.push({ action: "BUY", ...order });
  }

  async transaction<T>(fn: (portfolio: TqqqTierPortfolio) => Promise<T>): Promise<T> {
    this.atomicCalls++;
    return fn(this);
  }
}

assert.deepEqual(getTqqqTierForDrawdown(-14.99), { tier: "LT15", amountUsd: 10 });
assert.deepEqual(getTqqqTierForDrawdown(-15), { tier: "D15_30", amountUsd: 20 });
assert.deepEqual(getTqqqTierForDrawdown(-30), { tier: "D30_50", amountUsd: 40 });
assert.deepEqual(getTqqqTierForDrawdown(-50), { tier: "D50_PLUS", amountUsd: 60 });

async function main() {
  const insufficient = await executeTQQQTierBuy(new FakePortfolio(39), 70, 100);
  assert.equal(insufficient.status, "SKIPPED");
  assert.equal(insufficient.reason, "INSUFFICIENT_SGOV_BALANCE");
  assert.equal(insufficient.required, 40);
  assert.equal(insufficient.available, 39);

  const portfolio = new FakePortfolio(100);
  const executed = await executeTQQQTierBuy(portfolio, 50, 100);
  assert.equal(executed.status, "EXECUTED");
  assert.equal(executed.tier, "D50_PLUS");
  assert.equal(executed.amount, 60);
  assert.equal(portfolio.atomicCalls, 1);
  assert.deepEqual(portfolio.orders, [
    { action: "SELL", symbol: "SGOV", account: "TFSA", amount: 60, reason: "TQQQ_TIER_FUNDING" },
    { action: "BUY", symbol: "TQQQ", account: "TFSA", amount: 60, reason: "TQQQ_TIER_D50_PLUS" },
  ]);

  console.log("tqqq-tier-buyer tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
