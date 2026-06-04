export interface DailyAuditSection {
  title: string;
  lines: string[];
}

export interface DailyAuditMarkdownInput {
  date: string;
  headline: string;
  sections: DailyAuditSection[];
  tqqqTfsaIsolation: {
    ok: boolean;
    violations: Array<{ account: string; message: string }>;
  };
  sgovWeight: {
    weightPct: number;
    includesTqqqProfit: boolean;
    status: "OK" | "ABOVE_CAP" | "BELOW_TARGET";
  };
  nextTqqqBuyLimit: {
    account: "TFSA";
    sgovUsdAvailable: number;
    maxTierUsd: number;
  };
}

function moneyUsd(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")} USD`;
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDailyAuditMarkdown(input: DailyAuditMarkdownInput): string {
  const lines: string[] = [
    `${input.headline} (${input.date})`,
    "",
  ];

  for (const section of input.sections) {
    lines.push(`[${section.title}]`);
    for (const line of section.lines) lines.push(`- ${line}`);
    lines.push("");
  }

  lines.push("[Section 6] TQQQ TFSA 격리 상태");
  if (input.tqqqTfsaIsolation.ok) {
    lines.push("- PASS: TQQQ positions are TFSA only.");
  } else {
    lines.push("- VIOLATION: TQQQ must be TFSA only.");
    for (const violation of input.tqqqTfsaIsolation.violations) {
      lines.push(`- ${violation.account}: ${violation.message}`);
    }
  }
  lines.push("");

  lines.push("[Section 7] SGOV 비중 (TQQQ 익절 자금 포함)");
  lines.push(`- 상태: ${input.sgovWeight.status}`);
  lines.push(`- 비중: ${pct(input.sgovWeight.weightPct)}`);
  lines.push(`- TQQQ 익절 자금 포함: ${input.sgovWeight.includesTqqqProfit ? "yes" : "no"}`);
  lines.push("");

  lines.push("[Section 8] 다음 주 TQQQ 매수 가능 한도 (SGOV 잔액)");
  lines.push(`- 계좌: ${input.nextTqqqBuyLimit.account}`);
  lines.push(`- 사용 가능 SGOV: ${moneyUsd(input.nextTqqqBuyLimit.sgovUsdAvailable)}`);
  lines.push(`- tier 최대 필요액: ${moneyUsd(input.nextTqqqBuyLimit.maxTierUsd)}`);

  return lines.join("\n").trimEnd();
}
