"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, User, Bot, AlertTriangle } from "lucide-react";
import { PanelEmpty } from "../panel-state";
import { cn } from "@/lib/utils";

/**
 * AI 어시스턴트 패널 — 한국어 채팅형 UI.
 *
 * 연결 백엔드:
 *   POST /api/ai/chat      → { reply: string }            (성공)
 *   POST /api/ai/insights  → { result: string }           ("AI 인사이트" 버튼)
 *
 * 정직 처리 (가짜 데이터 절대 금지):
 *   - AI 텍스트는 오직 실제 /api/ai/chat · /api/ai/insights 응답만 표시한다.
 *     로컬에서 그럴듯한 답변을 지어내지 않는다.
 *   - 제공자 미설정은 resolveAiProviderConfig()가 throw → 라우트에서 unhandled 500.
 *     업스트림 일시 오류는 200 + { error } 또는 5xx. 두 원인을 라우트에서
 *     구분할 수 없으므로, 첫 교신 성공 전 실패(cold start)는 api_required 빈 상태로,
 *     메시지에 "제공자 미설정(키 없으면 로컬 규칙 기반) 또는 일시적 오류" 둘 다 정직하게 표기.
 *   - 대화 도중(이미 실제 응답을 받은 뒤) 실패는 기존 대화를 지우지 않고 인라인 오류로만 표시.
 *   - 429(throttle)는 별도 상태로 라우트가 내려준 한국어 안내(body.error)를 그대로 노출.
 *
 * 주의: ticker 는 UI 전용(빠른 프롬프트 / placeholder)이며 라우트로 전송하지 않는다.
 * 백엔드는 단일 사용자 모드 포트폴리오 컨텍스트 전체를 자체적으로 주입한다.
 */

type Role = "user" | "assistant";

interface ChatMessage {
  id: number;
  role: Role;
  content: string;
  /** 인사이트 응답을 라벨링하기 위한 표식 (UI 전용). */
  source?: "insights";
}

interface SendOutcome {
  kind: "ok" | "throttled" | "failed";
  /** ok: 표시할 텍스트, throttled/failed: 라우트가 내려준 정직한 오류 문구. */
  text: string;
}

let messageSeq = 0;
const nextId = () => ++messageSeq;

/** /api/ai/chat 또는 /api/ai/insights 응답을 정직한 결과로 정규화. */
function normalizeAiResponse(
  res: Response,
  body: { reply?: unknown; result?: unknown; error?: unknown },
): SendOutcome {
  const reply = typeof body.reply === "string" ? body.reply : null;
  const result = typeof body.result === "string" ? body.result : null;
  const text = reply ?? result;

  // 성공: 라우트가 실제 AI 텍스트를 내려준 경우에만.
  if (res.ok && text && text.trim().length > 0) {
    return { kind: "ok", text: text.trim() };
  }

  // 요청 과다(throttle): 라우트의 한국어 Retry 안내를 그대로 노출.
  if (res.status === 429) {
    return {
      kind: "throttled",
      text:
        typeof body.error === "string"
          ? body.error
          : "AI 요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
    };
  }

  // 그 외 모든 실패(제공자 미설정 500, 업스트림 200+error, 네트워크 오류 등).
  return {
    kind: "failed",
    text:
      typeof body.error === "string" && body.error.trim().length > 0
        ? body.error
        : "AI 응답을 생성할 수 없습니다.",
  };
}

async function postJson(
  url: string,
  payload: Record<string, unknown>,
): Promise<SendOutcome> {
  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let body: { reply?: unknown; result?: unknown; error?: unknown } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // JSON 파싱 불가 → 비정상 응답으로 간주(아래 normalize가 failed 처리).
    }
    return normalizeAiResponse(res, body);
  } catch {
    return { kind: "failed", text: "네트워크 오류로 AI에 연결하지 못했습니다." };
  }
}

const COLD_START_MESSAGE =
  "AI 제공자 설정이 필요합니다. (제공자 미설정 — 키가 없으면 로컬 규칙 기반 게이트웨이 필요) 또는 일시적 업스트림 오류일 수 있습니다. AI_PROVIDER / HERMES_API_KEY · OPENROUTER_API_KEY · OPENAI_API_KEY 환경변수를 확인하세요.";

export function AiAssistantPanel({ ticker }: { ticker: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  /** 인라인 오류(대화 도중 실패 / throttle). 다음 성공 시 해제. */
  const [inlineError, setInlineError] = useState<string | null>(null);
  /** 단 한 번도 실제 응답을 못 받은 cold start 실패 → 빈 상태(api_required). */
  const [coldStartFailed, setColdStartFailed] = useState(false);
  /** cold start 실패 시 사용자가 잃지 않도록 보관한 직전 질문(재시도 시 입력창 복원). */
  const [lastFailedInput, setLastFailedInput] = useState<string | null>(null);

  const hasRealReply = messages.some((m) => m.role === "assistant");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  async function run(opts: {
    /** 대화창에 추가할 사용자 메시지(없으면 인사이트 버튼). */
    userText?: string;
    request: () => Promise<SendOutcome>;
    /** 응답을 인사이트로 라벨링할지. */
    asInsights?: boolean;
  }) {
    if (pending) return;
    setInlineError(null);

    // 이번 교신 직전까지 실제 응답이 있었는지(실패 시 cold start 판정에 사용).
    const hadRealReplyBefore = hasRealReply;

    if (opts.userText) {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "user", content: opts.userText! },
      ]);
    }
    setPending(true);

    const outcome = await opts.request();
    setPending(false);

    if (outcome.kind === "ok") {
      setColdStartFailed(false);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: outcome.text,
          ...(opts.asInsights ? { source: "insights" as const } : {}),
        },
      ]);
      return;
    }

    // 실패/throttle: 실제 AI 텍스트를 지어내지 않는다.
    if (outcome.kind === "throttled") {
      // throttle 은 제공자 가용 여부와 무관 → 항상 인라인으로만 표시.
      setInlineError(outcome.text);
      return;
    }

    // outcome.kind === "failed"
    if (hadRealReplyBefore) {
      // 대화 도중 실패: 기존 대화/입력 유지, 인라인 오류만.
      setInlineError(outcome.text);
    } else {
      // 한 번도 성공한 적 없음 → 정직한 빈 상태(api_required).
      // 이번에 추가했던 사용자 메시지는 실제 응답을 받지 못했으므로 제거한다.
      // (응답 없는 메시지를 남겨두면 대화가 성립한 것처럼 보임 → 정직성 위반)
      if (opts.userText) {
        setMessages((prev) => prev.filter((m) => !(m.role === "user" && m.content === opts.userText)));
      }
      setLastFailedInput(opts.userText ?? null);
      setColdStartFailed(true);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    void run({
      userText: text,
      request: () => postJson("/api/ai/chat", { message: text, history }),
    });
  }

  function handleInsights() {
    void run({
      asInsights: true,
      request: () => postJson("/api/ai/insights", {}),
    });
  }

  function handleQuickPrompt(prompt: string) {
    if (pending) return;
    setInput(prompt);
  }

  // Cold start 실패: 한 번도 실제 응답을 못 받았을 때 전체 빈 상태(api_required).
  // (응답 없는 사용자 메시지는 run()에서 제거되므로 여기서 messages 길이는 보지 않는다.)
  if (coldStartFailed && !hasRealReply) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PanelEmpty kind="api_required" message={COLD_START_MESSAGE} />
        <div className="flex-shrink-0 border-t border-border p-2">
          <button
            onClick={() => {
              setColdStartFailed(false);
              if (lastFailedInput) {
                setInput(lastFailedInput);
                setLastFailedInput(null);
              }
            }}
            className="w-full rounded-sm border border-border bg-secondary/40 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 헤더: 데이터 출처 배지 + 인사이트 버튼 */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-2 py-1">
        <span className="flex items-center gap-1 text-[11px] font-bold text-foreground">
          <Sparkles size={12} strokeWidth={2} className="text-accent" />
          AI 어시스턴트
        </span>
        {/* 제공자(hermes/openrouter/openai/github)는 서버 env로 결정되며 클라이언트에서
            확인 불가 → 특정 제공자명을 단정하지 않고 중립 라벨만 표기(출처 날조 방지). */}
        <span className="rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          AI 게이트웨이
        </span>
        <button
          onClick={handleInsights}
          disabled={pending}
          className={cn(
            "ml-auto flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
            pending
              ? "cursor-not-allowed text-muted-foreground/50"
              : "text-accent hover:bg-accent/10",
          )}
        >
          <Sparkles size={10} strokeWidth={2} />
          AI 인사이트
        </button>
      </div>

      {/* 대화 목록 */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {messages.length === 0 && !pending && (
          <div className="flex flex-col gap-2 px-1 py-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              종목·시장·포트폴리오에 대해 한국어로 질문하세요. 답변은 룰북
              v4.5.1과 실제 포트폴리오 데이터를 기반으로 생성됩니다.
            </p>
            <div className="flex flex-wrap gap-1">
              {[
                `${ticker} 분석 의견은?`,
                "이번 주 매수 계획 알려줘",
                "내 포트폴리오 비중 점검해줘",
                "SGOV 비중이 적절해?",
              ].map((p) => (
                <button
                  key={p}
                  onClick={() => handleQuickPrompt(p)}
                  className="rounded-sm border border-border bg-secondary/40 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex gap-1.5",
              m.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {m.role === "assistant" && (
              <Bot
                size={14}
                strokeWidth={1.75}
                className="mt-0.5 flex-shrink-0 text-accent"
              />
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-sm px-2 py-1.5 text-[11px] leading-relaxed",
                m.role === "user"
                  ? "bg-primary/15 text-foreground"
                  : "border border-border bg-secondary/30 text-foreground",
              )}
            >
              {m.source === "insights" && (
                <div className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-accent">
                  <Sparkles size={9} strokeWidth={2} />
                  AI 인사이트
                </div>
              )}
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
            </div>
            {m.role === "user" && (
              <User
                size={14}
                strokeWidth={1.75}
                className="mt-0.5 flex-shrink-0 text-muted-foreground"
              />
            )}
          </div>
        ))}

        {pending && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Bot size={14} strokeWidth={1.75} className="text-accent" />
            <span className="flex gap-0.5">
              <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground" />
            </span>
            <span>AI가 응답을 생성하는 중…</span>
          </div>
        )}
      </div>

      {/* 인라인 오류(대화 도중 실패 / throttle) — 실제 라우트 문구만 표시 */}
      {inlineError && (
        <div className="flex flex-shrink-0 items-start gap-1.5 border-t border-border bg-destructive/10 px-2 py-1.5">
          <AlertTriangle
            size={12}
            strokeWidth={2}
            className="mt-0.5 flex-shrink-0 text-destructive"
          />
          <span className="text-[10px] leading-relaxed text-destructive">
            {inlineError}
          </span>
        </div>
      )}

      {/* 입력창 */}
      <div className="flex flex-shrink-0 items-center gap-1.5 border-t border-border p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={pending}
          placeholder="질문 입력 (예: 내 포트폴리오 점검해줘)"
          className="min-w-0 flex-1 rounded-sm border border-border bg-input px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={pending || input.trim().length === 0}
          className={cn(
            "flex flex-shrink-0 items-center gap-1 rounded-sm px-2.5 py-1.5 text-[11px] font-bold transition-opacity",
            pending || input.trim().length === 0
              ? "cursor-not-allowed bg-secondary text-muted-foreground"
              : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          <Send size={12} strokeWidth={2} />
          전송
        </button>
      </div>
    </div>
  );
}
