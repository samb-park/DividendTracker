"use client";

import { AddHoldingDialog } from "../add-holding-dialog";
import { useHoldingsStore } from "./use-holdings-store";

interface HoldingsTableHeaderProps {
  rowsLength: number;
  readOnly?: boolean;
  portfolioId: string;
  onRefresh: () => void;
  showTopBar?: boolean;
  showMobilePills?: boolean;
  showTableHead?: boolean;
}

const mobileSortOptions = [
  { key: "mkt", label: "MKT" },
  { key: "pnl", label: "P&L" },
  { key: "day", label: "DAY" },
  { key: "wgt", label: "WGT" },
  { key: "ticker", label: "A-Z" },
] as const;

function SortIndicator({ col }: { col: string }) {
  const sortCol = useHoldingsStore((s) => s.sortCol);
  const sortDir = useHoldingsStore((s) => s.sortDir);
  if (sortCol !== col) return <span className="ml-1 text-muted-foreground/50"> ▾</span>;
  return <>{sortDir === "asc" ? " ▲" : " ▼"}</>;
}

export function HoldingsTableHeader({
  rowsLength,
  readOnly,
  portfolioId,
  onRefresh,
  showTopBar = true,
  showMobilePills = true,
  showTableHead = true,
}: HoldingsTableHeaderProps) {
  const cycleSort = useHoldingsStore((s) => s.cycleSort);
  const cycleColMode = useHoldingsStore((s) => s.cycleColMode);
  const cycleDayMode = useHoldingsStore((s) => s.cycleDayMode);
  const cycleWgtMode = useHoldingsStore((s) => s.cycleWgtMode);
  const togglePriceMode = useHoldingsStore((s) => s.togglePriceMode);
  const toggleMktMode = useHoldingsStore((s) => s.toggleMktMode);
  const toggleW52Mode = useHoldingsStore((s) => s.toggleW52Mode);
  const setSortDir = useHoldingsStore((s) => s.setSortDir);
  const setSortCol = useHoldingsStore((s) => s.setSortCol);
  const setMobileSortKey = useHoldingsStore((s) => s.setMobileSortKey);
  const colMode = useHoldingsStore((s) => s.colMode);
  const priceMode = useHoldingsStore((s) => s.priceMode);
  const mktMode = useHoldingsStore((s) => s.mktMode);
  const wgtMode = useHoldingsStore((s) => s.wgtMode);
  const w52Mode = useHoldingsStore((s) => s.w52Mode);
  const dayMode = useHoldingsStore((s) => s.dayMode);
  const sortDir = useHoldingsStore((s) => s.sortDir);
  const mobileSortKey = useHoldingsStore((s) => s.mobileSortKey);

  return (
    <>
      {showTopBar && (
        <div className="flex items-center justify-between mb-3">
          {rowsLength > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              {rowsLength} POSITION{rowsLength !== 1 ? "S" : ""}
            </span>
          ) : (
            <span />
          )}
          {!readOnly && (
            <AddHoldingDialog portfolioId={portfolioId} onAdd={onRefresh} />
          )}
        </div>
      )}

      {/* Mobile sort pills + wgtMode toggle */}
      {showMobilePills && (
        <div className="sm:hidden flex items-center justify-between gap-1 mb-2">
          <button
            className={`btn-retro text-[9px] px-1.5 py-0.5 ${wgtMode === "eligible" ? "btn-retro-primary" : ""}`}
            onClick={() => cycleWgtMode()}
            title="Weight: excl 포함 / excl 제외"
          >
            {wgtMode === "eligible" ? "ELG" : wgtMode === "alloc" ? "ALC" : "ALL"}
          </button>
          <div className="flex items-center gap-1">
            {mobileSortOptions.map(({ key, label }) => (
              <button
                key={key}
                className={`btn-retro text-[9px] px-1.5 py-0.5 ${mobileSortKey === key ? "btn-retro-primary" : ""}`}
                onClick={() => {
                  if (mobileSortKey === key) {
                    setSortDir(sortDir === "desc" ? "asc" : "desc");
                  } else {
                    setMobileSortKey(key);
                    setSortCol(key);
                    setSortDir("desc");
                  }
                }}
              >
                {label}
                {mobileSortKey === key
                  ? sortDir === "desc"
                    ? " ▼"
                    : " ▲"
                  : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Desktop table header (sm+) — rendered inside the main <table> */}
      {showTableHead && (
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            <th
              className="w-20 cursor-pointer select-none hover:text-accent transition-colors"
              onClick={() => cycleSort("ticker")}
            >
              TICKER<SortIndicator col="ticker" />
            </th>
            <th className="text-left w-16 hidden md:table-cell">ACCT</th>
            <th
              className="text-left w-32 hidden lg:table-cell cursor-pointer select-none hover:text-accent transition-colors"
              onClick={() => cycleSort("ticker")}
            >
              NAME<SortIndicator col="ticker" />
            </th>
            <th
              className="text-right w-24 cursor-pointer select-none hover:text-accent transition-colors"
              onClick={() => cycleSort("price")}
            >
              {priceMode === "price" ? "PRICE" : "AVG"}
              <SortIndicator col="price" />
              <span
                className="ml-1 text-muted-foreground/50 hover:text-accent text-[10px] cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePriceMode();
                }}
              >
                ⟳
              </span>
            </th>
            <th className="text-right w-20 hidden sm:table-cell select-none">
              <span
                className="cursor-pointer hover:text-accent transition-colors"
                onClick={() => cycleSort("wgt")}
              >
                {wgtMode === "total"
                  ? "WGT"
                  : wgtMode === "eligible"
                    ? "WGT·ELG"
                    : "ALLOC"}
                <SortIndicator col="wgt" />
              </span>
              <button
                className={`ml-1 btn-retro text-[8px] px-1 py-0 align-middle ${wgtMode !== "total" ? "btn-retro-primary" : ""}`}
                onClick={() => cycleWgtMode()}
                title="ALL: excl 포함 / ELG: excl 제외 / ALLOC: 배분금액"
              >
                {wgtMode === "total"
                  ? "ALL"
                  : wgtMode === "eligible"
                    ? "ELG"
                    : "ALC"}
              </button>
            </th>
            <th
              className="text-right w-28 cursor-pointer select-none hover:text-accent transition-colors"
              onClick={() => cycleSort("mkt")}
            >
              {mktMode === "mkt" ? "MKT" : "COST"}
              <SortIndicator col="mkt" />
              <span
                className="ml-1 text-muted-foreground/50 hover:text-accent text-[10px] cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMktMode();
                }}
              >
                ⟳
              </span>
            </th>
            <th
              className="text-right w-28 cursor-pointer select-none hover:text-accent transition-colors"
              onClick={() => cycleSort("pnl")}
            >
              {colMode === "usd" ? "P&L $" : "P&L %"}
              <SortIndicator col="pnl" />
              <span
                className="ml-1 text-muted-foreground/50 hover:text-accent text-[10px] cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  cycleColMode();
                }}
              >
                ⟳
              </span>
            </th>
            <th
              className="text-right w-20 hidden sm:table-cell cursor-pointer select-none hover:text-accent transition-colors"
              onClick={() => cycleSort("day")}
              title="YOC = Yield on Cost (annual dividend ÷ your cost basis)"
            >
              {dayMode === "day"
                ? "DAY"
                : dayMode === "yld"
                  ? "YLD"
                  : "YOC"}
              <SortIndicator col="day" />
              <span
                className="ml-1 text-muted-foreground/50 hover:text-accent text-[10px] cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  cycleDayMode();
                }}
              >
                ⟳
              </span>
            </th>
            <th
              className="text-right w-24 hidden sm:table-cell cursor-pointer select-none hover:text-accent transition-colors"
              onClick={() => cycleSort("shares")}
            >
              SHARES<SortIndicator col="shares" />
            </th>
            <th
              className="text-right w-24 hidden sm:table-cell cursor-pointer select-none hover:text-accent transition-colors"
              onClick={() => cycleSort("w52")}
            >
              {w52Mode === "high" ? "52W H" : "52W L"}
              <SortIndicator col="w52" />
              <span
                className="ml-1 text-muted-foreground/50 hover:text-accent text-[10px] cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleW52Mode();
                }}
              >
                ⟳
              </span>
            </th>
          </tr>
        </thead>
      )}
    </>
  );
}
