"use client";
import { useState } from "react";

interface Props {
  portfolioId: string;
  onAdd: () => void;
}

export function AddHoldingDialog({ portfolioId, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState("");
  const [currency, setCurrency] = useState<"USD" | "CAD">("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioId, ticker: ticker.trim().toUpperCase(), currency }),
    });
    if (res.ok) {
      onAdd();
      setTicker("");
      setOpen(false);
    } else {
      setError("Ticker not found");
    }
    setLoading(false);
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
      <div className="bg-card border border-border p-6 w-80">
        <div className="text-accent text-xs tracking-widest mb-4">▶ ADD STOCK</div>
        <div className="mb-3">
          <label className="text-xs text-muted-foreground block mb-1">TICKER</label>
          <input
            autoFocus
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. AAPL, RY.TO"
          />
        </div>
        <div className="mb-4">
          <label className="text-xs text-muted-foreground block mb-1">CURRENCY</label>
          <div className="flex gap-2">
            {(["USD", "CAD"] as const).map((c) => (
              <button
                key={c}
                className={`btn-retro flex-1 ${currency === c ? "btn-retro-primary" : ""}`}
                onClick={() => setCurrency(c)}
              >
                [{c}]
              </button>
            ))}
          </div>
        </div>
        {error && <div className="text-negative text-xs mb-3">{error}</div>}
        <div className="flex gap-2">
          <button className="btn-retro btn-retro-primary flex-1" onClick={submit} disabled={loading}>
            {loading ? "[...]" : "[ADD]"}
          </button>
          <button className="btn-retro flex-1" onClick={() => setOpen(false)}>[CANCEL]</button>
        </div>
      </div>
    </div>
  );
}
