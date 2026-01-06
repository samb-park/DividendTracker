export interface TargetAllocation {
  symbol: string;
  targetWeight: number;
  currency: 'CAD' | 'USD';
}

export interface PortfolioSettings {
  weeklyAmount: number;
  fxFeePercent: number;
  targets: TargetAllocation[];
}

export interface Position {
  symbol: string;
  symbolMapped: string;
  marketValue: number;
  currency: string;
}

export interface AllocationResult {
  symbol: string;
  targetWeight: number;
  currentWeight: number;
  gap: number; // targetWeight - currentWeight
  currentValueCad: number;
  targetValueCad: number;
  needed: number;
  weeklyBuyCad: number;
  fxFee: number;
  weeklyBuyActual: number; // CAD for CAD symbols, USD for USD symbols
  currency: 'CAD' | 'USD';
}

export interface AllocationSummary {
  allocations: AllocationResult[];
  totalFxFee: number;
  totalWeeklyAmount: number;
  totalMarketValueCad: number;
}

/**
 * Calculate weekly investment allocation based on targets
 */
export function calculateWeeklyAllocation(
  positions: Position[],
  settings: PortfolioSettings,
  fxRate: number, // USD/CAD rate (e.g., 1.38)
  cashBalanceCad: number = 0
): AllocationSummary {
  const { weeklyAmount, fxFeePercent, targets } = settings;

  // 1. Calculate current total portfolio value in CAD
  let totalMarketValueCad = positions.reduce((sum, pos) => {
    if (pos.currency === 'USD') {
      return sum + pos.marketValue * fxRate;
    }
    return sum + pos.marketValue;
  }, 0);

  // Add cash balance if CASH is in targets
  const hasCashTarget = targets.some((t) => t.symbol === 'CASH');
  if (hasCashTarget) {
    totalMarketValueCad += cashBalanceCad;
  }

  // 2. Calculate new total value after investment
  const newTotalValue = totalMarketValueCad + weeklyAmount;

  // 3. Calculate allocation for each target
  const allocations: AllocationResult[] = targets.map((target) => {
    // Find ALL matching positions (same symbol across multiple accounts)
    const matchingPositions = positions.filter((p) => {
      const normalizedSymbol = p.symbolMapped.replace('.TO', '');
      return (
        normalizedSymbol === target.symbol ||
        p.symbolMapped === target.symbol ||
        p.symbol === target.symbol
      );
    });

    // Calculate current value in CAD (sum all matching positions)
    let currentValueCad = 0;
    if (target.symbol === 'CASH') {
      currentValueCad = cashBalanceCad;
    } else {
      for (const pos of matchingPositions) {
        currentValueCad +=
          pos.currency === 'USD' ? pos.marketValue * fxRate : pos.marketValue;
      }
    }

    // Calculate weights and gap
    const currentWeight =
      totalMarketValueCad > 0
        ? (currentValueCad / totalMarketValueCad) * 100
        : 0;
    const gap = target.targetWeight - currentWeight;

    // Calculate target value after investment
    const targetValueCad = newTotalValue * (target.targetWeight / 100);
    const needed = Math.max(0, targetValueCad - currentValueCad);

    return {
      symbol: target.symbol,
      targetWeight: target.targetWeight,
      currentWeight,
      gap,
      currentValueCad,
      targetValueCad,
      needed,
      weeklyBuyCad: 0,
      fxFee: 0,
      weeklyBuyActual: 0,
      currency: target.currency,
    };
  });

  // 4. Distribute weekly amount: base allocation + bonus for underweight
  // Base: proportional to target weight (everyone gets their fair share)
  // Bonus: extra allocation for underweight positions
  // Note: gap > 0 means underweight (target > current), gap < 0 means overweight

  const totalTargetWeight = allocations.reduce(
    (sum, a) => sum + a.targetWeight,
    0
  );
  const underweightAllocations = allocations.filter((a) => a.gap > 0); // gap > 0 = underweight
  const totalGapDeficit = underweightAllocations.reduce(
    (sum, a) => sum + a.gap, // positive gaps only
    0
  );

  // Split: 50% base allocation, 50% gap-based bonus (adjustable)
  const baseRatio = totalGapDeficit > 0 ? 0.5 : 1.0; // If no underweight, 100% base
  const bonusRatio = 1 - baseRatio;

  let totalFxFee = 0;

  allocations.forEach((allocation) => {
    // Base allocation: proportional to target weight
    const baseAmount =
      totalTargetWeight > 0
        ? (allocation.targetWeight / totalTargetWeight) *
          weeklyAmount *
          baseRatio
        : 0;

    // Bonus allocation: proportional to how underweight (only for underweight positions)
    let bonusAmount = 0;
    if (allocation.gap > 0 && totalGapDeficit > 0) {
      // gap > 0 = underweight
      bonusAmount =
        (allocation.gap / totalGapDeficit) * weeklyAmount * bonusRatio;
    }

    const rawAmount = baseAmount + bonusAmount;
    allocation.weeklyBuyCad = rawAmount;

    // Apply FX fee for USD symbols
    if (allocation.currency === 'USD' && allocation.symbol !== 'CASH') {
      const fxFee = rawAmount * (fxFeePercent / 100);
      allocation.fxFee = fxFee;
      totalFxFee += fxFee;
      // After FX fee, convert to USD
      allocation.weeklyBuyActual = (rawAmount - fxFee) / fxRate;
    } else {
      allocation.weeklyBuyActual = rawAmount;
    }
  });

  return {
    allocations,
    totalFxFee,
    totalWeeklyAmount: weeklyAmount,
    totalMarketValueCad,
  };
}
