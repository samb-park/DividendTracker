"use client";

import { useEffect, useState } from "react";
import {
  getUpperTriggerStatus,
  getNdxTier,
  getNdxTierAction,
  getSgovStatus,
  type NdxTier,
  type UpperTriggerStatus,
} from "@/lib/investment-triggers";

interface StrategyStatusPanelProps {
  qldPct: number;
  sgovPct: number;
  upperTriggerPct?: number;
  qldTargetPct?: number;
  sgovTargetMaxPct?: number;
}

interface NdxData {
  price: number;
  high52w: number;
  drawdownPct: number;
  tier: NdxTier;
}

const tierBadgeColors: Record<NdxTier, string> = {
  0: "bg-green-500/20 text-green-400 border-green-500/40",
  1: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  2: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  3: "bg-red-500/20 text-red-400 border-red-500/40",
};

const statusBadgeColors: Record<UpperTriggerStatus, string> = {
  NORMAL: "bg-green-500/20 text-green-400 border-green-500/40",
  WATCH: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  TRIGGER: "bg-red-500/20 text-red-400 border-red-500/40",
};

export function StrategyStatusPanel({
  qldPct,
  sgovPct,
  upperTriggerPct = 33,
  qldTargetPct = 30,
  sgovTargetMaxPct = 5,
}: StrategyStatusPanelProps) {
  const [ndxData, setNdxData] = useState<NdxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/market/ndx")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: NdxData) => {
        if (!cancelled) {
          setNdxData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tier: NdxTier = ndxData?.tier ?? 0;
  const drawdownPct = ndxData?.drawdownPct ?? 0;
  const tierAction = getNdxTierAction(tier);

  const triggerStatus = getUpperTriggerStatus(qldPct, qldTargetPct, upperTriggerPct);
  const sgovStatus = getSgovStatus(sgovPct, sgovTargetMaxPct, tier, qldPct, qldTargetPct);

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {/* Card 1: NDX Drawdown */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-[10px] text-muted-foreground tracking-wide mb-2">NDX DRAWDOWN</div>
        {loading ? (
          <div className="space-y-2">
            <div className="h-6 bg-border/40 rounded animate-pulse w-20" />
            <div className="h-3 bg-border/40 rounded animate-pulse w-16" />
          </div>
        ) : error ? (
          <div className="text-xs text-muted-foreground">데이터 없음</div>
        ) : (
          <>
            <div
              className={`text-lg font-bold tabular-nums ${
                tier > 0 ? "text-red-400" : ""
              }`}
            >
              {drawdownPct.toFixed(1)}%
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-block px-1.5 py-0.5 text-[9px] tracking-wide border rounded ${tierBadgeColors[tier]}`}
              >
                TIER {tier}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-2 leading-tight">
              {tierAction}
            </div>
          </>
        )}
      </div>

      {/* Card 2: QLD 상단 트리거 */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-[10px] text-muted-foreground tracking-wide mb-2">QLD 상단 트리거</div>
        <div className="text-lg font-bold tabular-nums">{qldPct.toFixed(1)}%</div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={`inline-block px-1.5 py-0.5 text-[9px] tracking-wide border rounded ${statusBadgeColors[triggerStatus]}`}
          >
            {triggerStatus}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground mt-2 leading-tight">
          {triggerStatus === "TRIGGER"
            ? "매도 후 30% 복귀 권장"
            : triggerStatus === "WATCH"
            ? `트리거까지 ${(upperTriggerPct - qldPct).toFixed(1)}%`
            : `트리거까지 ${(upperTriggerPct - qldPct).toFixed(1)}%`}
        </div>
      </div>

      {/* Card 3: SGOV 버퍼 */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-[10px] text-muted-foreground tracking-wide mb-2">SGOV 버퍼</div>
        <div
          className={`text-lg font-bold tabular-nums ${
            sgovStatus.needsRecharge ? "text-yellow-400" : "text-green-400"
          }`}
        >
          {sgovPct.toFixed(1)}% / {sgovTargetMaxPct}%
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={`inline-block px-1.5 py-0.5 text-[9px] tracking-wide border rounded ${
              sgovStatus.needsRecharge
                ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                : "bg-green-500/20 text-green-400 border-green-500/40"
            }`}
          >
            {sgovStatus.needsRecharge ? "재충전" : "정상"}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground mt-2 leading-tight">
          {sgovStatus.needsRecharge ? "재충전 권장: 기여금 20%" : "정상"}
        </div>
      </div>
    </div>
  );
}
