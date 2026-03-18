---
name: investment-logic
description: Verify and implement dividend growth rate, CAGR, MDD, contribution room (TFSA/RRSP/FHSA) calculation logic. Activates when working on financial calculations, investment metrics, or Canadian tax-advantaged account rules.
---

# Investment Logic Skill

Reference implementations and validation for financial calculations in DividendTracker.

## When This Skill Activates

- Keywords: "CAGR", "dividend growth", "MDD", "TFSA", "RRSP", "FHSA", "yield", "contribution room"
- Tasks: Implementing or reviewing any financial calculation
- Validation: Checking if a calculation produces expected results

## Core Financial Calculations

### Dividend Growth Rate (CAGR of Dividends)

```typescript
/**
 * Compound Annual Growth Rate of dividend payments
 * @param startValue - Dividend per share in start period
 * @param endValue - Dividend per share in end period
 * @param years - Number of years between periods
 */
export function dividendCAGR(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || years <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

// Example: $1.00 DPS in 2020 → $1.46 DPS in 2025 (5 years)
// CAGR = (1.46/1.00)^(1/5) - 1 = 7.86%
```

### Portfolio CAGR

```typescript
/**
 * Total portfolio compound annual growth rate
 * @param startValue - Portfolio value at start date
 * @param endValue - Portfolio value at end date
 * @param startDate - Start date
 * @param endDate - End date
 */
export function portfolioCAGR(
  startValue: number,
  endValue: number,
  startDate: Date,
  endDate: Date
): number {
  const years = (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (startValue <= 0 || years <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}
```

### Maximum Drawdown (MDD)

```typescript
/**
 * Largest peak-to-trough decline in portfolio value
 * @param values - Array of portfolio values in chronological order
 * @returns MDD as a negative percentage (e.g., -23.5 means 23.5% drawdown)
 */
export function maxDrawdown(values: number[]): number {
  if (values.length < 2) return 0;

  let maxDD = 0;
  let peak = values[0];

  for (const value of values) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = (value - peak) / peak;
    if (drawdown < maxDD) {
      maxDD = drawdown;
    }
  }

  return maxDD * 100; // Returns negative value, e.g., -23.5
}
```

### Yield on Cost vs Current Yield

```typescript
/**
 * Yield on Cost: annual dividend / original cost basis
 * Better measure for long-term holders
 */
export function yieldOnCost(annualDividendPerShare: number, costBasisPerShare: number): number {
  if (costBasisPerShare <= 0) return 0;
  return (annualDividendPerShare / costBasisPerShare) * 100;
}

/**
 * Current Yield: annual dividend / current market price
 */
export function currentYield(annualDividendPerShare: number, currentPrice: number): number {
  if (currentPrice <= 0) return 0;
  return (annualDividendPerShare / currentPrice) * 100;
}
```

## Canadian Account Contribution Rules

### TFSA (Tax-Free Savings Account)

```typescript
// Contribution limits by year (cumulative if never contributed)
const TFSA_ANNUAL_LIMITS: Record<number, number> = {
  2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000, 2013: 5500,
  2014: 5500, 2015: 10000, 2016: 5500, 2017: 5500, 2018: 5500,
  2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000, 2023: 6500,
  2024: 7000, 2025: 7000, 2026: 7000, // 2026 indexed, update when announced
};

/**
 * Total TFSA room for a Canadian resident since eligibility year
 * Room is restored when you withdraw (next calendar year)
 */
export function calculateTFSARoom(
  eligibleSinceYear: number,
  currentYear: number,
  totalContributed: number,
  totalWithdrawnPriorYear: number
): number {
  let totalRoom = 0;
  for (let year = eligibleSinceYear; year <= currentYear; year++) {
    totalRoom += TFSA_ANNUAL_LIMITS[year] ?? 7000; // fallback to current limit
  }
  return totalRoom - totalContributed + totalWithdrawnPriorYear;
}
```

### RRSP (Registered Retirement Savings Plan)

```typescript
/**
 * RRSP contribution room = 18% of prior year earned income, up to annual limit
 * 2025 limit: $32,490 | 2026: indexed
 */
const RRSP_MAX: Record<number, number> = {
  2020: 27230, 2021: 27830, 2022: 29210, 2023: 30780,
  2024: 31560, 2025: 32490, 2026: 33810,
};

export function calculateRRSPRoom(
  priorYearIncome: number,
  contributionYear: number,
  unusedRoomCarryforward: number,
  totalContributed: number
): number {
  const annualRoom = Math.min(priorYearIncome * 0.18, RRSP_MAX[contributionYear] ?? 33810);
  return annualRoom + unusedRoomCarryforward - totalContributed;
}
```

### FHSA (First Home Savings Account)

```typescript
/**
 * FHSA — introduced 2023
 * Annual limit: $8,000 | Lifetime limit: $40,000
 * Unused room carries forward (max $8,000 carryforward)
 */
export function calculateFHSARoom(
  yearsOpen: number,
  totalContributed: number
): { annualRoom: number; lifetimeRemaining: number } {
  const ANNUAL_LIMIT = 8000;
  const LIFETIME_LIMIT = 40000;
  const CARRYFORWARD_MAX = 8000;

  const accumulatedRoom = Math.min(yearsOpen * ANNUAL_LIMIT, LIFETIME_LIMIT);
  const usedRoom = Math.min(totalContributed, LIFETIME_LIMIT);
  const remainingRoom = accumulatedRoom - usedRoom;

  return {
    annualRoom: Math.min(remainingRoom, ANNUAL_LIMIT + CARRYFORWARD_MAX),
    lifetimeRemaining: LIFETIME_LIMIT - usedRoom,
  };
}
```

## Dividend Income Projection

```typescript
/**
 * Project future annual dividend income assuming dividend growth
 * @param currentAnnualIncome - Current annual dividend income
 * @param growthRate - Annual dividend growth rate (e.g., 0.05 for 5%)
 * @param years - Projection horizon
 */
export function projectDividendIncome(
  currentAnnualIncome: number,
  growthRate: number,
  years: number
): number[] {
  return Array.from({ length: years }, (_, i) =>
    currentAnnualIncome * Math.pow(1 + growthRate, i + 1)
  );
}

// DRIP compounding (reinvested dividends buy more shares)
export function projectWithDRIP(
  shares: number,
  pricePerShare: number,
  annualDividendPerShare: number,
  growthRate: number,
  years: number
): { year: number; shares: number; annualIncome: number }[] {
  let currentShares = shares;
  let currentDPS = annualDividendPerShare;

  return Array.from({ length: years }, (_, i) => {
    currentDPS *= 1 + growthRate;
    const annualIncome = currentShares * currentDPS;
    const newShares = annualIncome / pricePerShare; // reinvest at same price (simplified)
    currentShares += newShares;

    return { year: i + 1, shares: currentShares, annualIncome };
  });
}
```

## Calculation Validation

When implementing or reviewing financial calculations:

1. **Test with known values** — verify against manual calculations
2. **Edge cases** — zero cost basis, negative values, single data point
3. **Currency consistency** — all CAD or explicit currency conversion
4. **Rounding** — use `Math.round(value * 100) / 100` for currency display
5. **Contribution limits** — update TFSA/RRSP/FHSA limits each January
