"use client";

import { useEffect, useState, useCallback } from "react";

interface NewsItem {
  id: string;
  source: string;
  title: string;
  koreanTitle: string;
  description: string;
  link: string;
  publishedAt: string | null;
  topics: string[];
}

interface ClickResult {
  analysis: string;
  related: NewsItem[];
  topics: string[];
}

interface NewsData {
  items: NewsItem[];
  generatedAt: string;
  cached: boolean;
}

const SUGGESTED_KEYWORDS = [
  "Nasdaq 100", "S&P 500", "US market", "Canadian market", "TSX",
  "emerging markets", "global stocks",
  "tech stocks", "AI stocks", "semiconductor", "energy stocks",
  "Canadian banks", "US banks", "healthcare stocks", "utilities",
  "real estate", "consumer staples", "industrials",
  "US dividend", "Canadian dividend", "dividend growth ETF",
  "TSX dividend", "high yield dividend", "DRIP investing",
  "fixed income", "Canadian bonds", "US bonds", "interest rates",
  "leveraged ETF", "covered call ETF", "Canadian ETF",
  "inflation", "Bank of Canada", "Federal Reserve", "CAD USD",
  "recession", "earnings season", "IPO",
  "Bitcoin", "crypto",
];

export function NewsPage() {
  const [data, setData] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [clickResult, setClickResult] = useState<ClickResult | null>(null);
  const [loadingClick, setLoadingClick] = useState(false);
  const [interests, setInterests] = useState<Record<string, number>>({});
  const [showKeywords, setShowKeywords] = useState(false);

  const load = useCallback(async (force = false) => {
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
  }, []);

  const loadInterests = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/news/interests");
      if (res.ok) {
        const d = await res.json() as { topics: Record<string, number>; tickers: Record<string, number> };
        setInterests({ ...d.topics, ...d.tickers });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); loadInterests(); }, [load, loadInterests]);

  async function handleSelect(item: NewsItem) {
    if (selected?.id === item.id) {
      setSelected(null);
      setClickResult(null);
      return;
    }
    setSelected(item);
    setClickResult(null);
    setLoadingClick(true);
    try {
      const res = await fetch("/api/ai/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: item.source, title: item.title, koreanTitle: item.koreanTitle }),
      });
      if (res.ok) {
        const d = await res.json() as ClickResult;
        setClickResult(d);
        setInterests(prev => {
          const n = { ...prev };
          d.topics.forEach(t => { n[t] = (n[t] ?? 0) + 1; });
          n[item.source] = (n[item.source] ?? 0) + 1;
          return n;
        });
      }
    } catch { /* ignore */ }
    setLoadingClick(false);
  }

  async function addKeyword(kw: string) {
    await fetch("/api/ai/news/interests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: kw, count: 3 }),
    });
    setInterests(prev => ({ ...prev, [kw]: (prev[kw] ?? 0) + 3 }));
  }

  async function removeKeyword(kw: string) {
    await fetch("/api/ai/news/interests", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: kw }),
    });
    setInterests(prev => { const n = { ...prev }; delete n[kw]; return n; });
  }

  const age = data?.generatedAt
    ? Math.round((Date.now() - new Date(data.generatedAt).getTime()) / 60000)
    : null;

  const topInterests = Object.entries(interests).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="max-w-3xl mx-auto space-y-2 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between py-2 border-b border-border">
        <div className="text-accent text-xs tracking-wide">&#9654; MARKET NEWS</div>
        <div className="flex items-center gap-3">
          {age !== null && (
            <span className="text-[10px] text-muted-foreground">
              {age < 1 ? "JUST NOW" : `${age}m AGO`}
            </span>
          )}
          <button onClick={() => setShowKeywords(v => !v)} className="btn-retro text-[10px] px-2 py-0.5">
            [ ★ INTERESTS ]
          </button>
          <button onClick={() => load(true)} disabled={refreshing || loading} className="btn-retro text-[10px] px-2 py-0.5 disabled:opacity-30">
            {refreshing ? "..." : "[ ↺ ]"}
          </button>
        </div>
      </div>

      {/* Interest keyword panel */}
      {showKeywords && (
        <div className="border border-border bg-card p-4 space-y-3">
          {topInterests.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground tracking-wide mb-2">내 관심 키워드 (클릭해서 제거)</div>
              <div className="flex flex-wrap gap-1.5">
                {topInterests.map(([kw, cnt]) => (
                  <button key={kw} onClick={() => removeKeyword(kw)}
                    className="btn-retro btn-retro-primary text-[10px] px-2 py-0.5 flex items-center gap-1">
                    {kw} <span className="opacity-60">×{cnt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] text-muted-foreground tracking-wide mb-2">추가할 관심 키워드</div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_KEYWORDS.filter(k => !interests[k]).map(kw => (
                <button key={kw} onClick={() => addKeyword(kw)} className="btn-retro text-[10px] px-2 py-0.5">
                  + {kw}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main content: news list + detail side by side on wide screens */}
      <div className={selected ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : ""}>
        {/* News list */}
        <div className="border border-border bg-card divide-y divide-border">
          {loading && <div className="px-4 py-6 text-xs text-muted-foreground">뉴스 불러오는 중...</div>}
          {!loading && !data?.items.length && (
            <div className="px-4 py-6 text-xs text-muted-foreground">뉴스가 없습니다.</div>
          )}
          {!loading && data?.items.map(item => (
            <div
              key={item.id}
              className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors ${selected?.id === item.id ? "bg-muted/30 border-l-2 border-accent" : ""}`}
              onClick={() => handleSelect(item)}
            >
              <span className="text-[10px] text-accent font-mono mt-0.5 shrink-0 w-14 truncate">
                [{item.source}]
              </span>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className={`text-xs font-medium leading-snug ${selected?.id === item.id ? "text-accent" : "text-foreground"}`}>
                  {item.koreanTitle || item.title}
                </div>
                {item.description && (
                  <div className="text-[11px] text-muted-foreground">{item.description}</div>
                )}
                {(item.topics?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {item.topics.slice(0, 3).map(t => (
                      <span key={t} className="text-[9px] text-muted-foreground border border-border px-1">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0 mt-1">
                {selected?.id === item.id ? "◀" : "▶"}
              </span>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="border border-border bg-card space-y-0">
            {/* Selected item header */}
            <div className="px-4 py-3 border-b border-border">
              <div className="text-[10px] text-accent mb-1">[{selected.source}]</div>
              <div className="text-xs font-medium text-foreground leading-snug">
                {selected.koreanTitle || selected.title}
              </div>
              {selected.link && (
                <a href={selected.link} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-muted-foreground hover:text-accent mt-1 block">
                  원문 보기 →
                </a>
              )}
            </div>

            {/* AI analysis */}
            <div className="px-4 py-3 border-b border-border">
              <div className="text-[10px] text-muted-foreground tracking-wide mb-2">AI 분석</div>
              {loadingClick && <div className="text-[11px] text-muted-foreground">분석 중...</div>}
              {clickResult?.analysis && (
                <div className="text-[11px] leading-relaxed whitespace-pre-wrap text-foreground">
                  {clickResult.analysis}
                </div>
              )}
            </div>

            {/* Related news */}
            {(clickResult?.related?.length ?? 0) > 0 && (
              <div className="divide-y divide-border">
                <div className="px-4 py-2 text-[10px] text-muted-foreground tracking-wide">관련 뉴스</div>
                {clickResult!.related.map(r => (
                  <div
                    key={r.id}
                    className="flex items-start gap-2 px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSelect(r)}
                  >
                    <span className="text-[10px] text-accent font-mono shrink-0 w-14 truncate mt-0.5">[{r.source}]</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-foreground leading-snug">{r.koreanTitle || r.title}</div>
                      {r.description && <div className="text-[10px] text-muted-foreground mt-0.5">{r.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
