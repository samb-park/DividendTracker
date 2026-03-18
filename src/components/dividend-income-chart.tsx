"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { fmt } from "@/lib/utils";

interface DividendItem {
  ticker: string;
  amount: number;
  net: number;
  currency: string;
  accountType: string;
}

interface MonthData {
  month: string; // "YYYY-MM"
  items: DividendItem[];
  source: "actual" | "projected" | "empty";
}

interface DividendIncomeData {
  months: { month: string; items: DividendItem[] }[];
}

const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const RETRO_TOOLTIP_STYLE = {
  backgroundColor: "#161616",
  border: "1px solid #333",
  borderRadius: "0",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: "11px",
  color: "#e8e6d9",
};

const COLOR_ACTUAL = "hsl(142, 69%, 58%)";
const COLOR_PROJECTED = "hsl(142, 50%, 38%)";
const COLOR_SELECTED = "hsl(38, 92%, 55%)";

function toDisplayAmt(amount: number, currency: string, displayCurrency: "CAD" | "USD", fxRate: number) {
  if (displayCurrency === "CAD") return currency === "USD" ? amount * fxRate : amount;
  return currency === "CAD" ? amount / fxRate : amount;
}

const _NOW = new Date();
const CURRENT_YEAR = _NOW.getFullYear();
const CURRENT_MONTH = _NOW.toISOString().slice(0, 7); // "YYYY-MM"

function YearDropdown({ value, options, onChange }: { value: number; options: number[]; onChange: (y: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button className="btn-retro btn-retro-primary text-xs flex items-center gap-1.5 min-w-[5rem]" onClick={() => setOpen(v => !v)}>
        <span className="flex-1 text-left tabular-nums">{value}</span>
        <span className="text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-0.5 z-50 bg-card border border-border min-w-full max-h-48 overflow-y-auto">
          {options.map(y => (
            <button key={y} className={`w-full text-left px-3 py-1.5 text-xs tabular-nums hover:bg-border/30 ${value === y ? "text-accent" : ""}`}
              onClick={() => { onChange(y); setOpen(false); }}>{y}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DividendIncomeChart({
  selectedPortfolioId,
  fxRate,
  displayCurrency,
  onCurrentYearSummary,
}: {
  selectedPortfolioId: string;
  fxRate: number;
  displayCurrency: "CAD" | "USD";
  onCurrentYearSummary?: (annualTotal: number, monthlyAvg: number) => void;
}) {
  const [showNet, setShowNet] = useState(false);
  const [netDropdownOpen, setNetDropdownOpen] = useState(false);
  const netDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (netDropdownRef.current && !netDropdownRef.current.contains(e.target as Node)) {
        setNetDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [year, setYear] = useState(CURRENT_YEAR);
  const [pastData, setPastData] = useState<DividendIncomeData | null>(null);
  const [futureData, setFutureData] = useState<DividendIncomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedMonth(null);
    setPastData(null);
    setFutureData(null);

    const base = `/api/dividend-income?year=${year}&portfolioId=${selectedPortfolioId}`;
    const needsPast = year <= CURRENT_YEAR;
    const needsFuture = year >= CURRENT_YEAR;

    Promise.all([
      needsPast ? fetch(`${base}&mode=past`).then((r) => r.json()) : Promise.resolve(null),
      needsFuture ? fetch(`${base}&mode=future`).then((r) => r.json()) : Promise.resolve(null),
    ])
      .then(([past, future]) => {
        setPastData(past);
        setFutureData(future);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year, selectedPortfolioId, CURRENT_YEAR]);

  // Swipe left/right to navigate years
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      touchStartRef.current = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      setYear((y) => (dx < 0 ? y + 1 : y - 1));
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Merge months: current year prefers actual data for past+current months, projected for future
  const mergedMonths = useMemo((): MonthData[] => {
    const months: MonthData[] = [];
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${year}-${String(m).padStart(2, "0")}`;
      let items: DividendItem[] = [];
      let source: "actual" | "projected" | "empty" = "empty";

      if (year < CURRENT_YEAR) {
        // Past year — all actual
        items = pastData?.months.find((mo) => mo.month === monthKey)?.items ?? [];
        source = items.length > 0 ? "actual" : "empty";
      } else if (year > CURRENT_YEAR) {
        // Future year — all projected
        items = futureData?.months.find((mo) => mo.month === monthKey)?.items ?? [];
        source = items.length > 0 ? "projected" : "empty";
      } else {
        // Current year
        if (monthKey < CURRENT_MONTH) {
          // Past months — use actual only
          items = pastData?.months.find((mo) => mo.month === monthKey)?.items ?? [];
          source = items.length > 0 ? "actual" : "empty";
        } else if (monthKey === CURRENT_MONTH) {
          // Current month — prefer actual if recorded, else projected
          const actualItems = pastData?.months.find((mo) => mo.month === monthKey)?.items ?? [];
          if (actualItems.length > 0) {
            items = actualItems;
            source = "actual";
          } else {
            items = futureData?.months.find((mo) => mo.month === monthKey)?.items ?? [];
            source = items.length > 0 ? "projected" : "empty";
          }
        } else {
          // Future months this year — projected
          items = futureData?.months.find((mo) => mo.month === monthKey)?.items ?? [];
          source = items.length > 0 ? "projected" : "empty";
        }
      }

      months.push({ month: monthKey, items, source });
    }
    return months;
  }, [pastData, futureData, year, CURRENT_YEAR, CURRENT_MONTH]);

  const currencySymbol = displayCurrency === "CAD" ? "C$" : "$";

  const chartData = useMemo(() => {
    return mergedMonths.map((m) => {
      const monthValue = m.items.reduce((sum, item) => {
        const amt = showNet ? item.net : item.amount;
        return sum + toDisplayAmt(amt, item.currency, displayCurrency, fxRate);
      }, 0);
      const idx = parseInt(m.month.slice(5, 7)) - 1;
      return {
        month: MONTH_LABELS[idx],
        monthStr: m.month,
        value: monthValue,
        isActual: m.source === "actual",
        isCurrentMonth: m.month === CURRENT_MONTH && year === CURRENT_YEAR,
      };
    });
  }, [mergedMonths, showNet, displayCurrency, fxRate]);

  const { annualTotal, monthlyAvg } = useMemo(() => {
    const activeMonths = chartData.filter((d) => d.value > 0);
    const total = activeMonths.reduce((s, d) => s + d.value, 0);
    const avg = activeMonths.length > 0 ? total / activeMonths.length : 0;
    return { annualTotal: total, monthlyAvg: avg };
  }, [chartData]);

  // Report current-year stats to parent (for summary bar)
  useEffect(() => {
    if (year === CURRENT_YEAR && onCurrentYearSummary && !loading) {
      onCurrentYearSummary(annualTotal, monthlyAvg);
    }
  }, [year, CURRENT_YEAR, annualTotal, monthlyAvg, loading, onCurrentYearSummary]);

  const selectedData = selectedMonth
    ? mergedMonths.find((m) => m.month === selectedMonth) ?? null
    : null;

  return (
    <div ref={containerRef} className="border border-border bg-card p-4 mb-6">
      {/* Header: title */}
      <div className="text-accent text-xs tracking-wide mb-2">&#9654; DIVIDEND INCOME</div>

      {/* Header: year nav + GROSS/NET toggle */}
      <div className="flex items-center justify-between mb-3">
        <YearDropdown
          value={year}
          options={Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + 2 - i)}
          onChange={setYear}
        />
        <div className="relative" ref={netDropdownRef}>
          <button
            className="btn-retro btn-retro-primary text-[10px] px-2 py-1.5 flex items-center gap-1.5"
            onClick={() => setNetDropdownOpen((v) => !v)}
          >
            <span className="flex-1 text-left">{showNet ? "NET" : "GROSS"}</span>
            <span className="text-muted-foreground">▾</span>
          </button>
          {netDropdownOpen && (
            <div className="absolute top-full right-0 mt-0.5 z-50 bg-card border border-border min-w-full">
              {([["GROSS", false], ["NET", true]] as const).map(([label, val]) => (
                <button
                  key={label}
                  className={`w-full text-left px-3 py-2 text-[10px] hover:bg-border/30 ${showNet === val ? "text-accent" : ""}`}
                  onClick={() => { setShowNet(val); setNetDropdownOpen(false); }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bar Chart */}
      {loading ? (
        <div className="text-muted-foreground text-xs text-center py-8">LOADING...</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
              onClick={(payload) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const monthStr = (payload?.activePayload as any)?.[0]?.payload?.monthStr as string | undefined;
                if (monthStr) setSelectedMonth((prev) => (prev === monthStr ? null : monthStr));
              }}
            >
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
              />
              <Tooltip
                contentStyle={RETRO_TOOLTIP_STYLE}
                formatter={(v: number) => [`${currencySymbol}${fmt(v)}`, showNet ? "NET" : "GROSS"]}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Bar dataKey="value" isAnimationActive={false}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.monthStr === selectedMonth
                        ? COLOR_SELECTED
                        : entry.isActual
                        ? COLOR_ACTUAL
                        : COLOR_PROJECTED
                    }
                    opacity={!entry.isActual && entry.monthStr !== selectedMonth ? 0.65 : 1}
                    cursor="pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend: actual vs projected */}
          <div className="flex gap-4 mt-2 ml-1">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span style={{ display: "inline-block", width: 10, height: 10, backgroundColor: COLOR_ACTUAL }} />
              ACTUAL
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span style={{ display: "inline-block", width: 10, height: 10, backgroundColor: COLOR_PROJECTED, opacity: 0.65 }} />
              PROJECTED
            </div>
          </div>

          {/* Annual summary */}
          {annualTotal > 0 && (
            <div className="flex gap-4 mt-3 pt-3 border-t border-border">
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground tracking-wide mb-0.5">
                  {year} TOTAL
                </div>
                <div className="text-sm font-medium tabular-nums text-primary">
                  {currencySymbol}{fmt(annualTotal)}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground tracking-wide mb-0.5">AVG / MONTH</div>
                <div className="text-sm font-medium tabular-nums text-primary">
                  {currencySymbol}{fmt(monthlyAvg)}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Selected month breakdown */}
      {selectedMonth && selectedData && selectedData.items.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-accent text-[10px] tracking-wide">
              {MONTH_LABELS[parseInt(selectedMonth.slice(5, 7)) - 1]} {selectedMonth.slice(0, 4)}
            </div>
            {selectedData.source === "projected" && (
              <span className="text-[10px] text-muted-foreground border border-border/50 px-1">PROJECTED</span>
            )}
          </div>
          <div className="space-y-1.5">
            {selectedData.items
              .slice()
              .sort((a, b) => {
                const aAmt = toDisplayAmt(showNet ? a.net : a.amount, a.currency, displayCurrency, fxRate);
                const bAmt = toDisplayAmt(showNet ? b.net : b.amount, b.currency, displayCurrency, fxRate);
                return bAmt - aAmt;
              })
              .map((item, i) => {
                const grossDisp = toDisplayAmt(item.amount, item.currency, displayCurrency, fxRate);
                const netDisp = toDisplayAmt(item.net, item.currency, displayCurrency, fxRate);
                const displayAmt = showNet ? netDisp : grossDisp;
                return (
                  <div key={i} className="flex items-center justify-between text-xs gap-2 py-0.5">
                    <span className="font-medium min-w-[48px]">{item.ticker}</span>
                    <span className="text-muted-foreground text-[10px] flex-1">{item.accountType}</span>
                    <span className="tabular-nums text-primary">
                      {currencySymbol}{fmt(displayAmt)}
                      {showNet && item.net < item.amount && (
                        <span className="text-muted-foreground ml-1 text-[10px]">
                          (gross {currencySymbol}{fmt(grossDisp)})
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            {/* Month subtotal */}
            {selectedData.items.length > 1 && (
              <div className="flex items-center justify-between text-xs gap-2 pt-1.5 border-t border-border">
                <span className="text-muted-foreground">SUBTOTAL</span>
                <span className="tabular-nums text-primary font-medium">
                  {currencySymbol}{fmt(
                    selectedData.items.reduce((sum, item) => {
                      const amt = showNet ? item.net : item.amount;
                      return sum + toDisplayAmt(amt, item.currency, displayCurrency, fxRate);
                    }, 0)
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && chartData.every((d) => d.value === 0) && (
        <div className="text-muted-foreground text-xs text-center py-4">
          NO DIVIDEND DATA FOR {year}
        </div>
      )}
    </div>
  );
}
