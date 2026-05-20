import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/app/api/snapshots/route.ts"), "utf8");

assert.match(
  source,
  /computePortfolioValueCAD/,
  "/api/snapshots must reconstruct portfolio values through the event-sourced portfolio engine",
);

assert.match(
  source,
  /prisma\.cashLedger\.findMany/,
  "/api/snapshots must read CashLedger rows as the cash source of truth",
);

assert.match(
  source,
  /deriveCashLedgerRowsFromExistingRecords/,
  "/api/snapshots must derive a transaction/cash-flow ledger when the physical CashLedger table is not migrated yet",
);

assert.match(
  source,
  /deriveOpeningTransactionsFromCurrentHoldings/,
  "/api/snapshots must seed opening positions from current holdings minus post-anchor transactions",
);

assert.match(
  source,
  /deriveOpeningCashLedgerRows/,
  "/api/snapshots must seed opening cash so post-anchor cash flows reconcile to current account cash",
);

assert.match(
  source,
  /CashLedger unavailable; using derived Transaction\/CashTransaction ledger/,
  "/api/snapshots must keep the overview Performance graph alive when CashLedger is unavailable",
);

assert.match(
  source,
  /transaction\.action !== \"DIVIDEND\"/,
  "Dividend cash amounts must not be used as market price points for Performance valuation",
);

assert.match(
  source,
  /portfolioSnapshot\.findMany/,
  "/api/snapshots may still read PortfolioSnapshot as valuation-date cache during migration",
);

assert.doesNotMatch(
  source,
  /totalCAD:\s*parseFloat\(s\.totalCAD\.toString\(\)\)/,
  "/api/snapshots must not map PortfolioSnapshot.totalCAD directly as the primary portfolio value",
);

assert.match(
  source,
  /contributionEventsCAD/,
  "/api/snapshots must preserve contributionEventsCAD for XIRR and shadow benchmark callers",
);

console.log("snapshots engine source tests passed");
