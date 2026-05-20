import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/app/api/cron/snapshot/route.ts"), "utf8");

assert.match(
  source,
  /RULEBOOK_VERSION:\s*4\.4\.2/,
  "cron snapshot must preserve Rulebook v4.4.2 traceability",
);

assert.match(
  source,
  /computePortfolioValueCAD/,
  "cron snapshot must compute today's PortfolioSnapshot cache value through the event-sourced portfolio engine",
);

assert.match(
  source,
  /prisma\.cashLedger\.findMany/,
  "cron snapshot must read CashLedger rows for engine cash reconstruction",
);

assert.match(
  source,
  /portfolioSnapshot\.upsert/,
  "cron snapshot must continue upserting PortfolioSnapshot as a daily cache",
);

assert.match(
  source,
  /legacy.*totalCAD|legacyTotalCAD|legacySnapshotValue/i,
  "cron snapshot must keep a legacy current-state value for one-release drift comparison",
);

assert.match(
  source,
  /driftPercent|driftBps|driftCAD|driftReport/i,
  "cron snapshot must record/report engine-vs-legacy drift",
);

assert.match(
  source,
  /0\.5|0\.005|50\s*\/\s*10000/,
  "cron snapshot migration drift threshold must be 0.5% before P7 stabilization",
);

assert.match(
  source,
  /Telegram|telegram|alertPayload|sendAlert|alerts/i,
  "cron snapshot must create an alert payload for drift or JEPQ invariant violations without requiring live Telegram in tests",
);

assert.match(
  source,
  /JEPQ/,
  "cron snapshot must check the JEPQ distribution invariant",
);

assert.match(
  source,
  /DIVIDEND[\s\S]{0,240}JEPQ|JEPQ[\s\S]{0,240}DIVIDEND/,
  "cron snapshot must inspect recent JEPQ DIVIDEND transactions",
);

assert.match(
  source,
  /BUY/,
  "cron snapshot must detect follow-up automatic BUY transactions after JEPQ distributions",
);

assert.match(
  source,
  /24\s*\*\s*60\s*\*\s*60|setHours\(|subHours|oneDayAgo|twentyFourHoursAgo/i,
  "cron snapshot must limit JEPQ invariant checks to the last 24 hours",
);

assert.match(
  source,
  /cashLedgerRows\.length\s*===\s*0|cashLedgerRows\.length\s*<\s*1|!cashLedgerRows\.length|hasLedgerRows/i,
  "cron snapshot must suppress drift alerts when CashLedger is empty and engine falls back to legacy values",
);

console.log("cron engine cache source tests passed");
