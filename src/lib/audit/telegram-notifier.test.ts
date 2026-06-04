import { strict as assert } from "node:assert";

import { formatDailyAuditMarkdown } from "./telegram-notifier";

const markdown = formatDailyAuditMarkdown({
  date: "2026-12-31",
  headline: "Daily rulebook audit",
  sections: [
    { title: "Section 1", lines: ["ok"] },
    { title: "Section 2", lines: ["ok"] },
    { title: "Section 3", lines: ["ok"] },
    { title: "Section 4", lines: ["ok"] },
    { title: "Section 5", lines: ["ok"] },
  ],
  tqqqTfsaIsolation: {
    ok: false,
    violations: [{ account: "RRSP", message: "TQQQ found in RRSP account (must be TFSA only)" }],
  },
  sgovWeight: {
    weightPct: 8.7,
    includesTqqqProfit: true,
    status: "ABOVE_CAP",
  },
  nextTqqqBuyLimit: {
    account: "TFSA",
    sgovUsdAvailable: 39,
    maxTierUsd: 60,
  },
});

assert.ok(markdown.includes("[Section 6] TQQQ TFSA 격리 상태"));
assert.ok(markdown.includes("VIOLATION"));
assert.ok(markdown.includes("RRSP"));
assert.ok(markdown.includes("[Section 7] SGOV 비중 (TQQQ 익절 자금 포함)"));
assert.ok(markdown.includes("8.7%"));
assert.ok(markdown.includes("[Section 8] 다음 주 TQQQ 매수 가능 한도 (SGOV 잔액)"));
assert.ok(markdown.includes("$39 USD"));

console.log("telegram-notifier tests passed");
