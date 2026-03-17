"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
}

interface DividendIncomeData {
  months: MonthData[];
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

function fmt(n: number) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDisplayAmt(amount: number, currency: string, displayCurrency: "CAD" | "USD", fxRate: number) {
  if (displayCurrency === "CAD") return currency === "USD" ? amount * fxRate : amount;
  return currency === "CAD" ? amount / fxRate : amount;
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
  const NOW = new Date();
  const CURRENT_YEAR = NOW.getFullYear();
  const CURRENT_MONTH = NOW.toISOString().slice(0, 7); // "YYYY-MM"

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

  // Fetch data based on year:
  // past year → past only | current year → both | future year → future only
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

  // Merge months: current year uses past data for past months, future data for rest
  const mergedMonths = useMemo((): MonthData[] => {
    const months: MonthData[] = [];
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${year}-${String(m).padStart(2, "0")}`;
      let items: DividendItem[] = [];

      if (year < CURRENT_YEAR) {
        items = pastData?.months.find((mo) => mo.month === monthKey)?.items ?? [];
      } else if (year > CURRENT_YEAR) {
        items = futureData?.months.find((mo) => mo.month === monthKey)?.items ?? [];
      } else {
        // Current year: past months = actual, current+future months = projected
        if (monthKey < CURRENT_MONTH) {
          items = pastData?.months.find((mo) => mo.month === monthKey)?.items ?? [];
        } else {
          items = futureData?.months.find((mo) => mo.month === monthKey)?.items ?? [];
        }
      }

      months.push({ month: monthKey, items });
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
        rawMonthly: monthValue,
      };
    });
  }, [mergedMonths, showNet, displayCurrency, fxRate]);

  const { annualTotal, monthlyAvg } = useMemo(() => {
    const activeMonths = chartData.filter((d) => d.rawMonthly > 0);
    const total = activeMonths.reduce((s, d) => s + d.rawMonthly, 0);
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
      {/* Header: line 1 — title */}
      <div className="text-accent text-xs tracking-widest mb-2">&#9654; DIVIDEND INCOME</div>
      {/* Header: line 2 — year nav + dropdown */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button className="btn-retro p-0.5" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft size={11} />
          </button>
          <span className="text-accent text-xs tabular-nums w-10 text-center">{year}</span>
          <button className="btn-retro p-0.5" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight size={11} />
          </button>
        </div>
        <div className="relative" ref={netDropdownRef}>
          <button
            className="btn-retro btn-retro-primary text-[10px] px-2 py-0.5 flex items-center gap-1.5"
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
                  className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-border/30 ${showNet === val ? "text-accent" : ""}`}
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
        <ResponsiveContainer width="100%" height={160}>
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
              tick={{ fontSize: 9, fill: "#666", fontFamily: "monospace" }}
              axisLine={{ stroke: "#333" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#666", fontFamily: "monospace" }}
              axisLine={{ stroke: "#333" }}
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
                  fill={entry.monthStr === selectedMonth ? "hsl(38, 92%, 55%)" : "hsl(142, 69%, 58%)"}
                  cursor="pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Selected month breakdown */}
      {selectedMonth && selectedData && selectedData.items.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-accent text-[10px] tracking-widest mb-2">
            {MONTH_LABELS[parseInt(selectedMonth.slice(5, 7)) - 1]} {selectedMonth.slice(0, 4)}
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
                  <div key={i} className="flex items-center justify-between text-xs gap-2">
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
