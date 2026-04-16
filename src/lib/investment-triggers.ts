export type UpperTriggerStatus = "NORMAL" | "WATCH" | "TRIGGER";

export type NdxTier = 0 | 1 | 2 | 3;

export function getUpperTriggerStatus(
  qldPct: number,
  targetPct: number,
  upperTriggerPct: number,
): UpperTriggerStatus {
  if (qldPct >= upperTriggerPct) return "TRIGGER";
  if (qldPct >= targetPct) return "WATCH";
  return "NORMAL";
}

export function getNdxTier(drawdownPct: number): NdxTier {
  if (drawdownPct <= -30) return 3;
  if (drawdownPct <= -20) return 2;
  if (drawdownPct <= -10) return 1;
  return 0;
}

export function getNdxTierAction(tier: NdxTier): string {
  switch (tier) {
    case 0:
      return "Method B 적용 (정상)";
    case 1:
      return "기여금 100% QLD 배분";
    case 2:
      return "기여금 100% QLD + SGOV 잔액 50% QLD 매수";
    case 3:
      return "기여금 전액 + SGOV 전액 QLD 매수";
  }
}

export function getSgovStatus(
  sgovPct: number,
  targetMaxPct: number,
  ndxTier: NdxTier,
  qldPct: number,
  qldTargetPct: number,
): { current: number; target: number; needsRecharge: boolean } {
  const needsRecharge =
    ndxTier === 0 && qldPct <= qldTargetPct && sgovPct < targetMaxPct;
  return {
    current: sgovPct,
    target: targetMaxPct,
    needsRecharge,
  };
}

export function getOverrideTargets(
  tier: NdxTier,
  baseTargets: Record<string, number>,
): Record<string, number> {
  if (tier === 0) return baseTargets;
  if (!("QLD" in baseTargets)) return baseTargets;

  const result: Record<string, number> = {};
  for (const key of Object.keys(baseTargets)) {
    result[key] = key === "QLD" ? 100 : 0;
  }
  return result;
}
