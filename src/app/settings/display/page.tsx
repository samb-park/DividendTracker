"use client";

import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { useState, useEffect } from "react";

type Currency = "CAD" | "USD" | "Combined";

export default function DisplaySettingsPage() {
  const [currency, setCurrency] = useState<Currency>("CAD");

  useEffect(() => {
    const saved = localStorage.getItem("displayCurrency");
    if (saved) {
      setCurrency(saved as Currency);
    }
  }, []);

  function handleCurrencyChange(newCurrency: Currency) {
    setCurrency(newCurrency);
    localStorage.setItem("displayCurrency", newCurrency);
    window.dispatchEvent(new CustomEvent("currencyChange", { detail: newCurrency }));
  }

  const currencies: { value: Currency; label: string; description: string }[] = [
    { value: "CAD", label: "CAD", description: "Canadian Dollar" },
    { value: "USD", label: "USD", description: "US Dollar" },
    { value: "Combined", label: "Combined", description: "Show both CAD and USD" },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">Display</h1>
      </div>

      {/* Currency preference */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
            Currency Display
          </h3>
        </div>
        <div className="divide-y divide-gray-100">
          {currencies.map((curr) => (
            <button
              key={curr.value}
              onClick={() => handleCurrencyChange(curr.value)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="text-left">
                <div className="text-sm font-medium text-gray-900">{curr.label}</div>
                <div className="text-xs text-gray-500">{curr.description}</div>
              </div>
              {currency === curr.value && (
                <Check className="w-5 h-5 text-green-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 px-4">
        Changes will be applied to Holdings and Dividends pages.
      </p>
    </div>
  );
}
