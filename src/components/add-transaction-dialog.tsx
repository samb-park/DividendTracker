"use client";
import { useState } from "react";

interface Props {
  holdingId?: string;
  ticker: string;
  portfolios?: { id: string; name: string }[];
  onAdd: () => void;
}

export function AddTransactionDialog({ holdingId, ticker, portfolios, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"BUY" | "SELL">("BUY");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [commission, setCommission] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(portfolios?.[0]?.id ?? "");

  const submit = async () => {
    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    if (!quantity || !price || qty <= 0 || prc <= 0) return;
    const today = new Date().toISOString().split("T")[0];
    if (date > today) {
      setError("Transaction date cannot be in the future");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = portfolios
        ? {
            portfolioId: selectedPortfolioId,
            ticker,
            action,
            date,
            quantity: qty,
            price: prc,
            commission: commission ? Math.abs(parseFloat(commission)) : 0,
            notes: notes || null,
          }
        : {
            holdingId,
            action,
            date,
            quantity: qty,
            price: prc,
            commission: commission ? Math.abs(parseFloat(commission)) : 0,
            notes: notes || null,
          };
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save transaction");
        return;
      }
      onAdd();
      setQuantity("");
      setPrice("");
      setCommission("");
      setNotes("");
      setOpen(false);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button className="btn-retro text-xs px-2 py-1" onClick={() => setOpen(true)}>
        [+]
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-card border border-border p-6 w-full max-w-md mx-4">
        <div className="text-accent text-xs tracking-wide mb-4">▶ ADD TRANSACTION — {ticker}</div>
        {portfolios && portfolios.length > 1 && (
          <div className="mb-4">
            <label className="text-xs text-muted-foreground block mb-1">ACCOUNT</label>
            <select
              value={selectedPortfolioId}
              onChange={(e) => setSelectedPortfolioId(e.target.value)}
              className="w-full"
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2 mb-4">
          {(["BUY", "SELL"] as const).map((a) => (
            <button
              key={a}
              className={`btn-retro flex-1 ${action === a ? (a === "BUY" ? "border-primary text-primary" : "border-destructive text-destructive") : ""}`}
              onClick={() => setAction(a)}
            >
              [{a}]
            </button>
          ))}
        </div>
        <div className="mb-3">
          <label className="text-xs text-muted-foreground block mb-1">DATE</label>
          <input type="date" value={date} max={new Date().toISOString().split("T")[0]} onChange={(e) => setDate(e.target.value)} className="w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">QUANTITY</label>
            <input type="number" min="0.0001" step="0.0001" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">PRICE</label>
            <input type="number" min="0.0001" step="0.0001" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground block mb-1">COMMISSION</label>
            <input type="number" min="0" step="0.01" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs text-muted-foreground block mb-1">NOTES (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="..." />
        </div>
        {error && <div className="text-negative text-xs mb-3">{error}</div>}
        <div className="flex gap-2">
          <button className="btn-retro btn-retro-primary flex-1" onClick={submit} disabled={loading}>
            {loading ? "[...]" : "[CONFIRM]"}
          </button>
          <button className="btn-retro flex-1" onClick={() => { setOpen(false); setError(null); }}>[CANCEL]</button>
        </div>
      </div>
    </div>
  );
}
