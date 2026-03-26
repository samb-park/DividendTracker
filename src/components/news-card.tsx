"use client";

import { useEffect, useState } from "react";

interface NewsItem {
  id: string;
  source: string;
  title: string;
  link: string;
  publishedAt: string | null;
  topics: string[];
}

interface RelatedData {
  related: NewsItem[];
  relatedSummary: string;
  topics: string[];
}

interface NewsData {
  summary: string | null;
  items: NewsItem[];
  generatedAt: string;
  cached: boolean;
}

// Suggested interest keywords to offer users
const SUGGESTED_KEYWORDS = [
  "Nasdaq 100", "S&P 500", "US dividend", "Canadian dividend",
  "Canadian banks", "real estate", "tech stocks", "leveraged ETF",
  "fixed income", "TSX dividend", "dividend growth ETF", "US market",
];

export function NewsCard() {
  const [data, setData] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null); // item id
  const [relatedMap, setRelatedMap] = useState<Record<string, RelatedData>>({});
  const [loadingRelated, setLoadingRelated] = useState<string | null>(null);
  const [interests, setInterests] = useState<Record<string, number>>({});
  const [showKeywords, setShowKeywords] = useState(false);

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

  async function loadInterests() {
    try {
      const res = await fetch("/api/ai/news/interests");
      if (res.ok) {
        const d = await res.json() as { topics: Record<string, number>; tickers: Record<string, number> };
        setInterests({ ...d.topics, ...d.tickers });
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    load();
    loadInterests();
  }, []);

  async function handleClick(item: NewsItem) {
    if (expanded === item.id) { setExpanded(null); return; }
    setExpanded(item.id);
    if (relatedMap[item.id]) return;

    setLoadingRelated(item.id);
    try {
      const res = await fetch("/api/ai/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: item.source, title: item.title }),
      });
      if (res.ok) {
        const d = await res.json() as RelatedData;
        setRelatedMap(m => ({ ...m, [item.id]: d }));
        // Update interest counts locally
        const newInterests = { ...interests };
        d.topics.forEach(t => { newInterests[t] = (newInterests[t] ?? 0) + 1; });
        newInterests[item.source] = (newInterests[item.source] ?? 0) + 1;
        setInterests(newInterests);
      }
    } catch { /* ignore */ }
    setLoadingRelated(null);
  }

  async function addKeywordInterest(keyword: string) {
    try {
      await fetch("/api/ai/news/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: keyword, count: 3 }),
      });
      setInterests(prev => ({ ...prev, [keyword]: (prev[keyword] ?? 0) + 3 }));
    } catch { /* ignore */ }
  }

  async function removeInterest(keyword: string) {
    try {
      await fetch("/api/ai/news/interests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: keyword }),
      });
      setInterests(prev => { const n = { ...prev }; delete n[keyword]; return n; });
    } catch { /* ignore */ }
  }

  const age = data?.generatedAt
    ? Math.round((Date.now() - new Date(data.generatedAt).getTime()) / 60000)
    : null;

  const topInterests = Object.entries(interests)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="border border-border bg-card mb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="text-accent text-xs tracking-wide">&#9654; MARKET NEWS</div>
        <div className="flex items-center gap-3">
          {age !== null && (
            <span className="text-[10px] text-muted-foreground">
              {age < 1 ? "JUST NOW" : `${age}m AGO`}
            </span>
          )}
          <button
            onClick={() => setShowKeywords(v => !v)}
            className="btn-retro text-[10px] px-2 py-0.5"
            title="관심 키워드 설정"
          >
            [ ★ ]
          </button>
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="btn-retro text-[10px] px-2 py-0.5 disabled:opacity-30"
          >
            {refreshing ? "..." : "[ ↺ ]"}
          </button>
        </div>
      </div>

      {/* Interest keyword panel */}
      {showKeywords && (
        <div className="px-4 py-3 border-b border-border space-y-2">
          <div className="text-[10px] text-muted-foreground tracking-wide">내 관심 키워드 (클릭해서 제거)</div>
          {topInterests.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topInterests.map(([kw, cnt]) => (
                <button
                  key={kw}
                  onClick={() => removeInterest(kw)}
                  className="btn-retro btn-retro-primary text-[10px] px-2 py-0.5 flex items-center gap-1"
                >
                  {kw} <span className="opacity-60">×{cnt}</span>
                </button>
              ))}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground tracking-wide mt-2">추가할 관심 키워드</div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_KEYWORDS.filter(k => !interests[k]).map(kw => (
              <button
                key={kw}
                onClick={() => addKeywordInterest(kw)}
                className="btn-retro text-[10px] px-2 py-0.5"
              >
                + {kw}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI Summary */}
      {!loading && data?.summary && (
        <div className="px-4 pt-3 pb-2 text-xs whitespace-pre-wrap leading-relaxed text-foreground border-b border-border">
          {data.summary}
        </div>
      )}

      {/* Individual news items */}
      <div className="divide-y divide-border">
        {loading && (
          <div className="px-4 py-4 text-xs text-muted-foreground">LOADING NEWS...</div>
        )}
        {!loading && data?.items.map(item => (
          <div key={item.id}>
            {/* News row */}
            <div
              className="flex items-start gap-2 px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
              onClick={() => handleClick(item)}
            >
              <span className="text-[10px] text-accent font-mono mt-0.5 shrink-0 w-16 truncate">
                [{item.source}]
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-xs leading-snug ${expanded === item.id ? "text-accent" : "text-foreground"}`}>
                  {item.title}
                </div>
                {(item.topics?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.topics.slice(0, 3).map(t => (
                      <span key={t} className="text-[9px] text-muted-foreground border border-border px-1">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                {expanded === item.id ? "▲" : "▼"}
              </span>
            </div>

            {/* Related news panel */}
            {expanded === item.id && (
              <div className="bg-muted/10 border-t border-border px-4 py-3 space-y-2">
                {loadingRelated === item.id && (
                  <div className="text-[10px] text-muted-foreground">관련 뉴스 불러오는 중...</div>
                )}
                {relatedMap[item.id] && (
                  <>
                    {relatedMap[item.id].relatedSummary && (
                      <div className="text-[11px] text-foreground leading-relaxed whitespace-pre-wrap border-l-2 border-accent pl-3">
                        {relatedMap[item.id].relatedSummary}
                      </div>
                    )}
                    {(relatedMap[item.id].related?.length ?? 0) > 0 && (
                      <div className="space-y-1 mt-2">
                        <div className="text-[10px] text-muted-foreground tracking-wide">관련 뉴스</div>
                        {relatedMap[item.id].related.map(r => (
                          <a
                            key={r.id}
                            href={r.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-[11px] text-muted-foreground hover:text-foreground leading-snug py-0.5"
                            onClick={e => e.stopPropagation()}
                          >
                            <span className="text-accent">[{r.source}]</span> {r.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
