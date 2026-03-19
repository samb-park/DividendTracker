"use client";

import { useState } from "react";

interface Transaction {
  id: string;
  action: "BUY" | "SELL";
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

export function TransactionsClient({ initialTransactions }: { initialTransactions: Transaction[] }) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [filter, setFilter] = useState("");

  const filtered = transactions.filter(
    (t) =>
      t.holding.ticker.includes(filter.toUpperCase()) ||
      t.holding.portfolio.name.toLowerCase().includes(filter.toLowerCase())
  );

  const del = async (id: string) => {
    if (!confirm("Delete this transaction?")) return;
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (!res.ok) { alert("Failed to delete transaction."); return; }
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div>
      <div className="mb-4 max-w-xs">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="FILTER BY TICKER OR PORTFOLIO..."
          className="text-xs"
        />
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>PORTFOLIO</th>
              <th>TICKER</th>
              <th>ACTION</th>
              <th className="text-right">QTY</th>
              <th className="text-right">PRICE</th>
              <th className="text-right">COMMISSION</th>
              <th className="text-right">TOTAL</th>
              <th>NOTES</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const qty = parseFloat(t.quantity);
              const price = parseFloat(t.price);
              const comm = parseFloat(t.commission);
              const total = qty * price + (t.action === "BUY" ? comm : -comm);
              return (
                <tr key={t.id}>
                  <td className="text-muted-foreground text-xs">
                    {new Date(t.date).toLocaleDateString("en-CA")}
                  </td>
                  <td className="text-xs text-muted-foreground">{t.holding.portfolio.name}</td>
                  <td className="font-medium text-accent">{t.holding.ticker}</td>
                  <td className={t.action === "BUY" ? "text-positive text-xs" : "text-negative text-xs"}>
                    {t.action}
                  </td>
                  <td className="text-right tabular-nums">{fmt(qty, 4)}</td>
                  <td className="text-right tabular-nums">
                    {t.holding.currency === "CAD" ? "C$" : "$"}{fmt(price)}
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {comm > 0 ? `$${fmt(comm)}` : "—"}
                  </td>
                  <td className={`text-right tabular-nums ${t.action === "BUY" ? "text-negative" : "text-positive"}`}>
                    {t.action === "BUY" ? "-" : "+"}{t.holding.currency === "CAD" ? "C$" : "$"}{fmt(Math.abs(total))}
                  </td>
                  <td className="text-xs text-muted-foreground max-w-32 truncate">{t.notes || "—"}</td>
                  <td>
                    <button
                      className="btn-retro text-xs text-negative border-negative/30 hover:border-negative"
                      onClick={() => del(t.id)}
                    >
                      [X]
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-muted-foreground text-xs py-8 text-center">NO TRANSACTIONS FOUND</div>
        )}
      </div>
    </div>
  );
}
