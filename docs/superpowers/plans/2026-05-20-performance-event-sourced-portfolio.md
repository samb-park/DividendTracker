# Performance Event-Sourced Portfolio Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/overview > PERFORMANCE` Portfolio Value source from daily `PortfolioSnapshot` reads to transaction/dividend/cash-flow reconstruction while keeping snapshots as a cache and preserving BASE, shadow benchmark, XIRR, colors, and Rulebook v4.4.2 behavior.

**Architecture:** Add an event-sourced cash ledger beside the existing `Portfolio`/`Holding`/`Transaction` schema. Use pure portfolio engine helpers to reconstruct positions, cash balances, and CAD portfolio value for each chart date; keep `/api/snapshots` response shape stable so the chart component needs minimal changes. Roll out in phases: additive schema, backfill, dual-run drift audit, API switch, cron cache writer.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6, PostgreSQL, ECharts, tsx-based regression tests.

---

## Current State

### Existing schema facts

- `prisma/schema.prisma:26-37` — `Portfolio` currently acts as account container with `accountType`, `cashCAD`, `cashUSD`, `holdings`, and `cashTransactions`.
- `prisma/schema.prisma:39-54` — `Holding` stores current state: `portfolioId`, `ticker`, `currency`, `quantity`, `avgCost`, `isActive`.
- `prisma/schema.prisma:56-73` — `Transaction` stores holding-level `BUY | SELL | DIVIDEND`, with `date`, `quantity`, `price`, `commission`, `fxRateCAD`; no `netAmount`, no cash ledger relation.
- `prisma/schema.prisma:75-88` — `CashTransaction` stores external `DEPOSIT | WITHDRAWAL`; no BUY/SELL/DIVIDEND cash impact rows.
- `prisma/schema.prisma:121-132` — `PortfolioSnapshot` stores daily cached `totalCAD`, `costBasisCAD`, `cashCAD`, unique by `[userId, date]`.
- No `Account`, `CashLedger`, `ExternalDeposit`, `FxConversion`, or separate `Dividend` model exists today. Actual dividends are `Transaction.action = DIVIDEND`.

### Review correction decisions — 2026-05-20

1. Dividend modeling recommendation: **Option A for Phase 1** — add nullable dividend metadata directly to `Transaction` where `action = DIVIDEND`:
   - `exDate DateTime?`
   - `payDate DateTime?`
   - `amountPerShare Decimal? @db.Decimal(18, 6)`
   - `sharesAtRecord Decimal? @db.Decimal(18, 6)`
   - `withholdingTax Decimal? @db.Decimal(18, 4)`

   Reasoning: current production truth is already `Transaction.action = DIVIDEND`; Option A keeps one dividend cash source, avoids a new dual-source `Dividend` table during the cash-ledger migration, keeps existing routes/tests compatible, and is additive/nullable. This is enough for SCHD static 70/30 routing evidence and JEPQ/QQQI distribution isolation. Option B, a separate `Dividend` model, is cleaner only if the app later needs a full dividend lifecycle table for declared/estimated/confirmed events independent of portfolio transactions. If needed later, add `Dividend` as Phase 2 with nullable `Transaction.dividendId`; do not deprecate `Transaction.DIVIDEND` in Phase 1.

   Migration impact: low. Nullable columns only; no rewrite required. Backfill can populate fields when known and leave unknown historical rows null. No Prisma destructive migration.

2. JEPQ distribution invariant: `Transaction.action = DIVIDEND AND ticker = JEPQ` must create only USD cash income in `CashLedger`; it must not create an implicit BUY or mutate position. Any detected automatic BUY generated from a JEPQ dividend is an alert candidate for Telegram.

3. Reconciliation report: backfill dry-run/write output must group by `(Portfolio, currency)` and include ledger balance, current `Portfolio.cashCAD/cashUSD`, difference, and unclassified/ambiguous ledger row count.

4. Performance chart supplementary tasks recommendation: **Option X** — keep chart tasks as Phase 2/preservation verification, not bundled into the engine/backfill PR. BASE formula/dropdown, shadow benchmark, VALUE CAGR→XIRR, and color visibility were already implemented and deployed; Phase 1 should preserve those behaviors through existing regression tests instead of mixing UI/metric changes with schema/backfill risk. Phase 2 is only needed for extra WCAG formalization or new UI work.


### Existing runtime sources

- `src/app/api/snapshots/route.ts:39-47` — PERFORMANCE currently reads `prisma.portfolioSnapshot.findMany(...)` as the main chart value source.
- `src/app/api/snapshots/route.ts:48-56` — cumulative dividend is approximated from `Transaction.action = DIVIDEND`.
- `src/app/api/snapshots/route.ts:57-64` and `95-102` — XIRR/benchmark contribution events come from `CashTransaction`; USD uses `FX_FALLBACK = 1.35`.
- `src/app/api/cron/snapshot/route.ts:63-98` — daily cron computes snapshot from current `Holding.quantity`, live Yahoo prices, and `Portfolio.cashCAD/cashUSD`, then upserts `PortfolioSnapshot`.
- `src/app/api/transactions/route.ts:124-135` — creating BUY/SELL/DIVIDEND only creates `Transaction`; it does not create a cash ledger entry.
- `src/app/api/cash-transactions/route.ts:100-109` — creating DEPOSIT/WITHDRAWAL only creates `CashTransaction`; it does not create a unified ledger row.
- `src/components/performance-chart.tsx` already consumes `/api/snapshots?range=...`; safest UI rollout is preserving `{ snapshots, contributionEventsCAD }` while changing the source behind it.

### Missing model pieces

- No audit-grade cash movement ledger that can explain every cash balance.
- No separate external deposit model that distinguishes true contributions from internal cash movements.
- No FX conversion entity tying CAD debit and USD credit rows together.
- No daily historical FX source table; historical USD conversions are scattered/fallback-based.
- Current holdings are current-state fields; transaction history may be incomplete, so immediate strict reconstruction can drift from current UI values.

---

## Schema Diff

Additive-only Prisma migration. Do not drop or rewrite existing tables. Initially reference existing `Portfolio` rather than forcing a new `Account` migration; `Portfolio` already has `accountType` and ownership. `Account` can be added later only if the UI/domain genuinely needs a separate abstraction.

```prisma
enum CashLedgerEventType {
  DEPOSIT
  WITHDRAWAL
  BUY
  SELL
  DIVIDEND
  DRIP
  FX_CONVERT
  FEE
  ADJUSTMENT
}

model ExternalDeposit {
  id          String     @id @default(cuid())
  portfolioId String
  portfolio   Portfolio  @relation(fields: [portfolioId], references: [id], onDelete: Cascade)
  date        DateTime
  amount      Decimal    @db.Decimal(18, 2)
  currency    Currency
  source      String?    // manual | questrade | backfill
  notes       String?
  cashTransactionId String? @unique
  cashTransaction   CashTransaction? @relation(fields: [cashTransactionId], references: [id], onDelete: SetNull)
  ledgerRows  CashLedger[]
  createdAt   DateTime   @default(now())

  @@index([portfolioId, date])
  @@unique([portfolioId, date, amount, currency, source])
}

model FxConversion {
  id            String    @id @default(cuid())
  portfolioId   String
  portfolio     Portfolio @relation(fields: [portfolioId], references: [id], onDelete: Cascade)
  date          DateTime
  fromCurrency  Currency
  fromAmount    Decimal   @db.Decimal(18, 2)
  toCurrency    Currency
  toAmount      Decimal   @db.Decimal(18, 2)
  fxRateCAD     Decimal?  @db.Decimal(10, 6)
  source        String?   // manual | questrade | backfill
  notes         String?
  ledgerRows    CashLedger[]
  createdAt     DateTime  @default(now())

  @@index([portfolioId, date])
}

model FxRateDaily {
  id        String   @id @default(cuid())
  date      DateTime @db.Date
  pair      String   // USD/CAD
  rate      Decimal  @db.Decimal(10, 6)
  source    String   // BoC | Yahoo | fallback
  createdAt DateTime @default(now())

  @@unique([date, pair])
}

model CashLedger {
  id                  String              @id @default(cuid())
  portfolioId          String
  portfolio            Portfolio           @relation(fields: [portfolioId], references: [id], onDelete: Cascade)
  date                 DateTime
  currency             Currency
  amount               Decimal             @db.Decimal(18, 4) // signed: +cash in, -cash out
  eventType            CashLedgerEventType
  ticker               String?
  notes                String?
  source               String?             // manual | transaction_route | cash_route | backfill | questrade
  relatedTransactionId String?
  relatedTransaction   Transaction?         @relation(fields: [relatedTransactionId], references: [id], onDelete: SetNull)
  relatedCashTransactionId String?
  relatedCashTransaction   CashTransaction? @relation(fields: [relatedCashTransactionId], references: [id], onDelete: SetNull)
  externalDepositId    String?
  externalDeposit      ExternalDeposit?    @relation(fields: [externalDepositId], references: [id], onDelete: SetNull)
  fxConversionId       String?
  fxConversion         FxConversion?       @relation(fields: [fxConversionId], references: [id], onDelete: SetNull)
  createdAt            DateTime            @default(now())

  @@index([portfolioId, date])
  @@index([portfolioId, currency, date])
  @@index([relatedTransactionId])
  @@index([relatedCashTransactionId])
  @@unique([eventType, relatedTransactionId, currency])
  @@unique([eventType, relatedCashTransactionId, currency])
}
```

Also add relations to existing models:

```prisma
model Portfolio {
  // existing fields...
  cashLedgerRows CashLedger[]
  externalDeposits ExternalDeposit[]
  fxConversions FxConversion[]
}

model Transaction {
  // existing fields...
  // Nullable dividend metadata; meaningful when action = DIVIDEND.
  exDate          DateTime?
  payDate         DateTime?
  amountPerShare  Decimal? @db.Decimal(18, 6)
  sharesAtRecord  Decimal? @db.Decimal(18, 6)
  withholdingTax  Decimal? @db.Decimal(18, 4)
  cashLedgerRows  CashLedger[]
}

model CashTransaction {
  // existing fields...
  externalDeposit ExternalDeposit?
  cashLedgerRows CashLedger[]
}
```

Migration commands:

```bash
cd /mnt/fast_data/docker/apps/DividendTracker
npx prisma validate
npx prisma migrate dev --name add_cash_ledger_event_sourcing
npx prisma generate
```

Production migration deploy, using host DB substitution if needed:

```bash
set -a; . ./.env >/dev/null 2>&1; set +a
export DATABASE_URL="${DATABASE_URL/infra-postgres/100.88.130.67}"
npx prisma migrate deploy
npx prisma generate
```

Risk controls:

- All new columns/tables only; no destructive migration.
- Do not remove `Portfolio.cashCAD`, `Portfolio.cashUSD`, `Holding.quantity`, or `PortfolioSnapshot`.
- `PortfolioSnapshot` remains cache and rollback source while dual-run drift auditing is active.

---

## Implementation

### File map

- Create `src/lib/portfolio/engine.ts` — pure reconstruction helpers plus typed orchestration helpers.
- Create `src/lib/portfolio/engine.test.ts` — unit regression tests for cash, positions, dividends/DRIP, JEPQ/QQQI no auto-reinvest, value CAD.
- Create `src/lib/portfolio/ledger.ts` — helper functions that create ledger rows for transaction/cash/fx events inside Prisma transactions.
- Create `src/lib/portfolio/drift.ts` — snapshot-vs-engine drift calculation and alert threshold helper.
- Create `scripts/backfill-cash-ledger.ts` — idempotent backfill from `CashTransaction` and `Transaction`.
- Modify `prisma/schema.prisma` — additive tables above.
- Modify `src/app/api/transactions/route.ts` — wrap create in `prisma.$transaction`; create corresponding ledger row.
- Modify `src/app/api/cash-transactions/route.ts` — wrap create in `prisma.$transaction`; create `ExternalDeposit` and ledger row.
- Add `src/app/api/fx-conversions/route.ts` — manual FX conversion endpoint with two ledger rows.
- Modify `src/app/api/snapshots/route.ts` — keep response shape but generate daily values from engine; optionally fallback to snapshots during migration.
- Modify `src/app/api/cron/snapshot/route.ts` — compute today with engine, upsert snapshot as cache, compare drift, send Telegram alert if threshold exceeded.
- Inspect/create Telegram helper before final wiring; current source search did not find an obvious helper under `src`, so either add a small internal helper or use existing ops notification utility if found later.

### Engine skeleton

Use pure helpers first; pass in all rows/market data so tests do not hit DB/network.

```ts
// src/lib/portfolio/engine.ts
export type Currency = "CAD" | "USD";
export type EngineTransactionAction = "BUY" | "SELL" | "DIVIDEND";

export interface EngineTransaction {
  id: string;
  portfolioId: string;
  ticker: string;
  currency: Currency;
  action: EngineTransactionAction;
  date: string; // YYYY-MM-DD
  quantity: number;
  price: number;
  commission: number;
}

export interface EngineCashLedgerRow {
  id: string;
  portfolioId: string;
  date: string;
  currency: Currency;
  amount: number; // signed
  eventType: "DEPOSIT" | "WITHDRAWAL" | "BUY" | "SELL" | "DIVIDEND" | "DRIP" | "FX_CONVERT" | "FEE" | "ADJUSTMENT";
  ticker?: string | null;
}

export interface MarketPricePoint {
  date: string;
  ticker: string;
  close: number;
  currency: Currency;
}

export interface FxRatePoint {
  date: string;
  usdCad: number;
}

export interface PortfolioValuePoint {
  date: string;
  totalCAD: number;
  costBasisCAD: number;
  cashCAD: number;
  cumulativeDividendCAD: number;
}

export function computePosition(
  transactions: EngineTransaction[],
  portfolioId: string,
  ticker: string,
  date: string,
): number {
  return transactions
    .filter((tx) => tx.portfolioId === portfolioId && tx.ticker === ticker && tx.date <= date)
    .reduce((qty, tx) => {
      if (tx.action === "BUY") return qty + tx.quantity;
      if (tx.action === "SELL") return qty - tx.quantity;
      // DIVIDEND is cash income; DRIP share purchases must be represented as BUY rows.
      return qty;
    }, 0);
}

export function computeCashBalance(
  ledgerRows: EngineCashLedgerRow[],
  portfolioId: string,
  currency: Currency,
  date: string,
): number {
  return ledgerRows
    .filter((row) => row.portfolioId === portfolioId && row.currency === currency && row.date <= date)
    .reduce((sum, row) => sum + row.amount, 0);
}

export function computePortfolioValueCAD(input: {
  date: string;
  portfolioIds: string[];
  transactions: EngineTransaction[];
  ledgerRows: EngineCashLedgerRow[];
  prices: MarketPricePoint[];
  fxRates: FxRatePoint[];
}): PortfolioValuePoint {
  const usdCad = findUsdCad(input.fxRates, input.date);
  const tickers = Array.from(new Set(input.transactions.map((tx) => tx.ticker)));
  let securitiesCAD = 0;
  let costBasisCAD = 0;
  let cashCAD = 0;
  let cumulativeDividendCAD = 0;

  for (const portfolioId of input.portfolioIds) {
    cashCAD += computeCashBalance(input.ledgerRows, portfolioId, "CAD", input.date);
    cashCAD += computeCashBalance(input.ledgerRows, portfolioId, "USD", input.date) * usdCad;

    for (const ticker of tickers) {
      const tickerTxns = input.transactions.filter((tx) => tx.portfolioId === portfolioId && tx.ticker === ticker);
      if (tickerTxns.length === 0) continue;
      const qty = computePosition(input.transactions, portfolioId, ticker, input.date);
      if (qty <= 0) continue;
      const price = findClose(input.prices, ticker, input.date);
      const currency = tickerTxns[0].currency;
      securitiesCAD += qty * price * (currency === "USD" ? usdCad : 1);
      costBasisCAD += computeCostBasisCAD(tickerTxns, input.date, usdCad);
    }

    cumulativeDividendCAD += input.ledgerRows
      .filter((row) => row.portfolioId === portfolioId && row.eventType === "DIVIDEND" && row.date <= input.date)
      .reduce((sum, row) => sum + row.amount * (row.currency === "USD" ? usdCad : 1), 0);
  }

  return roundValuePoint({
    date: input.date,
    totalCAD: securitiesCAD + cashCAD,
    costBasisCAD,
    cashCAD,
    cumulativeDividendCAD,
  });
}
```

Support helpers in the same file or split later if it grows:

```ts
function findUsdCad(points: FxRatePoint[], date: string): number {
  const point = [...points].reverse().find((p) => p.date <= date);
  return point?.usdCad ?? 1.35;
}

function findClose(points: MarketPricePoint[], ticker: string, date: string): number {
  const point = [...points].reverse().find((p) => p.ticker === ticker && p.date <= date);
  if (!point) throw new Error(`Missing price for ${ticker} at ${date}`);
  return point.close;
}

function computeCostBasisCAD(transactions: EngineTransaction[], date: string, currentUsdCad: number): number {
  let shares = 0;
  let basis = 0;
  for (const tx of transactions.filter((t) => t.date <= date).sort((a, b) => a.date.localeCompare(b.date))) {
    const fx = tx.currency === "USD" ? currentUsdCad : 1;
    if (tx.action === "BUY") {
      shares += tx.quantity;
      basis += (tx.quantity * tx.price + tx.commission) * fx;
    } else if (tx.action === "SELL" && shares > 0) {
      const soldRatio = Math.min(tx.quantity / shares, 1);
      basis -= basis * soldRatio;
      shares -= tx.quantity;
    }
  }
  return Math.max(0, basis);
}

function roundValuePoint(point: PortfolioValuePoint): PortfolioValuePoint {
  return {
    ...point,
    totalCAD: Math.round(point.totalCAD * 100) / 100,
    costBasisCAD: Math.round(point.costBasisCAD * 100) / 100,
    cashCAD: Math.round(point.cashCAD * 100) / 100,
    cumulativeDividendCAD: Math.round(point.cumulativeDividendCAD * 100) / 100,
  };
}
```

### Ledger write rules

```ts
// BUY: cash out in holding currency
amount = -(quantity * price + commission)
eventType = "BUY"

// SELL: cash in in holding currency
amount = quantity * price - commission
eventType = "SELL"

// DIVIDEND: current schema means gross dividend amount = quantity * price; commission reduces net if present
amount = quantity * price - commission
eventType = "DIVIDEND"

// CashTransaction DEPOSIT/WITHDRAWAL
DEPOSIT => +amount
WITHDRAWAL => -amount
```

Rulebook-specific behavior:

- SCHD dividend DRIP/routing must remain explicit transactions, not hidden automation. If a SCHD dividend is reinvested 70/30, represent it as `DIVIDEND` cash-in plus explicit `BUY` rows for SCHD/QLD. Do not auto-route in engine.
- QQQI distributions: create USD cash ledger income only; no automatic reinvestment.
- JEPQ distributions: create USD cash ledger income only; no automatic reinvestment. If any BUY is created or detected as automatically linked to a JEPQ DIVIDEND, emit a Telegram alert candidate. The engine must treat DIVIDEND as cash only; position changes require explicit BUY rows.
- Legacy income ticker guard remains in `src/app/api/transactions/route.ts`.

### `/api/snapshots` rollout

Keep response contract:

```json
{
  "snapshots": [
    { "date": "2026-05-20", "totalCAD": 123, "costBasisCAD": 100, "cashCAD": 23, "cumulativeDividendCAD": 5 }
  ],
  "contributionEventsCAD": [
    { "date": "2026-05-01", "amountCAD": 460 }
  ]
}
```

Implementation order:

1. Add `source=engine|snapshot` internal flag in code, but do not expose unless needed.
2. Generate valuation dates from existing snapshot dates during dual-run so chart density stays stable.
3. Compute engine values for those dates.
4. If engine cannot compute due missing historical prices/fx, fallback to snapshots and log/alert non-fatal warning.
5. After backfill confidence, make engine primary with snapshot fallback.

### Cron cache writer and drift alert

- Compute `engineToday` from engine.
- Compute `legacyToday` from current holdings/cash method for one release only.
- Drift:

```ts
const driftPct = Math.abs(engineToday.totalCAD - legacyToday.totalCAD) / Math.max(legacyToday.totalCAD, 1);
```

- Alert threshold: use 0.5% during migration to reduce noise, then tighten to 0.1% after data is clean. User mentioned both; plan should start with 0.5% migration gate and document 0.1% final invariant.
- Upsert `PortfolioSnapshot` with engine values; snapshot becomes cache, not source-of-truth.
- Telegram alert impact: yes, only for abnormal drift/missing data; normal cron should stay quiet.
- DailyAudit impact: snapshot values may change after API switch/cache recompute; include one-line reason if DailyAudit consumes snapshot deltas.

---

## Data Backfill

Create `scripts/backfill-cash-ledger.ts`.

Backfill rules:

1. Read all `CashTransaction` rows.
2. For each row, create `ExternalDeposit` and `CashLedger` if not already present.
3. Read all `Transaction` rows with holding/portfolio.
4. For each BUY/SELL/DIVIDEND, create corresponding signed `CashLedger` if not already present.
5. Use Prisma transaction batching.
6. Print reconciliation report grouped by `(Portfolio, currency)`:
   - portfolio name and `accountType`
   - currency (`CAD` or `USD`)
   - ledger cash balance
   - current matching field: `Portfolio.cashCAD` for CAD, `Portfolio.cashUSD` for USD
   - difference
   - unclassified/ambiguous ledger row count
7. Do not mutate `Portfolio.cashCAD/cashUSD` in the first backfill. Report drift only.
8. Add a `--write` flag. Default dry-run prints counts only.

Command pattern:

```bash
cd /mnt/fast_data/docker/apps/DividendTracker
set -a; . ./.env >/dev/null 2>&1; set +a
export DATABASE_URL="${DATABASE_URL/infra-postgres/100.88.130.67}"
npx --yes tsx scripts/backfill-cash-ledger.ts
npx --yes tsx scripts/backfill-cash-ledger.ts --write
```

Backfill script outline:

```ts
const write = process.argv.includes("--write");
const cashTxns = await prisma.cashTransaction.findMany({ include: { portfolio: true } });
const txns = await prisma.transaction.findMany({ include: { holding: { include: { portfolio: true } } } });

for (const tx of cashTxns) {
  const signed = tx.action === "DEPOSIT" ? tx.amount : tx.amount.neg();
  if (write) {
    await prisma.$transaction(async (db) => {
      const external = await db.externalDeposit.upsert({ ... });
      await db.cashLedger.upsert({ ... });
    });
  }
}

for (const tx of txns) {
  const amount = signedAmountFromTransaction(tx);
  if (write) await prisma.cashLedger.upsert({ ... });
}
```

Manual UI/API gaps to add after core backfill:

- FX conversion input: date, portfolio, from currency/amount, to currency/amount, optional rate/notes.
- Manual adjustment input: date, portfolio, currency, amount, reason; requires warning label because it affects reconstruction.
- Deposit import UI can remain `CashTransaction` initially; route will mirror to `ExternalDeposit`/`CashLedger`.

---

## Regression Test

### Required test scenarios

Create `src/lib/portfolio/engine.test.ts` with Node `assert` style, matching existing project test convention.

1. Cash flow and buy:
   - deposit CAD 460 on 2026-06-01
   - BUY SCHD USD/CAD or CAD example equivalent costing 322 on 2026-06-02
   - expected cash = 138 in same currency after buy.

2. Dividend and explicit DRIP:
   - SCHD dividend cash +30
   - explicit BUY SCHD 21 and BUY QLD 9
   - expected cash returns to 0 and positions increase only through BUY rows.

3. QQQI distribution no auto-reinvest:
   - QQQI dividend USD +10
   - no BUY rows
   - expected USD cash +10 and QQQI position unchanged.

4. JEPQ distribution isolation invariant:
   - JEPQ dividend USD +10
   - no BUY rows
   - expected USD cash +10 and JEPQ position unchanged
   - automatic BUY detection returns a Telegram alert candidate.

5. Snapshot drift helper:
   - snapshot total 1000, engine total 1004 = below 0.5%
   - snapshot total 1000, engine total 1006 = alert.

6. XIRR preserved:
   - existing `src/lib/performance-metrics.test.ts` and `src/lib/performance-shadow.test.ts` must still pass.

7. BASE slope preserved:
   - existing `src/lib/performance-projection.test.ts` must still pass; no change to `BASE_RATE_OPTIONS`, 12%, benchmark cyan, or ECharts config unless explicitly needed.

Example test command set:

```bash
cd /mnt/fast_data/docker/apps/DividendTracker
npx --yes tsx src/lib/portfolio/engine.test.ts
npx --yes tsx src/lib/performance-shadow.test.ts
npx --yes tsx src/lib/performance-metrics.test.ts
npx --yes tsx src/lib/performance-projection.test.ts
npx --yes tsx src/components/performance-chart-dropdowns.test.ts
npx prisma validate
npx prisma generate
npm run typecheck -- --pretty false
npx eslint src/lib/portfolio/engine.ts src/lib/portfolio/engine.test.ts src/app/api/snapshots/route.ts src/app/api/cron/snapshot/route.ts src/app/api/transactions/route.ts src/app/api/cash-transactions/route.ts
npm test
npm run build
```

### Implementation tasks

### Task 1: Add pure portfolio engine tests first — RED

**Files:**
- Create: `src/lib/portfolio/engine.test.ts`
- Create later or in the same RED phase: `src/lib/portfolio/drift.test.ts`

- [ ] Write failing tests for cash, buy, dividend/explicit DRIP, QQQI distribution, JEPQ distribution invariant, position reconstruction, FX CAD valuation, and drift threshold.
- [ ] Run `npx --yes tsx src/lib/portfolio/engine.test.ts`; expect FAIL because helpers do not exist.
- [ ] Do not write production engine code before observing RED.

### Task 2: Add additive Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] Add enums/models from Schema Diff.
- [ ] Add nullable dividend metadata fields to `Transaction`.
- [ ] Run `npx prisma validate`; expect PASS.
- [ ] Run `npx prisma migrate dev --name add_cash_ledger_event_sourcing`; expect migration file.
- [ ] Run `npx prisma generate`; expect Prisma Client generated.
- [ ] Run required targeted test/typecheck/test/build before next phase.

### Task 3: Implement pure engine and drift helpers — GREEN

**Files:**
- Create: `src/lib/portfolio/engine.ts`
- Create: `src/lib/portfolio/drift.ts`

- [ ] Implement minimal helpers to pass tests.
- [ ] Run `npx --yes tsx src/lib/portfolio/engine.test.ts` and `drift.test.ts`; expect PASS.
- [ ] Commit: `feat: add portfolio reconstruction engine`.

### Task 4: Add ledger writer helpers

**Files:**
- Create: `src/lib/portfolio/ledger.ts`
- Test: `src/lib/portfolio/ledger.test.ts` if Prisma-mocked tests are feasible; otherwise cover through route/backfill tests.

- [ ] Implement signed amount helpers independent of Prisma.
- [ ] Implement Prisma transaction helper signatures.
- [ ] Run targeted tests.
- [ ] Commit: `feat: add portfolio cash ledger writers`.

### Task 5: Backfill script dry-run/write

**Files:**
- Create: `scripts/backfill-cash-ledger.ts`

- [ ] Write dry-run counts.
- [ ] Implement idempotent `--write` with upserts.
- [ ] Run dry-run locally against runtime DB.
- [ ] Run write only after user approval.
- [ ] Commit: `feat: backfill cash ledger from historical activity`.

### Task 6: Mirror new writes into ledger

**Files:**
- Modify: `src/app/api/transactions/route.ts:124-135`
- Modify: `src/app/api/cash-transactions/route.ts:100-110`

- [ ] Wrap creates in `prisma.$transaction`.
- [ ] Create ledger rows through helper.
- [ ] Preserve existing response shape.
- [ ] Verify Rulebook legacy ticker guard still blocks BUY of legacy income ticker.
- [ ] Commit: `feat: mirror activity writes to cash ledger`.

### Task 7: Switch `/api/snapshots` to engine primary with fallback

**Files:**
- Modify: `src/app/api/snapshots/route.ts`

- [ ] Preserve auth/range validation and JSON shape.
- [ ] Use existing snapshot dates as valuation dates during migration.
- [ ] Compute engine values.
- [ ] Fallback to snapshot rows if market/fx data missing.
- [ ] Keep `contributionEventsCAD` from true external deposits/cash transactions.
- [ ] Commit: `feat: source performance snapshots from engine`.

### Task 8: Update snapshot cron as cache writer and drift monitor

**Files:**
- Modify: `src/app/api/cron/snapshot/route.ts`
- Add or reuse notification helper after source inspection.

- [ ] Compute engine today.
- [ ] Compute legacy value only for drift comparison during rollout.
- [ ] Upsert `PortfolioSnapshot` using engine values.
- [ ] Alert Telegram only if drift exceeds migration threshold or required data missing.
- [ ] Keep Bearer CRON_SECRET protection unchanged.
- [ ] Commit: `feat: make snapshot cron engine cache writer`.

### Task 9: Preserve chart behavior and verify UI

**Files:**
- Inspect: `src/components/performance-chart.tsx`
- Tests: existing performance tests.

- [ ] Confirm no chart response contract break.
- [ ] Confirm benchmark cyan dashed line constants unchanged.
- [ ] Confirm BASE 12%/ALL band unchanged.
- [ ] Run mobile/desktop smoke only after code execution and deployment approval.
- [ ] Commit only if UI changes are actually needed.

### Task 10: Full verification and deployment checklist

- [ ] Run all commands listed in Regression Test.
- [ ] If schema touched, deploy migration before app image.
- [ ] Deploy only after user says “진행/배포”.
- [ ] Production checks:

```bash
docker compose up -d --build app
curl -fsS http://localhost:3000/api/health
docker inspect -f 'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} started={{.State.StartedAt}}' dividendtracker
curl -sS -I http://localhost:3000/v1 | head -n 5
docker logs --since 3m dividendtracker 2>&1 | grep -Ei 'ReferenceError|PrismaClientValidationError|Unknown field|uncaught|fatal|error|failed' || true
```

---

## Rollback Plan

- Keep `PortfolioSnapshot` reads as fallback in `/api/snapshots` behind a small internal switch.
- If drift/missing data is high, revert only `/api/snapshots` and cron source while keeping additive tables; no data loss.
- Additive tables can remain unused until backfill is corrected.
- Do not drop migration in production; use forward fix.
