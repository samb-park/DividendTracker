"use client";
import { useState } from "react";

interface Props {
  holdingId: string;
  ticker: string;
  onAdd: () => void;
}

export function AddTransactionDialog({ holdingId, ticker, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"BUY" | "SELL">("BUY");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [commission, setCommission] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!quantity || !price) return;
    setLoading(true);
    await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdingId,
        action,
        date,
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        commission: commission ? parseFloat(commission) : 0,
        notes: notes || null,
      }),
    });
    onAdd();
    setQuantity("");
    setPrice("");
    setCommission("");
    setNotes("");
    setOpen(false);
    setLoading(false);
  };

  if (!open) {
    return (
      <button className="btn-retro text-xs" onClick={() => setOpen(true)}>
        [+TXN]
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-card border border-border p-6 w-full max-w-md mx-4">
        <div className="text-accent text-xs tracking-wide mb-4">▶ ADD TRANSACTION — {ticker}</div>
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
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">DATE</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">QUANTITY</label>
            <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">PRICE</label>
            <input type="number" step="0.0001" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">COMMISSION</label>
            <input type="number" step="0.01" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs text-muted-foreground block mb-1">NOTES (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="..." />
        </div>
        <div className="flex gap-2">
          <button className="btn-retro btn-retro-primary flex-1" onClick={submit} disabled={loading}>
            {loading ? "[...]" : "[CONFIRM]"}
          </button>
          <button className="btn-retro flex-1" onClick={() => setOpen(false)}>[CANCEL]</button>
        </div>
      </div>
    </div>
  );
}
