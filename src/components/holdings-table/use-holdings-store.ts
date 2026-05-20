import { create } from "zustand";

interface HoldingsTableState {
  colMode: "usd" | "pct";
  priceMode: "price" | "avg";
  mktMode: "mkt" | "cost";
  wgtMode: "total" | "eligible" | "alloc";
  w52Mode: "high" | "low";
  dayMode: "day" | "yld" | "yoc";
  sortCol: string | null;
  sortDir: "asc" | "desc";
  mobileSortKey: string;
  selectedRowId: string | null;

  cycleColMode: () => void;
  cycleSort: (col: string) => void;
  setSortCol: (col: string | null) => void;
  setSortDir: (dir: "asc" | "desc") => void;
  setMobileSortKey: (key: string) => void;
  setSelectedRowId: (id: string | null) => void;
  setPriceMode: (mode: "price" | "avg") => void;
  setMktMode: (mode: "mkt" | "cost") => void;
  setWgtMode: (mode: "total" | "eligible" | "alloc") => void;
  setW52Mode: (mode: "high" | "low") => void;
  setDayMode: (mode: "day" | "yld" | "yoc") => void;
  togglePriceMode: () => void;
  toggleMktMode: () => void;
  toggleW52Mode: () => void;
  cycleDayMode: () => void;
  cycleWgtMode: () => void;
}

export const useHoldingsStore = create<HoldingsTableState>((set, get) => ({
  colMode: "usd",
  priceMode: "price",
  mktMode: "mkt",
  wgtMode: "total",
  w52Mode: "high",
  dayMode: "day",
  sortCol: null,
  sortDir: "desc",
  mobileSortKey: "mkt",
  selectedRowId: null,

  cycleColMode: () =>
    set((s) => ({ colMode: s.colMode === "usd" ? "pct" : "usd" })),

  cycleSort: (col: string) => {
    const { sortCol, sortDir } = get();
    if (sortCol === col) {
      if (sortDir === "desc") {
        set({ sortDir: "asc" });
      } else {
        set({ sortCol: null });
      }
    } else {
      set({ sortCol: col, sortDir: "desc" });
    }
  },

  setSortCol: (col) => set({ sortCol: col }),
  setSortDir: (dir) => set({ sortDir: dir }),
  setMobileSortKey: (key) => set({ mobileSortKey: key }),
  setSelectedRowId: (id) => set({ selectedRowId: id }),

  setPriceMode: (mode) => set({ priceMode: mode }),
  setMktMode: (mode) => set({ mktMode: mode }),
  setWgtMode: (mode) => set({ wgtMode: mode }),
  setW52Mode: (mode) => set({ w52Mode: mode }),
  setDayMode: (mode) => set({ dayMode: mode }),

  togglePriceMode: () =>
    set((s) => ({ priceMode: s.priceMode === "price" ? "avg" : "price" })),
  toggleMktMode: () =>
    set((s) => ({ mktMode: s.mktMode === "mkt" ? "cost" : "mkt" })),
  toggleW52Mode: () =>
    set((s) => ({ w52Mode: s.w52Mode === "high" ? "low" : "high" })),
  cycleDayMode: () =>
    set((s) => ({
      dayMode: s.dayMode === "day" ? "yld" : s.dayMode === "yld" ? "yoc" : "day",
    })),
  cycleWgtMode: () =>
    set((s) => ({
      wgtMode:
        s.wgtMode === "total"
          ? "eligible"
          : s.wgtMode === "eligible"
            ? "alloc"
            : "total",
    })),
}));
