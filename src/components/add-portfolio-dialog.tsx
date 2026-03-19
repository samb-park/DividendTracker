"use client";
import { useState } from "react";

export function AddPortfolioDialog({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to create portfolio");
        return;
      }
      onAdd(name);
      setName("");
      setOpen(false);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button className="btn-retro btn-retro-primary text-xs" onClick={() => setOpen(true)}>
        [+ PORTFOLIO]
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-card border border-border p-6 w-full max-w-sm mx-4">
        <div className="text-accent text-xs tracking-wide mb-4">▶ NEW PORTFOLIO</div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Portfolio name..."
          className="mb-4"
          maxLength={100}
        />
        {error && <div className="text-negative text-xs mb-3">{error}</div>}
        <div className="flex gap-2">
          <button className="btn-retro btn-retro-primary flex-1" onClick={submit} disabled={loading}>
            {loading ? "[...]" : "[CREATE]"}
          </button>
          <button className="btn-retro flex-1" onClick={() => { setOpen(false); setError(null); }}>[CANCEL]</button>
        </div>
      </div>
    </div>
  );
}
