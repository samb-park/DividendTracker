"use client";

import { useEffect, useState } from "react";

interface NewsData {
  summary: string | null;
  items: { ticker: string; title: string; link: string; publishedAt: string | null }[];
  generatedAt: string;
  cached: boolean;
}

export function NewsCard() {
  const [data, setData] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(force = false) {
    if (force) {
      setRefreshing(true);
      await fetch("/api/ai/news", { method: "DELETE" });
    }
    try {
      const res = await fetch("/api/ai/news");
      if (res.ok) setData(await res.json() as NewsData);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  const age = data?.generatedAt
    ? Math.round((Date.now() - new Date(data.generatedAt).getTime()) / 60000)
    : null;

  return (
    <div className="border border-border bg-card mb-4">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="text-accent text-xs tracking-wide">&#9654; MARKET NEWS</div>
        <div className="flex items-center gap-3">
          {age !== null && (
            <span className="text-[10px] text-muted-foreground">
              {age < 1 ? "JUST NOW" : `${age}m AGO`}
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="btn-retro text-[10px] px-2 py-0.5 disabled:opacity-30"
          >
            {refreshing ? "..." : "[ ↺ ]"}
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        {loading && (
          <div className="text-xs text-muted-foreground">LOADING NEWS...</div>
        )}
        {!loading && !data?.summary && (
          <div className="text-xs text-muted-foreground">No news available.</div>
        )}
        {!loading && data?.summary && (
          <div className="text-xs whitespace-pre-wrap leading-relaxed text-foreground">
            {data.summary}
          </div>
        )}
      </div>
    </div>
  );
}
