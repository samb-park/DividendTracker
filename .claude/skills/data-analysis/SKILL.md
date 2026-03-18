---
name: data-analysis
description: Analyze portfolio and dividend data patterns, optimize SQL/Prisma queries, and improve Recharts visualizations. Activates when working with dividend calculations, portfolio performance metrics, chart improvements, or database query optimization.
---

# Data Analysis Skill

Specialized guidance for portfolio data analysis, SQL/Prisma query optimization, and Recharts visualization in DividendTracker.

## When This Skill Activates

- Keywords: "portfolio analysis", "dividend trend", "chart optimization", "slow query"
- Tasks: Building new charts, optimizing Prisma queries, calculating performance KPIs
- Data patterns: Aggregating dividends by period, computing yield metrics, comparing sectors

## Portfolio Data Patterns

### Key Metrics to Track

| Metric | Definition | Query Pattern |
|--------|-----------|---------------|
| Yield on Cost | Annual dividend / Cost basis | `(annualDividend / costBasis) * 100` |
| Forward Yield | Projected annual / Current market value | Rolling 12-month projection |
| DRIP Growth | Shares added via reinvestment | Cumulative share count delta |
| Sector Weight | Sector value / Total portfolio value | GROUP BY sector |
| Contribution Room | Account limit - contributed amount | Per account type (TFSA/RRSP/FHSA) |

### Prisma Query Patterns

```typescript
// Efficient dividend aggregation by month
const monthlyDividends = await prisma.dividendPayment.groupBy({
  by: ['year', 'month'],
  where: { userId, accountId },
  _sum: { amountCAD: true },
  orderBy: [{ year: 'asc' }, { month: 'asc' }],
});

// Portfolio snapshot with holdings
const snapshot = await prisma.portfolioSnapshot.findFirst({
  where: { userId },
  orderBy: { snapshotDate: 'desc' },
  include: {
    holdings: {
      include: { security: true },
    },
  },
});

// Sector distribution
const sectorAllocation = await prisma.holding.groupBy({
  by: ['sector'],
  where: { portfolioSnapshot: { userId } },
  _sum: { marketValueCAD: true },
});
```

### Avoiding N+1 Queries

```typescript
// BAD: N+1
const holdings = await prisma.holding.findMany({ where: { userId } });
for (const h of holdings) {
  const security = await prisma.security.findUnique({ where: { id: h.securityId } });
}

// GOOD: Single query with include
const holdings = await prisma.holding.findMany({
  where: { userId },
  include: { security: true },
});
```

## Recharts Visualization Patterns

### Dividend Income Bar Chart

```tsx
// Monthly income grouped by account type
<BarChart data={monthlyData}>
  <XAxis dataKey="month" tickFormatter={(m) => format(new Date(m), 'MMM yy')} />
  <YAxis tickFormatter={(v) => `$${v.toFixed(0)}`} />
  <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Income']} />
  <Bar dataKey="tfsa" stackId="a" fill="#10b981" name="TFSA" />
  <Bar dataKey="rrsp" stackId="a" fill="#3b82f6" name="RRSP" />
  <Bar dataKey="fhsa" stackId="a" fill="#f59e0b" name="FHSA" />
</BarChart>
```

### Portfolio Growth Area Chart

```tsx
// Cumulative value over time
<AreaChart data={snapshotHistory}>
  <defs>
    <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
    </linearGradient>
  </defs>
  <Area type="monotone" dataKey="totalValueCAD" fill="url(#portfolioGradient)" stroke="#3b82f6" />
</AreaChart>
```

### SSR-Safe Chart Wrapper

```tsx
// Recharts requires client-side rendering
'use client';
import dynamic from 'next/dynamic';

const DividendChart = dynamic(() => import('./DividendChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
```

## Data Analysis Workflow

### When Adding a New Chart

1. Identify data source (existing Prisma query or new one needed?)
2. Check if aggregation can be done in DB (prefer DB over client-side)
3. Add appropriate indexes if GROUP BY or ORDER BY on new columns
4. Use `ResponsiveContainer` with explicit `height` to avoid SSR issues
5. Add loading skeleton matching chart dimensions

### Performance Checklist

- [ ] Query uses `select` to fetch only needed fields
- [ ] Aggregations (SUM, COUNT, AVG) done in DB via `groupBy`
- [ ] Date range filters applied before aggregation
- [ ] Results cached in Next.js with appropriate `revalidate`
- [ ] Chart data memoized with `useMemo` if derived from props
