"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { CashFlow } from "@/components/cash-flow";
import { DividendGrowthChart } from "@/components/dividend-growth-chart";
import { ErrorBoundary } from "@/components/error-boundary";

const TABS = [
  { key: "cashflow", label: "CASH FLOW" },
  { key: "transactions", label: "TRANSACTIONS" },
  { key: "dividends", label: "DIV HISTORY" },
  { key: "divgrowth", label: "DIV GROWTH" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface Txn {
  id: string;
  action: "BUY" | "SELL" | "DIVIDEND";
  date: string;
  quantity: string;
  price: string;
  commission: string;
  notes: string | null;
  holding: {
    ticker: string;
    currency: "USD" | "CAD";
    portfolio: { name: string };
  };
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function sym(currency: "USD" | "CAD") {
  return currency === "CAD" ? "C$" : "$";
}

function Dropdown({ value, options, onChange, placeholder }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        className="btn-retro btn-retro-primary text-xs flex items-center gap-1.5 min-w-[7rem]"
        onClick={() => setOpen(v => !v)}
      >
        <span className="flex-1 text-left truncate">{value || placeholder}</span>
        <span className="text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-0.5 z-50 bg-card border border-border min-w-full max-h-60 overflow-y-auto">
          <button
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-border/30 ${!value ? "text-accent" : ""}`}
            onClick={() => { onChange(""); setOpen(false); }}
          >
            ALL
          </button>
          {options.map(o => (
            <button
              key={o}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-border/30 ${value === o ? "text-accent" : ""}`}
              onClick={() => { onChange(o); setOpen(false); }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MorePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("cashflow");
  const [fxRate, setFxRate] = useState(1.35);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState("");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [selectedYear, setSelectedYear] = useState("");

  useEffect(() => {
    fetch("/api/fx").then(r => r.json()).then(d => { if (d.rate) setFxRate(d.rate); }).catch(() => {});
  }, []);

  useEffect(() => {
    if ((activeTab === "transactions" || activeTab === "dividends") && txns === null) {
      setLoading(true);
      fetch("/api/transactions")
        .then(r => r.json())
        .then(d => { setTxns(Array.isArray(d) ? d : []); setLoading(false); })
        .catch(() => { setTxns([]); setLoading(false); });
    }
  }, [activeTab, txns]);

  // reset ticker when portfolio changes
  useEffect(() => { setSelectedTicker(""); }, [selectedPortfolio]);

  // reset year when switching between transactions and dividends tabs
  useEffect(() => {
    setSelectedYear("");
  }, [activeTab]);

  const yearOptions = useMemo(() =>
    [...new Set((txns ?? []).map(t => t.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a)),
    [txns]
  );

  const activeYearOptions = useMemo(() => {
    if (activeTab === "transactions") {
      return [...new Set((txns ?? []).filter(t => t.action !== "DIVIDEND").map(t => t.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
    }
    if (activeTab === "dividends") {
      return [...new Set((txns ?? []).filter(t => t.action === "DIVIDEND").map(t => t.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
    }
    return yearOptions;
  }, [txns, activeTab, yearOptions]);

  const portfolioOptions = useMemo(() =>
    [...new Set((txns ?? []).map(t => t.holding.portfolio.name))].sort(),
    [txns]
  );

  const tickerOptions = useMemo(() => {
    const base = selectedPortfolio
      ? (txns ?? []).filter(t => t.holding.portfolio.name === selectedPortfolio)
      : (txns ?? []);
    return [...new Set(base.map(t => t.holding.ticker))].sort();
  }, [txns, selectedPortfolio]);

  const filtered = useMemo(() =>
    (txns ?? []).filter(t =>
      (!selectedYear || t.date.startsWith(selectedYear)) &&
      (!selectedPortfolio || t.holding.portfolio.name === selectedPortfolio) &&
      (!selectedTicker || t.holding.ticker === selectedTicker)
    ),
    [txns, selectedYear, selectedPortfolio, selectedTicker]
  );

  const tradeTxns = useMemo(() => filtered.filter(t => t.action === "BUY" || t.action === "SELL"), [filtered]);
  const divTxns = useMemo(() => filtered.filter(t => t.action === "DIVIDEND"), [filtered]);

  return (
    <div>
      {/* Top tab bar */}
      <div
        role="tablist"
        aria-label="History view"
        className="grid grid-cols-4 border border-border mb-6"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              className={`py-2 text-[10px] tracking-widest uppercase font-medium transition-colors border-r border-border last:border-r-0 focus-visible:outline-none ${
                isActive
                  ? "bg-primary/10 text-primary border-b-2 border-b-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "cashflow" && <CashFlow fxRate={fxRate} />}

      {activeTab === "divgrowth" && (
        <ErrorBoundary label="DIV GROWTH">
          <DividendGrowthChart />
        </ErrorBoundary>
      )}

      {(activeTab === "transactions" || activeTab === "dividends") && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Dropdown
              value={selectedYear}
              options={activeYearOptions}
              onChange={setSelectedYear}
              placeholder="YEAR"
            />
            <Dropdown
              value={selectedPortfolio}
              options={portfolioOptions}
              onChange={setSelectedPortfolio}
              placeholder="ACCOUNT"
            />
            <Dropdown
              value={selectedTicker}
              options={tickerOptions}
              onChange={setSelectedTicker}
              placeholder="TICKER"
            />
          </div>

          {loading && (
            <div className="text-muted-foreground text-xs text-center py-12">LOADING...</div>
          )}

          {!loading && activeTab === "transactions" && (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th className="hidden sm:table-cell">PORTFOLIO</th>
                    <th>TICKER</th>
                    <th>ACTION</th>
                    <th className="text-right">QTY</th>
                    <th className="text-right">PRICE</th>
                    <th className="hidden sm:table-cell text-right">COMM</th>
                    <th className="text-right">TOTAL</th>
                    <th className="hidden md:table-cell">NOTES</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeTxns.map(t => {
                    const qty = parseFloat(t.quantity);
                    const price = parseFloat(t.price);
                    const comm = parseFloat(t.commission);
                    const total = qty * price + (t.action === "BUY" ? comm : -comm);
                    return (
                      <tr key={t.id}>
                        <td className="text-muted-foreground text-xs">{t.date.slice(0, 10)}</td>
                        <td className="hidden sm:table-cell text-xs text-muted-foreground">{t.holding.portfolio.name}</td>
                        <td className="font-medium text-accent">{t.holding.ticker}</td>
                        <td className={`text-xs ${t.action === "BUY" ? "text-positive" : "text-negative"}`}>
                          {t.action}
                        </td>
                        <td className="text-right tabular-nums">{Number.isInteger(qty) ? fmt(qty, 0) : fmt(qty, qty < 10 ? 4 : 2)}</td>
                        <td className="text-right tabular-nums">{sym(t.holding.currency)}{fmt(price)}</td>
                        <td className="hidden sm:table-cell text-right tabular-nums text-muted-foreground">
                          {comm > 0 ? `$${fmt(comm)}` : "—"}
                        </td>
                        <td className={`text-right tabular-nums ${t.action === "BUY" ? "text-negative" : "text-positive"}`}>
                          {t.action === "BUY" ? "-" : "+"}{sym(t.holding.currency)}{fmt(Math.abs(total))}
                        </td>
                        <td className="hidden md:table-cell text-xs text-muted-foreground max-w-32 truncate">{t.notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {tradeTxns.length === 0 && (
                <div className="text-muted-foreground text-xs py-8 text-center">NO TRANSACTIONS FOUND</div>
              )}
            </div>
          )}

          {!loading && activeTab === "dividends" && (
            <div>
              <div className="flex justify-end mb-3">
                <a
                  href={`/api/tax-report?year=${selectedYear || new Date().getFullYear()}`}
                  download
                  className="btn-retro text-[10px] px-3 py-1.5 tracking-wide"
                >
                  ↓ CSV ({selectedYear || new Date().getFullYear()})
                </a>
              </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th className="hidden sm:table-cell">PORTFOLIO</th>
                    <th>TICKER</th>
                    <th className="text-right">AMOUNT</th>
                    <th className="hidden md:table-cell">NOTES</th>
                  </tr>
                </thead>
                <tbody>
                  {divTxns.map(t => {
                    const amount = parseFloat(t.price) * parseFloat(t.quantity);
                    return (
                      <tr key={t.id}>
                        <td className="text-muted-foreground text-xs">{t.date.slice(0, 10)}</td>
                        <td className="hidden sm:table-cell text-xs text-muted-foreground">{t.holding.portfolio.name}</td>
                        <td className="font-medium text-accent">{t.holding.ticker}</td>
                        <td className="text-right tabular-nums text-primary">
                          {sym(t.holding.currency)}{fmt(amount)}
                        </td>
                        <td className="hidden md:table-cell text-xs text-muted-foreground max-w-32 truncate">{t.notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {divTxns.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="text-xs text-muted-foreground pt-2">TOTAL ({divTxns.length})</td>
                      <td className="text-right tabular-nums text-primary font-medium pt-2">
                        {divTxns.every(t => t.holding.currency === divTxns[0].holding.currency)
                          ? `${sym(divTxns[0].holding.currency)}${fmt(divTxns.reduce((s, t) => s + parseFloat(t.price) * parseFloat(t.quantity), 0))}`
                          : `${fmt(divTxns.reduce((s, t) => {
                              const v = parseFloat(t.price) * parseFloat(t.quantity);
                              return s + (t.holding.currency === "USD" ? v * fxRate : v);
                            }, 0))} CAD`
                        }
                      </td>
                      <td className="hidden md:table-cell" />
                    </tr>
                  </tfoot>
                )}
              </table>
              {divTxns.length === 0 && (
                <div className="text-muted-foreground text-xs py-8 text-center">NO DIVIDEND HISTORY FOUND</div>
              )}
            </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
