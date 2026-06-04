"use client";

import { useEffect, useState } from "react";
import { PanelEmpty, DataBadge } from "../panel-state";
import { fmtPrice } from "../format";
import { cn } from "@/lib/utils";

interface BrokerStatus {
  id: string;
  name: string;
  implemented: boolean;
  configured: boolean;
  requiredEnv: string[];
  note?: string;
}
interface BrokerPosition {
  symbol: string;
  quantity: number;
  avgPrice: number | null;
  marketValue: number | null;
  currency: string;
}

function PositionList({ brokerId }: { brokerId: string }) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; positions: BrokerPosition[] }
    | { kind: "empty" }
    | { kind: "error"; msg: string }
  >({ kind: "idle" });

  const load = async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/brokers/${brokerId}/positions`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "error", msg: body?.error ?? `HTTP ${res.status}` });
        return;
      }
      const positions = (body.positions ?? []) as BrokerPosition[];
      setState(positions.length ? { kind: "ok", positions } : { kind: "empty" });
    } catch (e) {
      setState({ kind: "error", msg: e instanceof Error ? e.message : "조회 실패" });
    }
  };

  return (
    <div className="mt-1">
      <button
        onClick={load}
        className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] transition-colors hover:border-primary/50 hover:text-foreground"
      >
        포지션 불러오기
      </button>
      {state.kind === "loading" && <div className="py-2 text-[10px] text-muted-foreground">불러오는 중…</div>}
      {state.kind === "error" && <div className="py-1 text-[10px] text-destructive">오류: {state.msg}</div>}
      {state.kind === "empty" && <div className="py-1 text-[10px] text-muted-foreground">보유 포지션 없음</div>}
      {state.kind === "ok" && (
        <table className="mt-1 w-full border-collapse text-[10px]">
          <thead>
            <tr className="uppercase text-muted-foreground">
              <th className="px-1 py-0.5 text-left">종목</th>
              <th className="px-1 py-0.5 text-right">수량</th>
              <th className="px-1 py-0.5 text-right">평단</th>
              <th className="px-1 py-0.5 text-right">평가액</th>
            </tr>
          </thead>
          <tbody>
            {state.positions.map((p) => (
              <tr key={p.symbol} className="border-t border-border/40">
                <td className="px-1 py-0.5 font-bold text-foreground">{p.symbol}</td>
                <td className="px-1 py-0.5 text-right tabular-nums">{p.quantity}</td>
                <td className="px-1 py-0.5 text-right tabular-nums">{p.avgPrice != null ? fmtPrice(p.avgPrice) : "—"}</td>
                <td className="px-1 py-0.5 text-right tabular-nums">{p.marketValue != null ? fmtPrice(p.marketValue) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function BrokerPanel() {
  const [brokers, setBrokers] = useState<BrokerStatus[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    fetch("/api/brokers/status", { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()).brokers as BrokerStatus[]) : null))
      .then((b) => {
        if (!alive) return;
        if (b) {
          setBrokers(b);
          setStatus("ok");
        } else setStatus("error");
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, []);

  if (status === "loading") return <PanelEmpty kind="loading" />;
  if (status === "error" || !brokers) return <PanelEmpty kind="error" message="브로커 상태 로드 실패" />;

  return (
    <div className="flex flex-col gap-2 p-1">
      <div className="text-[10px] leading-relaxed text-muted-foreground">
        브로커 API는 서버 환경변수로만 키를 주입하며(클라이언트 전송 금지) 읽기 전용입니다.
        키가 없으면 가짜 포지션을 만들지 않고 &quot;연동 필요&quot;로 표시합니다. 수동 입력/수정은 기존 거래 화면을 사용하세요.
      </div>
      {brokers.map((b) => {
        const state: "ready" | "needs_keys" | "not_impl" = !b.implemented
          ? "not_impl"
          : b.configured
            ? "ready"
            : "needs_keys";
        return (
          <div key={b.id} className="rounded-sm border border-border bg-card p-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-foreground">{b.name}</span>
              {state === "ready" && <DataBadge kind="delayed" label="연동됨(읽기전용)" />}
              {state === "needs_keys" && <DataBadge kind="api_required" label="연동 필요" />}
              {state === "not_impl" && <DataBadge kind="no_data" label="미구현" />}
            </div>
            {b.note && <div className="mt-0.5 text-[10px] text-muted-foreground">{b.note}</div>}
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              필요 ENV: <span className={cn(state === "needs_keys" && "text-accent")}>{b.requiredEnv.join(", ")}</span>
            </div>
            {state === "ready" && <PositionList brokerId={b.id} />}
          </div>
        );
      })}
    </div>
  );
}
