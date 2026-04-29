"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AddHoldingDialog } from "./add-holding-dialog";
import { HoldingDetailPanel } from "./holding-detail-panel";
import { StrategyStatusPanel } from "./strategy-status-panel";
import { mergeHoldings } from "@/lib/utils";
import { buildAllocationPlan } from "@/lib/investment-allocation";
import { getOverrideTargets, type NdxTier } from "@/lib/investment-triggers";
import { HoldingsTableHeader } from "./holdings-table/holdings-table-header";
import { HoldingsTableRow } from "./holdings-table/holdings-table-row";
import { HoldingsTableSummary } from "./holdings-table/holdings-table-summary";
import { useHoldingsStore } from "./holdings-table/use-holdings-store";
import type { HoldingRow, Holding, PriceData } from "./holdings-table/types";

function calcHolding(
  holding: Holding
): Omit<
  HoldingRow,
  "price" | "marketValue" | "unrealizedPnL" | "unrealizedPnLPct"
> {
  const txns = holding.transactions ?? [];
  const buys = txns.filter((t) => t.action === "BUY");
  const sells = txns.filter((t) => t.action === "SELL");
  const totalBought = buys.reduce((s, t) => s + parseFloat(t.quantity), 0);
  const totalSold = sells.reduce((s, t) => s + parseFloat(t.quantity), 0);
  const totalCost = buys.reduce(
    (s, t) => s + parseFloat(t.quantity) * parseFloat(t.price) + parseFloat(t.commission),
    0
  );
  const shares =
    holding.quantity != null
      ? parseFloat(holding.quantity)
      : totalBought - totalSold;
  const avgCost =
    holding.avgCost != null
      ? parseFloat(holding.avgCost)
      : totalBought > 0
        ? totalCost / totalBought
        : 0;
  const costBasis = avgCost * shares;
  return { holding, shares, avgCost, costBasis };
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
  onHoldingsChange: (
    rows: Array<{
      ticker: string;
      name?: string | null;
      marketValue: number;
      costBasis: number;
      unrealizedPnL: number;
      unrealizedPnLPct: number;
      dayChange: number;
      annualDividend?: number;
      currency: "USD" | "CAD";
    }>
  ) => void;
  onDetailOpen?: (open: boolean) => void;
  readOnly?: boolean;
  displayCurrency?: "USD" | "CAD";
  allPortfolios?: { id: string; name: string }[];
  selectedPortfolioId?: string;
  onPortfolioChange?: (id: string) => void;
}) {
  const [holdings, setHoldings] = useState(initialHoldings);
  const [prices, setPrices] = useState<Record<string, PriceData | null>>({});
  const [priceReasons, setPriceReasons] = useState<
    Record<string, "not_found" | "network">
  >({});
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [dividendCuts, setDividendCuts] = useState<Set<string>>(new Set());
  const [dividendCutPcts, setDividendCutPcts] = useState<Record<string, number>>({});
  const [dividendHistory, setDividendHistory] = useState<Set<string>>(new Set());
  const [investTargets, setInvestTargets] = useState<Record<string, number>>({});
  const [excludedTickers, setExcludedTickers] = useState<Set<string>>(new Set());
  const [investContrib, setInvestContrib] = useState<{
    amount: number;
    currency: "USD" | "CAD";
    frequency?: string;
  } | null>(null);
  const [fxRate, setFxRate] = useState(1.35);
  const [accountMapping, setAccountMapping] = useState<Record<string, string>>({});
  const [upperTriggerPct, setUpperTriggerPct] = useState(33);
  const [ndxTier, setNdxTier] = useState<NdxTier>(0);
  const [longPressInfo, setLongPressInfo] = useState<{
    ticker: string;
    currency: "USD" | "CAD";
    marketValue: number;
    shares: number;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  // Zustand store selectors
  const selectedRowId = useHoldingsStore((s) => s.selectedRowId);
  const sortCol = useHoldingsStore((s) => s.sortCol);
  const sortDir = useHoldingsStore((s) => s.sortDir);
  const priceMode = useHoldingsStore((s) => s.priceMode);
  const mktMode = useHoldingsStore((s) => s.mktMode);
  const colMode = useHoldingsStore((s) => s.colMode);
  const w52Mode = useHoldingsStore((s) => s.w52Mode);
  const dayMode = useHoldingsStore((s) => s.dayMode);
  const setSelectedRowId = useHoldingsStore((s) => s.setSelectedRowId);

  const toDisp = useCallback(
    (value: number, holdingCurrency: "USD" | "CAD") => {
      if (!displayCurrency || displayCurrency === holdingCurrency) return value;
      return displayCurrency === "CAD" ? value * fxRate : value / fxRate;
    },
    [displayCurrency, fxRate]
  );
  const dispSym = displayCurrency === "CAD" ? "C$" : displayCurrency === "USD" ? "$" : null;

  useEffect(() => {
    fetch("/api/settings/investment")
      .then((r) => r.json())
      .then((d) => {
        const targets: Record<string, number> = {};
        const excluded = new Set<string>();
        for (const [ticker, val] of Object.entries(d.targets ?? {})) {
          const v = val as { pct: number; excluded?: boolean };
          if (v.excluded) {
            excluded.add(ticker);
            continue;
          }
          targets[ticker] = v.pct;
        }
        setInvestTargets(targets);
        setExcludedTickers(excluded);
        if (d.contribution)
          setInvestContrib({
            amount: d.contribution.amount,
            currency: d.contribution.currency,
            frequency: d.contribution.frequency,
          });
        if (d.accountMapping) setAccountMapping(d.accountMapping);
        if (d.triggerParams?.upperTriggerPct)
          setUpperTriggerPct(d.triggerParams.upperTriggerPct);
      })
      .catch(() => {});
    fetch("/api/fx")
      .then((r) => r.json())
      .then((d) => {
        if (d.rate) setFxRate(d.rate);
      })
      .catch(() => {});
    fetch("/api/market/ndx")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.tier === "number") setNdxTier(d.tier as NdxTier);
      })
      .catch(() => {});
    fetch("/api/dividend-growth")
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, number> = {};
        const cutPcts: Record<string, number> = {};
        const history = new Set<string>();
        const cutsSet = new Set<string>(d.cuts ?? []);
        for (const t of d.tickers ?? []) {
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
      })
      .catch(() => {});
  }, []);

  const startRowLongPress = useCallback(
    (info: {
      ticker: string;
      currency: "USD" | "CAD";
      marketValue: number;
      shares: number;
    }) => {
      longPressTriggeredRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        setLongPressInfo(info);
      }, 500);
    },
    []
  );

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
    const all = (await res.json()) as { id: string; holdings: Holding[] }[];
    let updated: Holding[];
    if (portfolioId === "all") {
      updated = mergeHoldings(all);
    } else {
      const portfolio = all.find((p) => p.id === portfolioId);
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

  const rows: HoldingRow[] = useMemo(
    () =>
      holdings
        .map((h) => {
          const base = calcHolding(h);
          const price = prices[h.ticker] ?? null;
          const marketValue = price ? base.shares * price.price : 0;
          const unrealizedPnL = marketValue - base.costBasis;
          const unrealizedPnLPct =
            base.costBasis > 0 ? (unrealizedPnL / base.costBasis) * 100 : 0;
          return {
            ...base,
            price,
            marketValue,
            unrealizedPnL,
            unrealizedPnLPct,
          };
        })
        .filter(
          (r) =>
            r.shares > 0 ||
            (r.holding.quantity === null &&
              (r.holding.transactions ?? []).length === 0)
        ),
    [holdings, prices]
  );

  const totalMarketValue = rows.reduce((s, r) => s + r.marketValue, 0);

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      let va = 0,
        vb = 0;
      if (sortCol === "ticker") {
        const cmp = a.holding.ticker.localeCompare(b.holding.ticker);
        return sortDir === "asc" ? cmp : -cmp;
      }
      switch (sortCol) {
        case "shares":
          va = a.shares;
          vb = b.shares;
          break;
        case "price":
          va =
            priceMode === "price"
              ? a.price?.price ?? 0
              : a.avgCost;
          vb =
            priceMode === "price"
              ? b.price?.price ?? 0
              : b.avgCost;
          break;
        case "day": {
          const getDayVal = (r: HoldingRow) => {
            if (dayMode === "day") return r.price?.changePercent ?? 0;
            if (dayMode === "yld")
              return (
                r.price?.trailingAnnualDividendYield ??
                r.price?.dividendYield ??
                0
              );
            const rate =
              r.price?.trailingAnnualDividendRate ??
              r.price?.dividendRate ??
              0;
            return rate > 0 && r.costBasis > 0
              ? ((rate * r.shares) / r.costBasis) * 100
              : 0;
          };
          va = getDayVal(a);
          vb = getDayVal(b);
          break;
        }
        case "mkt":
          va = mktMode === "mkt" ? a.marketValue : a.costBasis;
          vb = mktMode === "mkt" ? b.marketValue : b.costBasis;
          break;
        case "wgt":
          va = a.marketValue;
          vb = b.marketValue;
          break;
        case "pnl":
          va = colMode === "usd" ? a.unrealizedPnL : a.unrealizedPnLPct;
          vb = colMode === "usd" ? b.unrealizedPnL : b.unrealizedPnLPct;
          break;
        case "w52":
          va =
            w52Mode === "high"
              ? a.price?.fromHighPct ?? 0
              : a.price?.fromLowPct ?? 0;
          vb =
            w52Mode === "high"
              ? b.price?.fromHighPct ?? 0
              : b.price?.fromLowPct ?? 0;
          break;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [rows, sortCol, sortDir, priceMode, mktMode, colMode, w52Mode, dayMode]);

  const totalsByCur = rows.reduce(
    (acc, r) => {
      const c = r.holding.currency;
      acc[c] = acc[c] ?? { mkt: 0, cost: 0, pnl: 0 };
      acc[c].mkt += r.marketValue;
      acc[c].cost += r.costBasis;
      acc[c].pnl += r.unrealizedPnL;
      return acc;
    },
    {} as Record<string, { mkt: number; cost: number; pnl: number }>
  );

  const totalCurrencies = Object.keys(totalsByCur) as ("USD" | "CAD")[];

  const toCADValue = useCallback(
    (amount: number, currency: "USD" | "CAD") =>
      currency === "USD" ? amount * fxRate : amount,
    [fxRate]
  );

  const isWeightExcluded = useCallback(
    (ticker: string) => excludedTickers.has(ticker),
    [excludedTickers]
  );

  const totalMarketValueCAD = rows.reduce(
    (sum, r) =>
      isWeightExcluded(r.holding.ticker)
        ? sum
        : sum + toCADValue(r.marketValue, r.holding.currency),
    0
  );

  const totalAllMarketValueCAD = rows.reduce(
    (sum, r) => sum + toCADValue(r.marketValue, r.holding.currency),
    0
  );

  const totalEligibleTargetPct = Object.entries(investTargets)
    .filter(([ticker]) => !excludedTickers.has(ticker))
    .reduce((sum, [, pct]) => sum + pct, 0);

  const normalizeTargetPct = useCallback(
    (ticker: string): number => {
      const raw = investTargets[ticker] ?? 0;
      if (
        excludedTickers.has(ticker) ||
        totalEligibleTargetPct <= 0 ||
        Math.abs(totalEligibleTargetPct - 100) < 0.01
      )
        return raw;
      return (raw / totalEligibleTargetPct) * 100;
    },
    [investTargets, excludedTickers, totalEligibleTargetPct]
  );

  const contribCAD = investContrib
    ? investContrib.currency === "CAD"
      ? investContrib.amount
      : investContrib.amount * fxRate
    : 0;

  const allExcludedForAlloc = [
    ...excludedTickers,
    ...Object.entries(investTargets)
      .filter(([, pct]) => pct === 0)
      .map(([t]) => t),
  ];

  const effectiveTargets = getOverrideTargets(ndxTier, investTargets);
  const allocPlan = buildAllocationPlan({
    holdings: rows.map((r) => ({
      ticker: r.holding.ticker,
      currency: r.holding.currency,
      marketValue: r.marketValue,
    })),
    investTargets: effectiveTargets,
    contributionCAD: contribCAD,
    fxRate,
    excludeCashEquivalents: false,
    excludedTickers: allExcludedForAlloc,
  });

  const qldRow = rows.find((r) => r.holding.ticker === "QLD");
  const sgovRow = rows.find((r) => r.holding.ticker === "SGOV");
  const qldValueCAD = qldRow
    ? toCADValue(qldRow.marketValue, qldRow.holding.currency)
    : 0;
  const sgovValueCAD = sgovRow
    ? toCADValue(sgovRow.marketValue, sgovRow.holding.currency)
    : 0;
  const qldPct =
    totalAllMarketValueCAD > 0
      ? (qldValueCAD / totalAllMarketValueCAD) * 100
      : 0;
  const sgovPct =
    totalAllMarketValueCAD > 0
      ? (sgovValueCAD / totalAllMarketValueCAD) * 100
      : 0;

  const allocMap: Record<string, number> = {};
  const gapAmountMap: Record<string, number> = {};
  const postPctMap: Record<string, number> = {};
  for (const r of rows) {
    allocMap[r.holding.ticker] =
      (allocPlan.allocCADByTicker[r.holding.ticker] ?? 0) /
      (r.holding.currency === "USD" ? fxRate : 1);
    gapAmountMap[r.holding.ticker] =
      (allocPlan.gapCADByTicker[r.holding.ticker] ?? 0) /
      (r.holding.currency === "USD" ? fxRate : 1);
    postPctMap[r.holding.ticker] =
      allocPlan.postPctByTicker[r.holding.ticker] ?? 0;
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
          ? ((r.price.trailingAnnualDividendRate ?? r.price.dividendRate ?? 0) *
              r.shares)
          : 0,
        name: r.holding.name,
        currency: r.holding.currency,
      }))
    );
  }, [prices, holdings, loadingPrices, onHoldingsChange, rows]);

  useEffect(() => {
    onDetailOpen?.(selectedRowId !== null);
  }, [selectedRowId, onDetailOpen]);

  const selectedRow =
    sortedRows.find((r) => r.holding.id === selectedRowId) ?? null;

  return (
    <div>
      <div>
        {!readOnly &&
          investTargets &&
          Object.keys(investTargets).length > 0 &&
          rows.length > 0 && (
            <StrategyStatusPanel
              qldPct={qldPct}
              sgovPct={sgovPct}
              upperTriggerPct={upperTriggerPct}
              qldTargetPct={investTargets["QLD"] ?? 30}
            />
          )}

        <HoldingsTableHeader
          rowsLength={rows.length}
          readOnly={readOnly}
          portfolioId={portfolioId}
          onRefresh={refresh}
          showTableHead={false}
        />

        {rows.length === 0 ? (
          <div className="text-muted-foreground text-xs py-8 text-center border border-dashed border-border">
            NO POSITIONS — ADD A STOCK TO BEGIN
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {loadingPrices
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="border border-border p-3 bg-card animate-pulse"
                    >
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
                : sortedRows.map((row) => (
                    <HoldingsTableRow
                      key={row.holding.id}
                      row={row}
                      variant="mobile"
                      totalMarketValue={totalMarketValue}
                      totalMarketValueCAD={totalMarketValueCAD}
                      totalAllMarketValueCAD={totalAllMarketValueCAD}
                      priceReasons={priceReasons}
                      isWeightExcluded={isWeightExcluded}
                      investTargets={investTargets}
                      allocMap={allocMap}
                      accountMapping={accountMapping}
                      displayCurrency={displayCurrency}
                      fxRate={fxRate}
                      onMobilePointerDown={() =>
                        startRowLongPress({
                          ticker: row.holding.ticker,
                          currency: row.holding.currency,
                          marketValue: row.marketValue,
                          shares: row.shares,
                        })
                      }
                      onMobilePointerUp={cancelRowLongPress}
                      onMobilePointerLeave={cancelRowLongPress}
                    />
                  ))}
            </div>

            {/* Desktop table (sm+) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-max">
                <HoldingsTableHeader
                  rowsLength={rows.length}
                  readOnly={readOnly}
                  portfolioId={portfolioId}
                  onRefresh={refresh}
                  showTableHead={false}
                />
                <tbody>
                  {loadingPrices
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td>
                            <div className="h-3 bg-border/40 rounded-none w-12" />
                          </td>
                          <td className="hidden md:table-cell">
                            <div className="h-3 bg-border/40 rounded-none w-10" />
                          </td>
                          <td className="hidden lg:table-cell">
                            <div className="h-3 bg-border/40 rounded-none w-24" />
                          </td>
                          <td className="text-right">
                            <div className="h-3 bg-border/40 rounded-none w-16 ml-auto" />
                          </td>
                          <td className="text-right hidden sm:table-cell">
                            <div className="h-3 bg-border/40 rounded-none w-12 ml-auto" />
                          </td>
                          <td className="text-right">
                            <div className="h-3 bg-border/40 rounded-none w-20 ml-auto" />
                          </td>
                          <td className="text-right">
                            <div className="h-3 bg-border/40 rounded-none w-20 ml-auto" />
                          </td>
                          <td className="text-right hidden sm:table-cell">
                            <div className="h-3 bg-border/40 rounded-none w-16 ml-auto" />
                          </td>
                          <td className="text-right hidden sm:table-cell">
                            <div className="h-3 bg-border/40 rounded-none w-16 ml-auto" />
                          </td>
                          <td className="text-right hidden sm:table-cell">
                            <div className="h-3 bg-border/40 rounded-none w-20 ml-auto" />
                          </td>
                        </tr>
                      ))
                    : sortedRows.map((row) => (
                        <HoldingsTableRow
                          key={row.holding.id}
                          row={row}
                          variant="desktop"
                          totalMarketValue={totalMarketValue}
                          totalMarketValueCAD={totalMarketValueCAD}
                          totalAllMarketValueCAD={totalAllMarketValueCAD}
                          priceReasons={priceReasons}
                          isWeightExcluded={isWeightExcluded}
                          investTargets={investTargets}
                          allocMap={allocMap}
                          accountMapping={accountMapping}
                          displayCurrency={displayCurrency}
                          fxRate={fxRate}
                          onLongPressContext={(info) => setLongPressInfo(info)}
                        />
                      ))}
                </tbody>
                {rows.length > 1 && totalCurrencies.length > 0 && (
                  <HoldingsTableSummary
                    totalsByCur={totalsByCur}
                    displayCurrency={displayCurrency}
                    fxRate={fxRate}
                  />
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
        const lpValueCAD =
          lp.currency === "USD" ? lp.marketValue * fxRate : lp.marketValue;
        const weight =
          useHoldingsStore.getState().wgtMode === "total"
            ? totalAllMarketValueCAD > 0
              ? (lpValueCAD / totalAllMarketValueCAD) * 100
              : 0
            : totalMarketValueCAD > 0 && !isWeightExcluded(lp.ticker)
              ? (lpValueCAD / totalMarketValueCAD) * 100
              : 0;
        const rawTarget = isWeightExcluded(lp.ticker)
          ? undefined
          : investTargets[lp.ticker];
        const target =
          rawTarget != null ? normalizeTargetPct(lp.ticker) : undefined;
        const alloc = allocMap[lp.ticker];
        const gap = target != null ? target - weight : null;
        const freqLabel: Record<string, string> = {
          weekly: "WEEKLY",
          biweekly: "BI-WEEKLY",
          monthly: "MONTHLY",
        };

        function fmtLocal(n: number, d = 2) {
          return n.toLocaleString("en-CA", {
            minimumFractionDigits: d,
            maximumFractionDigits: d,
          });
        }

        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={() => setLongPressInfo(null)}
          >
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="relative bg-background border border-border w-full max-w-sm mx-4 mb-8 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-accent font-medium tracking-wide">
                  {lp.ticker}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  INVESTMENT PLAN
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <div className="text-[10px] text-muted-foreground">
                    CURRENT WEIGHT
                  </div>
                  <div className="tabular-nums">{weight.toFixed(1)}%</div>
                </div>
                {target != null && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">
                      TARGET WEIGHT
                    </div>
                    <div
                      className={`tabular-nums ${
                        gap != null && gap > 0
                          ? "text-positive"
                          : gap != null && gap < 0
                            ? "text-negative"
                            : ""
                      }`}
                    >
                      {target.toFixed(1)}%
                      {gap != null && (
                        <span className="text-muted-foreground ml-1">
                          ({gap > 0 ? "+" : ""}
                          {gap.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {investContrib && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">
                      CONTRIBUTION
                    </div>
                    <div className="tabular-nums">
                      {investContrib.currency === "CAD" ? "C$" : "$"}
                      {fmtLocal(investContrib.amount)}
                      {investContrib.frequency && (
                        <span className="text-muted-foreground ml-1 text-[10px]">
                          / {freqLabel[investContrib.frequency] ?? investContrib.frequency}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {alloc != null && alloc > 0 ? (
                  <div>
                    <div className="text-[10px] text-muted-foreground">
                      NEXT BUY
                    </div>
                    <div className="tabular-nums text-primary">
                      {cur}
                      {fmtLocal(alloc)}
                    </div>
                  </div>
                ) : (
                  target != null && (
                    <div>
                      <div className="text-[10px] text-muted-foreground">
                        NEXT BUY
                      </div>
                      <div className="tabular-nums text-muted-foreground">
                        AT TARGET
                      </div>
                    </div>
                  )
                )}
              </div>
              <button
                className="btn-retro w-full mt-4 text-xs py-2"
                onClick={() => setLongPressInfo(null)}
              >
                CLOSE
              </button>
            </div>
          </div>
        );
      })()}

      {/* Detail panel — inline on desktop */}
      {selectedRow && (
        <HoldingDetailPanel
          row={selectedRow}
          readOnly={readOnly}
          onClose={() => setSelectedRowId(null)}
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
          recommendedAccount={accountMapping[selectedRow.holding.ticker]}
        />
      )}
    </div>
  );
}
