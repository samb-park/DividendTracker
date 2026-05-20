"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { fmt } from "@/lib/utils";

export type DisplayCurrency = "CAD" | "USD";
export type MoneyCurrency = "CAD" | "USD";

interface CurrencyContextValue {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  fxRate: number;
  setFxRate: (rate: number) => void;
  fxFallback: boolean;
  setFxFallback: (fallback: boolean) => void;
  fxSource: string;
  setFxSource: (source: string) => void;
  currencySymbol: "C$" | "$";
  convertAmount: (value: number, sourceCurrency: MoneyCurrency) => number;
  formatMoney: (value: number, sourceCurrency?: MoneyCurrency, options?: { signed?: boolean }) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({
  children,
  initialCurrency = "CAD",
  initialFxRate,
}: {
  children: ReactNode;
  initialCurrency?: DisplayCurrency;
  initialFxRate: number;
}) {
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(initialCurrency);
  const [fxRate, setFxRate] = useState(initialFxRate);
  const [fxFallback, setFxFallback] = useState(false);
  const [fxSource, setFxSource] = useState("DEFAULT_FX_RATE");

  const convertAmount = useCallback((value: number, sourceCurrency: MoneyCurrency) => {
    if (displayCurrency === "CAD") return sourceCurrency === "USD" ? value * fxRate : value;
    return sourceCurrency === "CAD" ? value / fxRate : value;
  }, [displayCurrency, fxRate]);

  const currencySymbol: CurrencyContextValue["currencySymbol"] = displayCurrency === "CAD" ? "C$" : "$";

  const formatMoney = useCallback((value: number, sourceCurrency: MoneyCurrency = displayCurrency, options?: { signed?: boolean }) => {
    const converted = sourceCurrency === displayCurrency ? value : convertAmount(value, sourceCurrency);
    const sign = options?.signed && converted > 0 ? "+" : converted < 0 ? "-" : "";
    return `${sign}${currencySymbol}${fmt(Math.abs(converted))}`;
  }, [convertAmount, currencySymbol, displayCurrency]);

  const value = useMemo(() => ({
    displayCurrency,
    setDisplayCurrency,
    fxRate,
    setFxRate,
    fxFallback,
    setFxFallback,
    fxSource,
    setFxSource,
    currencySymbol,
    convertAmount,
    formatMoney,
  }), [displayCurrency, fxRate, fxFallback, fxSource, currencySymbol, convertAmount, formatMoney]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
