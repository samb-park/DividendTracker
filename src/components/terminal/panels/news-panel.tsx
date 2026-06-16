"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ExternalLink, ChevronRight, ChevronDown } from "lucide-react";
import { PanelEmpty, DataBadge } from "../panel-state";
import { cn } from "@/lib/utils";

/**
 * News + Korean-translation panel for SnapTerminal.
 *
 * Backed by the existing /api/ai/news route (single-user mode). The GET
 * response shape is fixed by route.ts:
 *   { items: NewsItem[]; generatedAt?: string; cached: boolean }
 *   NewsItem = { id, source, title, koreanTitle, description, link,
 *                publishedAt, topics }
 *
 * HONESTY NOTES (절대 규칙 #1 — no fake data):
 *  - The backend returns NO sentiment (긍/부/중립) and NO importance score.
 *    We do NOT fabricate them. A single panel-level marker states that the
 *    backend does not provide them, rather than inventing values.
 *  - When the AI provider is unconfigured, the backend still 200s with REAL
 *    Yahoo headlines but leaves koreanTitle === title and description empty.
 *    We render the real headlines and flag "한국어 번역 미제공" inline — we do
 *    NOT blank the whole panel, because the headlines are genuine data.
 *  - 404 → no_data, other non-ok → error, ok+empty → no_data (mirrors
 *    candle-chart-panel's status machine).
 */

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

interface NewsResponse {
  items: NewsItem[];
  generatedAt?: string;
  cached?: boolean;
}

interface ClickResult {
  analysis: string;
  related: NewsItem[];
  topics: string[];
}

type Status = "loading" | "ok" | "no_data" | "error";

function relativeAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.round(hrs / 24);
  return `${days}일 전`;
}

/** True when an item carries a real Korean translation (not just the English fallback). */
function isTranslated(item: NewsItem): boolean {
  return (item.koreanTitle.trim() !== "" && item.koreanTitle.trim() !== item.title.trim())
    || item.description.trim() !== "";
}

export function NewsPanel({ ticker }: { ticker?: string } = {}) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [refreshing, setRefreshing] = useState(false);

  // Expand-on-click → AI deep analysis + related (POST). Optional polish; the
  // panel-body contract is unaffected (we still return a single div).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clickResults, setClickResults] = useState<Record<string, ClickResult>>({});
  const [clickLoading, setClickLoading] = useState<string | null>(null);
  const [clickError, setClickError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (force) {
      setRefreshing(true);
      try {
        await fetch("/api/ai/news", { method: "DELETE", cache: "no-store" });
      } catch {
        /* deleting the cache is best-effort */
      }
    } else {
      setStatus("loading");
    }
    try {
      const res = await fetch("/api/ai/news", { cache: "no-store" });
      if (res.status === 404) {
        setStatus("no_data");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const body = (await res.json()) as NewsResponse;
      const next = body.items ?? [];
      setItems(next);
      setGeneratedAt(body.generatedAt ?? null);
      setCached(Boolean(body.cached));
      setStatus(next.length === 0 ? "no_data" : "ok");
    } catch {
      setStatus("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  // Optional client-side ticker filter. GET takes no params, so this can only
  // narrow the already-fetched list by item.source — never query the API.
  const filtered = useMemo(() => {
    if (!ticker) return items;
    const t = ticker.toUpperCase();
    return items.filter((i) => i.source.toUpperCase() === t);
  }, [items, ticker]);

  const anyTranslated = useMemo(() => filtered.some(isTranslated), [filtered]);
  const age = relativeAge(generatedAt);

  async function toggleExpand(item: NewsItem) {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    setClickError(null);
    if (clickResults[item.id]) return; // already fetched
    setClickLoading(item.id);
    try {
      const res = await fetch("/api/ai/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ source: item.source, title: item.title, koreanTitle: item.koreanTitle }),
      });
      if (!res.ok) {
        setClickError("분석을 불러오지 못했습니다.");
        return;
      }
      const body = (await res.json()) as ClickResult;
      setClickResults((prev) => ({ ...prev, [item.id]: body }));
    } catch {
      setClickError("분석을 불러오지 못했습니다.");
    } finally {
      setClickLoading(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header / honest data provenance */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2 py-1 text-[10px]">
        {ticker && (
          <span className="rounded-sm bg-primary/15 px-1 py-0.5 font-semibold text-primary">
            {ticker.toUpperCase()}
          </span>
        )}
        {/* Backend provides no sentiment/importance — state it once, honestly. */}
        <span className="text-muted-foreground">감성·중요도: 백엔드 미제공</span>
        <span className="ml-auto flex items-center gap-1.5">
          {(cached || age) && <DataBadge kind="delayed" label={age ? `${age}` : "지연"} />}
          {status === "ok" && !anyTranslated && (
            <DataBadge kind="no_data" label="번역 미제공" />
          )}
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase transition-colors",
              "text-muted-foreground hover:text-foreground disabled:opacity-40"
            )}
            aria-label="새로고침"
          >
            <RefreshCw size={10} strokeWidth={2} className={cn(refreshing && "animate-spin")} />
            새로고침
          </button>
        </span>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === "loading" && <PanelEmpty kind="loading" />}
        {status === "error" && (
          <PanelEmpty kind="error" message="뉴스를 불러오지 못했습니다." />
        )}
        {status === "no_data" && (
          <PanelEmpty
            kind="no_data"
            message={
              ticker
                ? `${ticker.toUpperCase()} 관련 뉴스가 없습니다.`
                : "표시할 뉴스가 없습니다. 보유 종목이 있으면 자동으로 수집됩니다."
            }
          />
        )}
        {/* ok but the ticker filter emptied the list */}
        {status === "ok" && filtered.length === 0 && (
          <PanelEmpty
            kind="no_data"
            message={`${ticker?.toUpperCase() ?? ""} 관련 뉴스가 없습니다.`}
          />
        )}
        {status === "ok" && filtered.length > 0 && (
          <ul className="divide-y divide-border/60">
            {filtered.map((item) => {
              const expanded = expandedId === item.id;
              const translated = isTranslated(item);
              const result = clickResults[item.id];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void toggleExpand(item)}
                    className={cn(
                      "flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors hover:bg-secondary/50",
                      expanded && "bg-secondary/40"
                    )}
                  >
                    <span className="mt-px w-12 shrink-0 truncate text-[10px] font-bold text-accent">
                      [{item.source}]
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      {/* Korean translation (falls back to original title) */}
                      <span
                        className={cn(
                          "block text-[11px] font-medium leading-snug",
                          expanded ? "text-accent" : "text-foreground"
                        )}
                      >
                        {item.koreanTitle.trim() || item.title}
                      </span>
                      {/* Original English title — shown when a translation exists */}
                      {translated && item.koreanTitle.trim() !== item.title.trim() && (
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {item.title}
                        </span>
                      )}
                      {/* Korean 1-line investor takeaway */}
                      {item.description.trim() && (
                        <span className="block text-[10px] leading-snug text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                      {/* Related topics + freshness */}
                      <span className="flex flex-wrap items-center gap-1 pt-0.5">
                        {item.topics.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="rounded-sm border border-border px-1 text-[9px] text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                        {relativeAge(item.publishedAt) && (
                          <span className="text-[9px] text-muted-foreground">
                            {relativeAge(item.publishedAt)}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="mt-px shrink-0 text-muted-foreground">
                      {expanded ? (
                        <ChevronDown size={12} strokeWidth={2} />
                      ) : (
                        <ChevronRight size={12} strokeWidth={2} />
                      )}
                    </span>
                  </button>

                  {/* Expanded: AI analysis + related (POST /api/ai/news) */}
                  {expanded && (
                    <div className="space-y-2 border-t border-border/60 bg-card/60 px-2 py-2">
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-accent"
                        >
                          원문 보기 <ExternalLink size={9} strokeWidth={2} />
                        </a>
                      )}

                      <div>
                        <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          AI 분석
                        </div>
                        {clickLoading === item.id && (
                          <div className="text-[10px] text-muted-foreground">분석 중…</div>
                        )}
                        {clickLoading !== item.id && clickError && !result && (
                          <div className="text-[10px] text-destructive">{clickError}</div>
                        )}
                        {result && result.analysis.trim() ? (
                          <div className="whitespace-pre-wrap text-[10px] leading-relaxed text-foreground">
                            {result.analysis}
                          </div>
                        ) : (
                          clickLoading !== item.id &&
                          result &&
                          !result.analysis.trim() && (
                            <div className="text-[10px] text-muted-foreground">
                              AI 분석 미제공.
                            </div>
                          )
                        )}
                      </div>

                      {result && result.related.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                            관련 뉴스
                          </div>
                          {result.related.slice(0, 6).map((r) => (
                            <a
                              key={r.id}
                              href={r.link || undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="block text-[10px] leading-snug text-muted-foreground hover:text-foreground"
                            >
                              <span className="font-bold text-accent">[{r.source}]</span>{" "}
                              {r.koreanTitle.trim() || r.title}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
