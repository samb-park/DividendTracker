"use client";
import { useState, useEffect, useRef } from "react";

interface Props {
  portfolioId: string;
  onAdd: () => void;
}

interface SearchResult {
  symbol: string;
  name: string;
}

export function AddHoldingDialog({ portfolioId, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (ticker.length < 1) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(ticker)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
          setSelectedIndex(-1);
        }
      } catch {
        // ignore
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [ticker]);

  const selectSuggestion = (s: SearchResult) => {
    setTicker(s.symbol);
    setShowSuggestions(false);
  };

  const submit = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioId, ticker: ticker.trim().toUpperCase() }),
    });
    if (res.ok) {
      onAdd();
      setTicker("");
      setSuggestions([]);
      setOpen(false);
    } else {
      setError("Ticker not found");
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Enter") submit();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0) {
        selectSuggestion(suggestions[selectedIndex]);
      } else {
        submit();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  if (!open) {
    return (
      <button className="btn-retro btn-retro-primary text-xs" onClick={() => setOpen(true)}>
        [+ STOCK]
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-card border border-border p-6 w-full max-w-sm mx-4">
        <div className="text-accent text-xs tracking-wide mb-4">&#9654; ADD STOCK</div>
        <div className="mb-4 relative">
          <label className="text-xs text-muted-foreground block mb-1">TICKER</label>
          <input
            autoFocus
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="e.g. AAPL, RY.TO"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border z-10 max-h-48 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={s.symbol}
                  className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center hover:bg-border/50 ${
                    i === selectedIndex ? "bg-border/50" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSuggestion(s);
                  }}
                >
                  <span className="text-accent font-medium">{s.symbol}</span>
                  <span className="text-muted-foreground truncate ml-2 max-w-[140px]">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <div className="text-negative text-xs mb-3">{error}</div>}
        <div className="flex gap-2">
          <button className="btn-retro btn-retro-primary flex-1" onClick={submit} disabled={loading}>
            {loading ? "[...]" : "[ADD]"}
          </button>
          <button className="btn-retro flex-1" onClick={() => { setOpen(false); setSuggestions([]); }}>[CANCEL]</button>
        </div>
      </div>
    </div>
  );
}
