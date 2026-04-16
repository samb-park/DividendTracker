"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AddHoldingDialog } from "./add-holding-dialog";
import { HoldingDetailPanel } from "./holding-detail-panel";
import { StrategyStatusPanel } from "./strategy-status-panel";
import { mergeHoldings } from "@/lib/utils";
import { buildAllocationPlan } from "@/lib/investment-allocation";
import { getOverrideTargets, type NdxTier } from "@/lib/investment-triggers";

interface Transaction {
  id: string;
  action: "BUY" | "SELL" | "DIVIDEND";
  quantity: string;
  price: string;
  commission: string;
  date?: string;
  notes?: string | null;
}

interface Holding {
  id: string;
  ticker: string;
  name: string | null;
  currency: "USD" | "CAD";
  quantity: string | null;
  avgCost: string | null;
  transactions: Transaction[];
}

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  week52High: number;
  week52Low: number;
  fromHighPct: number;
  fromLowPct: number;
  dividendRate: number | null;
  dividendYield: number | null;
  trailingAnnualDividendRate: number | null;
  trailingAnnualDividendYield: number | null;
  exDividendDate: string | null;
  dividendDate: string | null;
  payoutRatio: number | null;
}

export interface HoldingRow {
  holding: Holding;
  shares: number;
  avgCost: number;
  costBasis: number;
  price: PriceData | null;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
}

function calcHolding(holding: Holding): Omit<HoldingRow, "price" | "marketValue" | "unrealizedPnL" | "unrealizedPnLPct"> {
  const txns = holding.transactions ?? [];
  const buys = txns.filter((t) => t.action === "BUY");
  const sells = txns.filter((t) => t.action === "SELL");
  const totalBought = buys.reduce((s, t) => s + parseFloat(t.quantity), 0);
  const totalSold = sells.reduce((s, t) => s + parseFloat(t.quantity), 0);
  const totalCost = buys.reduce(
    (s, t) => s + parseFloat(t.quantity) * parseFloat(t.price) + parseFloat(t.commission),
    0
  );
  const shares = holding.quantity != null
    ? parseFloat(holding.quantity)
    : totalBought - totalSold;
  const avgCost = holding.avgCost != null
    ? parseFloat(holding.avgCost)
    : (totalBought > 0 ? totalCost / totalBought : 0);
  const costBasis = avgCost * shares;
  return { holding, shares, avgCost, costBasis };
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function HoldingsTable({
  portfolioId,
  initialHoldings,
  onHoldingsChange,
  onDetailOpen,
  readOnly = false,
  displayCurrency,
  allPortfolios,
  selectedPortfolioId,
  onPortfolioChange,
}: {
  portfolioId: string;
  initialHoldings: Holding[];
  onHoldingsChange: (rows: Array<{ ticker: string; name?: string | null; marketValue: number; costBasis: number; unrealizedPnL: number; unrealizedPnLPct: number; dayChange: number; annualDividend?: number; currency: "USD" | "CAD" }>) => void;
  onDetailOpen?: (open: boolean) => void;
  readOnly?: boolean;
  displayCurrency?: "USD" | "CAD";
  allPortfolios?: { id: string; name: string }[];
  selectedPortfolioId?: string;
  onPortfolioChange?: (id: string) => void;
}) {
  const [holdings, setHoldings] = useState(initialHoldings);
  const [prices, setPrices] = useState<Record<string, PriceData | null>>({});
  const [priceReasons, setPriceReasons] = useState<Record<string, "not_found" | "network">>({});
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [colMode, setColMode] = useState<"usd" | "pct">("usd");
  const [priceMode, setPriceMode] = useState<"price" | "avg">("price");
  const [mktMode, setMktMode] = useState<"mkt" | "cost">("mkt");
  const [wgtMode, setWgtMode] = useState<"total" | "eligible" | "alloc">("total");
  const [w52Mode, setW52Mode] = useState<"high" | "low">("high");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dayMode, setDayMode] = useState<"day" | "yld" | "yoc">("day");
  const [mobileSortKey, setMobileSortKey] = useState<string>("mkt");
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [dividendCuts, setDividendCuts] = useState<Set<string>>(new Set());
  const [dividendCutPcts, setDividendCutPcts] = useState<Record<string, number>>({});
  const [dividendHistory, setDividendHistory] = useState<Set<string>>(new Set());
  const [investTargets, setInvestTargets] = useState<Record<string, number>>({});
  const [excludedTickers, setExcludedTickers] = useState<Set<string>>(new Set());
  const [investContrib, setInvestContrib] = useState<{ amount: number; currency: "USD" | "CAD"; frequency?: string } | null>(null);
  const [fxRate, setFxRate] = useState(1.35);
  const [accountMapping, setAccountMapping] = useState<Record<string, string>>({});
  const [upperTriggerPct, setUpperTriggerPct] = useState(33);
  const [ndxTier, setNdxTier] = useState<NdxTier>(0);
  const [longPressInfo, setLongPressInfo] = useState<{ ticker: string; currency: "USD" | "CAD"; marketValue: number; shares: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const toDisp = (value: number, holdingCurrency: "USD" | "CAD") => {
    if (!displayCurrency || displayCurrency === holdingCurrency) return value;
    return displayCurrency === "CAD" ? value * fxRate : value / fxRate;
  };
  const dispSym = displayCurrency === "CAD" ? "C$" : displayCurrency === "USD" ? "$" : null;

  useEffect(() => {
    fetch("/api/settings/investment").then(r => r.json()).then(d => {
      const targets: Record<string, number> = {};
      const excluded = new Set<string>();
      for (const [ticker, val] of Object.entries(d.targets ?? {})) {
        const v = val as { pct: number; excluded?: boolean };
        if (v.excluded) { excluded.add(ticker); continue; }
        targets[ticker] = v.pct;
      }
      setInvestTargets(targets);
      setExcludedTickers(excluded);
      if (d.contribution) setInvestContrib({ amount: d.contribution.amount, currency: d.contribution.currency, frequency: d.contribution.frequency });
      if (d.accountMapping) setAccountMapping(d.accountMapping);
      if (d.triggerParams?.upperTriggerPct) setUpperTriggerPct(d.triggerParams.upperTriggerPct);
    }).catch(() => {});
    fetch("/api/fx").then(r => r.json()).then(d => { if (d.rate) setFxRate(d.rate); }).catch(() => {});
    fetch("/api/market/ndx").then(r => r.ok ? r.json() : null).then(d => {
      if (d && typeof d.tier === "number") setNdxTier(d.tier as NdxTier);
    }).catch(() => {});
    fetch("/api/dividend-growth").then(r => r.json()).then(d => {
      const map: Record<string, number> = {};
      const cutPcts: Record<string, number> = {};
      const history = new Set<string>();
      const cutsSet = new Set<string>(d.cuts ?? []);
      for (const t of (d.tickers ?? [])) {
        map[t.ticker] = t.streak ?? 0;
        history.add(t.ticker);
        if (cutsSet.has(t.ticker)) {
          const last = t.history?.[t.history.length - 1];
          if (last?.growthPct != null) cutPcts[t.ticker] = last.growthPct;
        }
      }
      setStreaks(map);
      setDividendCuts(cutsSet);
      setDividendCutPcts(cutPcts);
      setDividendHistory(history);
    }).catch(() => {});
  }, []);

  const cycleColMode = () => setColMode(m => m === "usd" ? "pct" : "usd");

  const cycleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === "desc") setSortDir("asc");
      else setSortCol(null);
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };
  const si = (col: string) => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const selectRow = useCallback((id: string | null) => {
    setSelectedRowId(id);
    onDetailOpen?.(id !== null);
  }, [onDetailOpen]);

  const startRowLongPress = useCallback((info: { ticker: string; currency: "USD" | "CAD"; marketValue: number; shares: number }) => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setLongPressInfo(info);
    }, 500);
  }, []);

  const cancelRowLongPress = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  const fetchPrices = useCallback(async (hs: Holding[]) => {
    const results: Record<string, PriceData | null> = {};
    const reasons: Record<string, "not_found" | "network"> = {};
    await Promise.all(
      hs.map(async (h) => {
        try {
          const res = await fetch(`/api/price/${h.ticker}`);
          if (res.ok) {
            results[h.ticker] = await res.json();
          } else {
            results[h.ticker] = null;
            const errData = await res.json().catch(() => ({}));
            reasons[h.ticker] = errData.reason ?? "network";
          }
        } catch {
          results[h.ticker] = null;
          reasons[h.ticker] = "network";
        }
      })
    );
    setPrices(results);
    setPriceReasons(reasons);
    setLoadingPrices(false);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/portfolios`);
    const all = await res.json() as { id: string; holdings: Holding[] }[];
    let updated: Holding[];
    if (portfolioId === "all") {
      updated = mergeHoldings(all);
    } else {
      const portfolio = all.find(p => p.id === portfolioId);
      if (!portfolio) return;
      updated = portfolio.holdings;
    }
    setHoldings(updated);
    await fetchPrices(updated);
  }, [portfolioId, fetchPrices]);

  useEffect(() => {
    setHoldings(initialHoldings);
    fetchPrices(initialHoldings);
  }, [initialHoldings, fetchPrices]);

  const rows: HoldingRow[] = useMemo(() =>
    holdings
      .map((h) => {
        const base = calcHolding(h);
        const price = prices[h.ticker] ?? null;
        const marketValue = price ? base.shares * price.price : 0;
        const unrealizedPnL = marketValue - base.costBasis;
        const unrealizedPnLPct = base.costBasis > 0 ? (unrealizedPnL / base.costBasis) * 100 : 0;
        return { ...base, price, marketValue, unrealizedPnL, unrealizedPnLPct };
      })
      .filter((r) => r.shares > 0 || (r.holding.quantity === null && (r.holding.transactions ?? []).length === 0)),
    [holdings, prices]
  );

  const totalMarketValue = rows.reduce((s, r) => s + r.marketValue, 0);

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      let va = 0, vb = 0;
      if (sortCol === "ticker") {
        const cmp = a.holding.ticker.localeCompare(b.holding.ticker);
        return sortDir === "asc" ? cmp : -cmp;
      }
      switch (sortCol) {
        case "shares": va = a.shares; vb = b.shares; break;
        case "price": va = priceMode === "price" ? (a.price?.price ?? 0) : a.avgCost; vb = priceMode === "price" ? (b.price?.price ?? 0) : b.avgCost; break;
        case "day": {
          const getDayVal = (r: HoldingRow) => {
            if (dayMode === "day") return r.price?.changePercent ?? 0;
            if (dayMode === "yld") return r.price?.trailingAnnualDividendYield ?? r.price?.dividendYield ?? 0;
            const rate = r.price?.trailingAnnualDividendRate ?? r.price?.dividendRate ?? 0;
            return rate > 0 && r.costBasis > 0 ? (rate * r.shares / r.costBasis) * 100 : 0;
          };
          va = getDayVal(a); vb = getDayVal(b); break;
        }
        case "mkt": va = mktMode === "mkt" ? a.marketValue : a.costBasis; vb = mktMode === "mkt" ? b.marketValue : b.costBasis; break;
        case "wgt": va = a.marketValue; vb = b.marketValue; break;
        case "pnl": va = colMode === "usd" ? a.unrealizedPnL : a.unrealizedPnLPct; vb = colMode === "usd" ? b.unrealizedPnL : b.unrealizedPnLPct; break;
        case "w52": va = w52Mode === "high" ? (a.price?.fromHighPct ?? 0) : (a.price?.fromLowPct ?? 0); vb = w52Mode === "high" ? (b.price?.fromHighPct ?? 0) : (b.price?.fromLowPct ?? 0); break;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [rows, sortCol, sortDir, priceMode, mktMode, colMode, w52Mode, dayMode]);

  const totalsByCur = rows.reduce((acc, r) => {
    const c = r.holding.currency;
    acc[c] = acc[c] ?? { mkt: 0, cost: 0, pnl: 0 };
    acc[c].mkt += r.marketValue;
    acc[c].cost += r.costBasis;
    acc[c].pnl += r.unrealizedPnL;
    return acc;
  }, {} as Record<string, { mkt: number; cost: number; pnl: number }>);

  const totalCurrencies = Object.keys(totalsByCur) as ("USD" | "CAD")[];
  const fmtTotal = (mode: "mkt" | "cost") => {
    if (dispSym) {
      const total = totalCurrencies.reduce((sum, c) => {
        const s = totalsByCur[c];
        return sum + toDisp(mode === "mkt" ? s.mkt : s.cost, c);
      }, 0);
      return `${dispSym}${fmt(total)}`;
    }
    return totalCurrencies.map(c => {
      const s = totalsByCur[c];
      const val = mode === "mkt" ? s.mkt : s.cost;
      return `${c === "CAD" ? "C$" : "$"}${fmt(val)}`;
    }).join(" / ");
  };
  const fmtTotalPnL = () => {
    if (dispSym) {
      const total = totalCurrencies.reduce((sum, c) => sum + toDisp(totalsByCur[c].pnl, c), 0);
      return `${total >= 0 ? "+" : ""}${dispSym}${fmt(Math.abs(total))}`;
    }
    return totalCurrencies.map(c => {
      const s = totalsByCur[c];
      return `${s.pnl >= 0 ? "+" : ""}${c === "CAD" ? "C$" : "$"}${fmt(Math.abs(s.pnl))}`;
    }).join(" / ");
  };
  const fmtTotalPnLPct = () => {
    if (dispSym) {
      const totalCost = totalCurrencies.reduce((sum, c) => sum + toDisp(totalsByCur[c].cost, c), 0);
      const totalPnL = totalCurrencies.reduce((sum, c) => sum + toDisp(totalsByCur[c].pnl, c), 0);
      return totalCost > 0 ? fmtPct((totalPnL / totalCost) * 100) : "—";
    }
    return totalCurrencies.map(c => {
      const s = totalsByCur[c];
      const pct = s.cost > 0 ? (s.pnl / s.cost) * 100 : 0;
      return fmtPct(pct);
    }).join(" / ");
  };
  const totalPnLPositive = totalCurrencies.every(c => totalsByCur[c].pnl >= 0);

  // Contribution allocation (Excel Funds column logic)
  // contrib is always in CAD; convert to each stock's native currency
  const contribCAD = investContrib
    ? (investContrib.currency === "CAD" ? investContrib.amount : investContrib.amount * fxRate)
    : 0;
  const toCADValue = (amount: number, currency: "USD" | "CAD") =>
    currency === "USD" ? amount * fxRate : amount;
  const fromCADValue = (amountCAD: number, currency: "USD" | "CAD") =>
    currency === "USD" ? amountCAD / fxRate : amountCAD;

  // Only explicitly excluded tickers (excl=true) are excluded from weight denominator
  const isWeightExcluded = (ticker: string) =>
    excludedTickers.has(ticker);

  const totalMarketValueCAD = rows.reduce(
    (sum, r) => isWeightExcluded(r.holding.ticker) ? sum : sum + toCADValue(r.marketValue, r.holding.currency),
    0
  );
  // All tickers (excl 포함) — for "total" weight mode
  const totalAllMarketValueCAD = rows.reduce(
    (sum, r) => sum + toCADValue(r.marketValue, r.holding.currency),
    0
  );
  // Normalize targets: if excluded tickers cause the sum to be < 100%, scale up the rest
  const totalEligibleTargetPct = Object.entries(investTargets)
    .filter(([ticker]) => !excludedTickers.has(ticker))
    .reduce((sum, [, pct]) => sum + pct, 0);
  const normalizeTargetPct = (ticker: string): number => {
    const raw = investTargets[ticker] ?? 0;
    if (excludedTickers.has(ticker) || totalEligibleTargetPct <= 0 || Math.abs(totalEligibleTargetPct - 100) < 0.01) return raw;
    return (raw / totalEligibleTargetPct) * 100;
  };

  // Hybrid allocation plan (Tier 1: gap>5%, Tier 2: 2~5%, Tier 3: <2%)
  const allExcludedForAlloc = [
    ...excludedTickers,
    ...Object.entries(investTargets).filter(([, pct]) => pct === 0).map(([t]) => t),
  ];
  // NDX 티어 기반 override (tier 1+ 시 QLD 100% 집중)
  const effectiveTargets = getOverrideTargets(ndxTier, investTargets);
  const allocPlan = buildAllocationPlan({
    holdings: rows.map(r => ({ ticker: r.holding.ticker, currency: r.holding.currency, marketValue: r.marketValue })),
    investTargets: effectiveTargets,
    contributionCAD: contribCAD,
    fxRate,
    excludeCashEquivalents: false,
    excludedTickers: allExcludedForAlloc,
  });

  // QLD/SGOV 비중 계산 (전체 자산 기준)
  const qldRow = rows.find(r => r.holding.ticker === "QLD");
  const sgovRow = rows.find(r => r.holding.ticker === "SGOV");
  const qldValueCAD = qldRow ? toCADValue(qldRow.marketValue, qldRow.holding.currency) : 0;
  const sgovValueCAD = sgovRow ? toCADValue(sgovRow.marketValue, sgovRow.holding.currency) : 0;
  const qldPct = totalAllMarketValueCAD > 0 ? (qldValueCAD / totalAllMarketValueCAD) * 100 : 0;
  const sgovPct = totalAllMarketValueCAD > 0 ? (sgovValueCAD / totalAllMarketValueCAD) * 100 : 0;

  // Map ticker → alloc amount in stock's native currency / post-allocation weight
  const allocMap: Record<string, number> = {};
  const gapAmountMap: Record<string, number> = {};
  const postPctMap: Record<string, number> = {};
  for (const r of rows) {
    allocMap[r.holding.ticker] = fromCADValue(allocPlan.allocCADByTicker[r.holding.ticker] ?? 0, r.holding.currency);
    gapAmountMap[r.holding.ticker] = fromCADValue(allocPlan.gapCADByTicker[r.holding.ticker] ?? 0, r.holding.currency);
    postPctMap[r.holding.ticker] = allocPlan.postPctByTicker[r.holding.ticker] ?? 0;
  }

  useEffect(() => {
    if (loadingPrices) return;
    onHoldingsChange(
      rows.map((r) => ({
        ticker: r.holding.ticker,
        marketValue: r.marketValue,
        costBasis: r.costBasis,
        unrealizedPnL: r.unrealizedPnL,
        unrealizedPnLPct: r.unrealizedPnLPct,
        dayChange: r.price ? r.price.change * r.shares : 0,
        annualDividend: r.price
          ? ((r.price.trailingAnnualDividendRate ?? r.price.dividendRate ?? 0) * r.shares)
          : 0,
        name: r.holding.name,
        currency: r.holding.currency,
      }))
    );
  }, [prices, holdings, loadingPrices, onHoldingsChange]);

  const selectedRow = sortedRows.find((r) => r.holding.id === selectedRowId) ?? null;

  return (
    <div>
      <div>
        {!readOnly && investTargets && Object.keys(investTargets).length > 0 && rows.length > 0 && (
          <StrategyStatusPanel
            qldPct={qldPct}
            sgovPct={sgovPct}
            upperTriggerPct={upperTriggerPct}
            qldTargetPct={investTargets["QLD"] ?? 30}
          />
        )}
        <div className="flex items-center justify-between mb-3">
          {rows.length > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              {rows.length} POSITION{rows.length !== 1 ? "S" : ""}
            </span>
          ) : <span />}
          {!readOnly && <AddHoldingDialog portfolioId={portfolioId} onAdd={refresh} />}
        </div>
        {rows.length === 0 ? (
          <div className="text-muted-foreground text-xs py-8 text-center border border-dashed border-border">
            NO POSITIONS — ADD A STOCK TO BEGIN
          </div>
        ) : (
          <>
          {/* Mobile sort pills + wgtMode toggle */}
          {(() => {
            const mobileSortOptions = [
              { key: "mkt", label: "MKT" },
              { key: "pnl", label: "P&L" },
              { key: "day", label: "DAY" },
              { key: "wgt", label: "WGT" },
              { key: "ticker", label: "A-Z" },
            ] as const;
            return (
              <div className="sm:hidden flex items-center justify-between gap-1 mb-2">
                <button
                  className={`btn-retro text-[9px] px-1.5 py-0.5 ${wgtMode === "eligible" ? "btn-retro-primary" : ""}`}
                  onClick={() => setWgtMode(m => m === "total" ? "eligible" : "total")}
                  title="Weight: excl 포함 / excl 제외"
                >
                  {wgtMode === "eligible" ? "ELG" : "ALL"}
                </button>
                <div className="flex items-center gap-1">
                  {mobileSortOptions.map(({ key, label }) => (
                    <button
                      key={key}
                      className={`btn-retro text-[9px] px-1.5 py-0.5 ${mobileSortKey === key ? "btn-retro-primary" : ""}`}
                      onClick={() => {
                        if (mobileSortKey === key) {
                          setSortDir(d => d === "desc" ? "asc" : "desc");
                        } else {
                          setMobileSortKey(key);
                          setSortCol(key);
                          setSortDir("desc");
                        }
                      }}
                    >
                      {label}{mobileSortKey === key ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          <div className="sm:hidden space-y-2">
            {loadingPrices ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border border-border p-3 bg-card animate-pulse">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="space-y-1.5">
                      <div className="h-3.5 bg-border/40 rounded-none w-14" />
                      <div className="h-2.5 bg-border/40 rounded-none w-24" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-3.5 bg-border/40 rounded-none w-24 ml-auto" />
                      <div className="h-2.5 bg-border/40 rounded-none w-20 ml-auto" />
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 pt-2 border-t border-border/30">
                    <div className="h-2.5 bg-border/40 rounded-none w-32" />
                    <div className="flex gap-3">
                      <div className="h-2.5 bg-border/40 rounded-none w-10" />
                      <div className="h-2.5 bg-border/40 rounded-none w-14" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              sortedRows.map((row) => {
                const cur = dispSym ?? (row.holding.currency === "CAD" ? "C$" : "$");
                const holdingCAD = toCADValue(row.marketValue, row.holding.currency);
                const weight = wgtMode === "total"
                  ? (totalAllMarketValueCAD > 0 ? (holdingCAD / totalAllMarketValueCAD) * 100 : 0)
                  : (totalMarketValueCAD > 0 && !isWeightExcluded(row.holding.ticker) ? (holdingCAD / totalMarketValueCAD) * 100 : 0);
                const priceUnavailable = !loadingPrices && !row.price;
                const priceReason = priceReasons[row.holding.ticker];
                const todayChange = row.price ? row.price.change * row.shares : null;
                const annualDivRate = row.price?.trailingAnnualDividendRate ?? row.price?.dividendRate ?? 0;
                const divYield = row.price?.trailingAnnualDividendYield ?? row.price?.dividendYield ?? null;
                const annualDivIncome = annualDivRate > 0 ? annualDivRate * row.shares : null;
                const sharesStr = Number.isInteger(row.shares) ? fmt(row.shares, 0) : fmt(row.shares, row.shares < 10 ? 4 : 2);
                return (
                  <div
                    key={row.holding.id}
                    className={`border border-border p-3 cursor-pointer select-none active:bg-border/20 ${selectedRowId === row.holding.id ? "border-l-4 border-l-accent bg-accent/10" : "bg-card"}`}
                    onClick={() => { if (!longPressTriggeredRef.current) selectRow(row.holding.id); }}
                    onPointerDown={() => startRowLongPress({ ticker: row.holding.ticker, currency: row.holding.currency, marketValue: row.marketValue, shares: row.shares })}
                    onPointerUp={cancelRowLongPress}
                    onPointerLeave={cancelRowLongPress}
                    onContextMenu={e => e.preventDefault()}
                  >
                    {/* Row 1: ticker + market value */}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-accent font-medium text-sm">{row.holding.ticker}</span>
                      <span className="tabular-nums text-sm font-medium flex-shrink-0">
                        {priceUnavailable
                          ? <span className="text-negative text-xs" title={priceReason === "not_found" ? "Ticker not found" : "Price unavailable"}>{priceReason === "not_found" ? "DELISTED?" : "PRICE N/A"}</span>
                          : row.marketValue > 0 ? `${cur}${fmt(toDisp(row.marketValue, row.holding.currency))}` : "—"}
                      </span>
                    </div>
                    {/* Row 2: shares·weight + today's change */}
                    <div className="flex items-baseline justify-between gap-2 mt-0.5">
                      <span className="text-muted-foreground/60 text-[10px] tabular-nums">
                        {sharesStr}sh{totalMarketValue > 0 ? ` · ${weight.toFixed(1)}%` : ""}
                      </span>
                      {todayChange !== null && (
                        <span className={`text-[10px] tabular-nums flex-shrink-0 ${todayChange >= 0 ? "text-positive" : "text-negative"}`}>
                          {todayChange >= 0 ? "+" : ""}{cur}{fmt(Math.abs(toDisp(todayChange, row.holding.currency)))} ({fmtPct(row.price!.changePercent)})
                        </span>
                      )}
                    </div>
                    {/* Footer: P&L + dividend info */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30 text-[10px]">
                      <span className={`tabular-nums ${row.unrealizedPnL >= 0 ? "text-positive" : "text-negative"}`}>
                        {row.marketValue > 0
                          ? `P&L ${row.unrealizedPnL >= 0 ? "+" : ""}${cur}${fmt(Math.abs(toDisp(row.unrealizedPnL, row.holding.currency)))} (${fmtPct(row.unrealizedPnLPct)})`
                          : <span className="text-muted-foreground">P&L —</span>}
                      </span>
                      <div className="flex items-center gap-3 flex-shrink-0 text-right">
                        <div>
                          <div className="text-muted-foreground/50 text-[9px]">YLD</div>
                          <div className="tabular-nums text-muted-foreground">{divYield != null ? `${divYield.toFixed(1)}%` : "—"}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground/50 text-[9px]">DIV/YR</div>
                          <div className="tabular-nums text-primary">{annualDivIncome != null ? `${cur}${fmt(toDisp(annualDivIncome, row.holding.currency), 0)}` : "—"}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table (sm+) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-max">
              <thead className="sticky top-0 z-10 bg-background">
                <tr>
                  <th className="w-20 cursor-pointer select-none hover:text-accent transition-colors" onClick={() => cycleSort("ticker")}>TICKER{si("ticker")}</th>
                  <th className="text-left w-16 hidden md:table-cell">ACCT</th>
                  <th className="text-left w-32 hidden lg:table-cell cursor-pointer select-none hover:text-accent transition-colors" onClick={() => cycleSort("ticker")}>NAME{si("ticker")}</th>
                  <th
                    className="text-right w-24 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => cycleSort("price")}
                  >
                    {priceMode === "price" ? "PRICE" : "AVG"}{si("price") || " ▾"}
                    <span className="ml-1 text-muted-foreground/50 hover:text-accent text-[10px] cursor-pointer" onClick={e => { e.stopPropagation(); setPriceMode(m => m === "price" ? "avg" : "price"); }}>⟳</span>
                  </th>
                  <th
                    className="text-right w-20 hidden sm:table-cell select-none"
                  >
                    <span className="cursor-pointer hover:text-accent transition-colors" onClick={() => cycleSort("wgt")}>
                      {wgtMode === "total" ? "WGT" : wgtMode === "eligible" ? "WGT·ELG" : "ALLOC"}{si("wgt") || ""}
                    </span>
                    <button
                      className={`ml-1 btn-retro text-[8px] px-1 py-0 align-middle ${wgtMode !== "total" ? "btn-retro-primary" : ""}`}
                      onClick={() => setWgtMode(m => m === "total" ? "eligible" : m === "eligible" ? "alloc" : "total")}
                      title="ALL: excl 포함 / ELG: excl 제외 / ALLOC: 배분금액"
                    >
                      {wgtMode === "total" ? "ALL" : wgtMode === "eligible" ? "ELG" : "ALC"}
                    </button>
                  </th>
                  <th
                    className="text-right w-28 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => cycleSort("mkt")}
                  >
                    {mktMode === "mkt" ? "MKT" : "COST"}{si("mkt") || " ▾"}
                    <span className="ml-1 text-muted-foreground/50 hover:text-accent text-[10px] cursor-pointer" onClick={e => { e.stopPropagation(); setMktMode(m => m === "mkt" ? "cost" : "mkt"); }}>⟳</span>
                  </th>
                  <th
                    className="text-right w-28 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => cycleSort("pnl")}
                  >
                    {colMode === "usd" ? "P&L $" : "P&L %"}{si("pnl") || " ▾"}
                    <span className="ml-1 text-muted-foreground/50 hover:text-accent text-[10px] cursor-pointer" onClick={e => { e.stopPropagation(); cycleColMode(); }}>⟳</span>
                  </th>
                  <th
                    className="text-right w-20 hidden sm:table-cell cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => cycleSort("day")}
                    title="YOC = Yield on Cost (annual dividend ÷ your cost basis)"
                  >
                    {dayMode === "day" ? "DAY" : dayMode === "yld" ? "YLD" : "YOC"}{si("day") || " ▾"}
                    <span className="ml-1 text-muted-foreground/50 hover:text-accent text-[10px] cursor-pointer" onClick={e => { e.stopPropagation(); setDayMode(m => m === "day" ? "yld" : m === "yld" ? "yoc" : "day"); }}>⟳</span>
                  </th>
                  <th className="text-right w-24 hidden sm:table-cell cursor-pointer select-none hover:text-accent transition-colors" onClick={() => cycleSort("shares")}>SHARES{si("shares")}</th>
                  <th
                    className="text-right w-24 hidden sm:table-cell cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => cycleSort("w52")}
                  >
                    {w52Mode === "high" ? "52W H" : "52W L"}{si("w52") || " ▾"}
                    <span className="ml-1 text-muted-foreground/50 hover:text-accent text-[10px] cursor-pointer" onClick={e => { e.stopPropagation(); setW52Mode(m => m === "high" ? "low" : "high"); }}>⟳</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingPrices ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td><div className="h-3 bg-border/40 rounded-none w-12" /></td>
                      <td className="hidden md:table-cell"><div className="h-3 bg-border/40 rounded-none w-10" /></td>
                      <td className="hidden lg:table-cell"><div className="h-3 bg-border/40 rounded-none w-24" /></td>
                      <td className="text-right"><div className="h-3 bg-border/40 rounded-none w-16 ml-auto" /></td>
                      <td className="text-right hidden sm:table-cell"><div className="h-3 bg-border/40 rounded-none w-12 ml-auto" /></td>
                      <td className="text-right"><div className="h-3 bg-border/40 rounded-none w-20 ml-auto" /></td>
                      <td className="text-right"><div className="h-3 bg-border/40 rounded-none w-20 ml-auto" /></td>
                      <td className="text-right hidden sm:table-cell"><div className="h-3 bg-border/40 rounded-none w-16 ml-auto" /></td>
                      <td className="text-right hidden sm:table-cell"><div className="h-3 bg-border/40 rounded-none w-16 ml-auto" /></td>
                      <td className="text-right hidden sm:table-cell"><div className="h-3 bg-border/40 rounded-none w-20 ml-auto" /></td>
                    </tr>
                  ))
                ) : (
                  sortedRows.map((row) => {
                    const cur = dispSym ?? (row.holding.currency === "CAD" ? "C$" : "$");
                    const holdingCAD = toCADValue(row.marketValue, row.holding.currency);
                    const weight = wgtMode === "total"
                      ? (totalAllMarketValueCAD > 0 ? (holdingCAD / totalAllMarketValueCAD) * 100 : 0)
                      : wgtMode === "eligible"
                      ? (totalMarketValueCAD > 0 && !isWeightExcluded(row.holding.ticker) ? (holdingCAD / totalMarketValueCAD) * 100 : 0)
                      : 0;
                    const deskPriceReason = priceReasons[row.holding.ticker];
                    return (
                      <tr
                        key={row.holding.id}
                        className={`cursor-pointer ${selectedRowId === row.holding.id ? "bg-border/30" : ""}`}
                        onClick={() => selectRow(row.holding.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setLongPressInfo({ ticker: row.holding.ticker, currency: row.holding.currency, marketValue: row.marketValue, shares: row.shares });
                        }}
                      >
                        <td className="font-medium text-accent">
                          <span>{row.holding.ticker}</span>
                        </td>
                        <td className="text-muted-foreground text-[10px] hidden md:table-cell">
                          {accountMapping[row.holding.ticker] ?? "—"}
                        </td>
                        <td className="text-muted-foreground text-xs truncate max-w-[8rem] hidden lg:table-cell">
                          {row.holding.name || "—"}
                        </td>
                        <td className="text-right tabular-nums">
                          {priceMode === "price"
                            ? (row.price ? `${cur}${fmt(toDisp(row.price.price, row.holding.currency))}` : <span className="text-negative text-[10px]" title={deskPriceReason === "not_found" ? "Ticker not found — may be delisted or invalid" : "Price data unavailable"}>{deskPriceReason === "not_found" ? "DELISTED?" : "PRICE N/A"}</span>)
                            : (row.avgCost > 0 ? `${cur}${fmt(toDisp(row.avgCost, row.holding.currency))}` : "—")}
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                          {wgtMode === "alloc"
                            ? (() => {
                                if (!(row.holding.ticker in investTargets)) return "—";
                                const alloc = allocMap[row.holding.ticker] ?? 0;
                                return `${cur}${fmt(toDisp(alloc, row.holding.currency))}`;
                              })()
                            : (totalMarketValue > 0 ? `${weight.toFixed(1)}%` : "—")}
                        </td>
                        <td className="text-right tabular-nums">
                          {mktMode === "mkt"
                            ? (row.marketValue > 0 ? `${cur}${fmt(toDisp(row.marketValue, row.holding.currency))}` : "—")
                            : (row.costBasis > 0 ? `${cur}${fmt(toDisp(row.costBasis, row.holding.currency))}` : "—")}
                        </td>
                        <td className={`text-right tabular-nums ${row.unrealizedPnL >= 0 ? "text-positive" : "text-negative"}`}>
                          {row.marketValue > 0 ? (
                            colMode === "usd"
                              ? `${row.unrealizedPnL >= 0 ? "+" : ""}${cur}${fmt(Math.abs(toDisp(row.unrealizedPnL, row.holding.currency)))}`
                              : fmtPct(row.unrealizedPnLPct)
                          ) : "—"}
                        </td>
                        <td className={`text-right tabular-nums hidden sm:table-cell ${
                          dayMode === "day"
                            ? (row.price ? (row.price.changePercent >= 0 ? "text-positive" : "text-negative") : "")
                            : "text-primary"
                        }`}>
                          {dayMode === "day"
                            ? (row.price ? fmtPct(row.price.changePercent) : "—")
                            : dayMode === "yld"
                            ? (() => {
                                const yld = row.price?.trailingAnnualDividendYield ?? row.price?.dividendYield ?? null;
                                return yld != null ? `${yld.toFixed(2)}%` : "—";
                              })()
                            : (() => {
                                const annualDivRate = row.price?.trailingAnnualDividendRate ?? row.price?.dividendRate ?? 0;
                                const yoc = (annualDivRate > 0 && row.costBasis > 0)
                                  ? (annualDivRate * row.shares / row.costBasis) * 100
                                  : null;
                                return yoc != null ? `${yoc.toFixed(2)}%` : "—";
                              })()
                          }
                        </td>
                        <td className="text-right tabular-nums hidden sm:table-cell">
                          {Number.isInteger(row.shares) ? fmt(row.shares, 0) : fmt(row.shares, row.shares < 10 ? 4 : 2)}
                        </td>
                        <td className={`hidden sm:table-cell text-right tabular-nums ${
                          w52Mode === "high"
                            ? (row.price && row.price.fromHighPct < -10 ? "text-negative" : "text-muted-foreground")
                            : (row.price && row.price.fromLowPct > 30 ? "text-positive" : "text-muted-foreground")
                        }`}>
                          {w52Mode === "high"
                            ? (row.price?.week52High ? `${cur}${fmt(toDisp(row.price.week52High, row.holding.currency))} (${fmtPct(row.price.fromHighPct)})` : "—")
                            : (row.price?.week52Low ? `${cur}${fmt(toDisp(row.price.week52Low, row.holding.currency))} (${fmtPct(row.price.fromLowPct)})` : "—")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {rows.length > 1 && totalCurrencies.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td className="text-xs text-muted-foreground font-medium">TOTAL</td>
                    <td className="hidden md:table-cell" />
                    <td className="hidden lg:table-cell" />
                    <td />
                    <td className="hidden sm:table-cell" />
                    <td className="text-right tabular-nums font-medium text-xs">
                      {fmtTotal(mktMode)}
                    </td>
                    <td className={`text-right tabular-nums font-medium text-xs ${totalPnLPositive ? "text-positive" : "text-negative"}`}>
                      <div>{fmtTotalPnL()}</div>
                      <div className="text-[10px] opacity-70">{fmtTotalPnLPct()}</div>
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className="hidden sm:table-cell" />
                    <td className="hidden sm:table-cell" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          </>
        )}
      </div>

      {/* Long press quick-info popup */}
      {longPressInfo && (() => {
        const lp = longPressInfo;
        const cur = dispSym ?? (lp.currency === "CAD" ? "C$" : "$");
        const lpValueCAD = lp.currency === "USD" ? lp.marketValue * fxRate : lp.marketValue;
        const weight = wgtMode === "total"
          ? (totalAllMarketValueCAD > 0 ? (lpValueCAD / totalAllMarketValueCAD) * 100 : 0)
          : (totalMarketValueCAD > 0 && !isWeightExcluded(lp.ticker) ? (lpValueCAD / totalMarketValueCAD) * 100 : 0);
        const rawTarget = isWeightExcluded(lp.ticker) ? undefined : investTargets[lp.ticker];
        const target = rawTarget != null ? normalizeTargetPct(lp.ticker) : undefined;
        const alloc = allocMap[lp.ticker];
        const gap = target != null ? target - weight : null;
        const freqLabel: Record<string, string> = { weekly: "WEEKLY", biweekly: "BI-WEEKLY", monthly: "MONTHLY" };
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setLongPressInfo(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="relative bg-background border border-border w-full max-w-sm mx-4 mb-8 p-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-accent font-medium tracking-wide">{lp.ticker}</span>
                <span className="text-[10px] text-muted-foreground">INVESTMENT PLAN</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <div className="text-[10px] text-muted-foreground">CURRENT WEIGHT</div>
                  <div className="tabular-nums">{weight.toFixed(1)}%</div>
                </div>
                {target != null && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">TARGET WEIGHT</div>
                    <div className={`tabular-nums ${gap != null && gap > 0 ? "text-positive" : gap != null && gap < 0 ? "text-negative" : ""}`}>
                      {target.toFixed(1)}%
                      {gap != null && <span className="text-muted-foreground ml-1">({gap > 0 ? "+" : ""}{gap.toFixed(1)}%)</span>}
                    </div>
                  </div>
                )}
                {investContrib && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">CONTRIBUTION</div>
                    <div className="tabular-nums">
                      {investContrib.currency === "CAD" ? "C$" : "$"}{fmt(investContrib.amount)}
                      {investContrib.frequency && <span className="text-muted-foreground ml-1 text-[10px]">/ {freqLabel[investContrib.frequency] ?? investContrib.frequency}</span>}
                    </div>
                  </div>
                )}
                {alloc != null && alloc > 0 ? (
                  <div>
                    <div className="text-[10px] text-muted-foreground">NEXT BUY</div>
                    <div className="tabular-nums text-primary">{cur}{fmt(alloc)}</div>
                  </div>
                ) : target != null && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">NEXT BUY</div>
                    <div className="tabular-nums text-muted-foreground">AT TARGET</div>
                  </div>
                )}
              </div>
              <button className="btn-retro w-full mt-4 text-xs py-2" onClick={() => setLongPressInfo(null)}>CLOSE</button>
            </div>
          </div>
        );
      })()}

      {/* Detail panel — inline on desktop */}
      {selectedRow && (
        <HoldingDetailPanel
          row={selectedRow}
          readOnly={readOnly}
          onClose={() => selectRow(null)}
          onRefresh={refresh}
          totalMarketValue={totalMarketValue}
          eligibleTotalCAD={totalMarketValueCAD}
          displayCurrency={displayCurrency}
          allocAmount={allocMap[selectedRow.holding.ticker] ?? 0}
          gapAmount={gapAmountMap[selectedRow.holding.ticker] ?? 0}
          postAllocationPct={postPctMap[selectedRow.holding.ticker]}
          contribCAD={contribCAD}
          fxRateForAlloc={fxRate}
          allPortfolios={allPortfolios}
          selectedPortfolioId={selectedPortfolioId}
          onPortfolioChange={onPortfolioChange}
        />
      )}
    </div>
  );
}
