"use client";

import { useEffect, useState } from "react";
import { PanelEmpty, DataBadge } from "../panel-state";
import { fmtPrice, fmtPct, fmtChange, toneClass } from "../format";
import { cn } from "@/lib/utils";

interface PriceData {
  ticker: string;
  name: string;
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  week52High: number;
  week52Low: number;
  fromHighPct: number;
  fromLowPct: number;
  dividendRate: number | null;
  dividendYield: number | null;
  exDividendDate: string | null;
  dividendDate: string | null;
  payoutRatio: number | null;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums text-[11px] text-foreground", tone)}>{value}</span>
    </div>
  );
}

export function FundamentalsPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<PriceData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "no_data" | "error">("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setData(null);
    fetch(`/api/price/${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) return { kind: "no_data" as const };
        if (!res.ok) return { kind: "error" as const };
        return { kind: "ok" as const, body: (await res.json()) as PriceData };
      })
      .then((r) => {
        if (!alive) return;
        if (r.kind === "ok") {
          setData(r.body);
          setStatus("ok");
        } else setStatus(r.kind);
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [ticker]);

  if (status === "loading") return <PanelEmpty kind="loading" />;
  if (status === "no_data") return <PanelEmpty kind="no_data" message={`${ticker} 정보 없음`} />;
  if (status === "error" || !data) return <PanelEmpty kind="error" message="펀더멘털 로드 실패" />;

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-bold text-foreground">{data.name}</div>
          <div className="flex items-baseline gap-2">
            <span className="tabular-nums text-base font-bold text-foreground">{fmtPrice(data.price)}</span>
            <span className={cn("tabular-nums text-[11px]", toneClass(data.change))}>
              {fmtChange(data.change)} ({fmtPct(data.changePercent)})
            </span>
          </div>
        </div>
        <DataBadge kind="delayed" label={data.currency} />
      </div>
      <Row label="52주 고점" value={fmtPrice(data.week52High)} />
      <Row label="52주 저점" value={fmtPrice(data.week52Low)} />
      <Row label="고점대비" value={fmtPct(data.fromHighPct)} tone={toneClass(data.fromHighPct)} />
      <Row label="저점대비" value={fmtPct(data.fromLowPct)} tone={toneClass(data.fromLowPct)} />
      <Row label="배당률" value={data.dividendYield != null ? `${data.dividendYield.toFixed(2)}%` : "—"} />
      <Row label="연배당" value={data.dividendRate != null ? fmtPrice(data.dividendRate) : "—"} />
      <Row label="배당락일" value={data.exDividendDate ?? "—"} />
      <Row label="지급일" value={data.dividendDate ?? "—"} />
      <Row label="배당성향" value={data.payoutRatio != null ? `${data.payoutRatio}%` : "—"} />
    </div>
  );
}
