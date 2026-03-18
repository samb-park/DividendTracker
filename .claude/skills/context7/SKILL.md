---
name: context7
description: Search GitHub issues, pull requests, and discussions across any repository. Activates when researching external dependencies (Prisma, NextAuth, Recharts, yahoo-finance2, Next.js), looking for similar bugs, or finding implementation examples.
---

# Context7 - GitHub Search

Search GitHub repositories for issues, PRs, discussions, and code examples to research solutions and best practices.

## When This Skill Activates

- Keywords: "search GitHub", "find issues", "look up PR", "GitHub discussion"
- Research patterns: "Are there any [repo] issues about [topic]?"
- Dependency research: Mentions of Prisma, NextAuth, Recharts, yahoo-finance2, Next.js
- Bug investigation: "Has anyone else experienced [problem]?"
- Implementation examples: "How do others implement [feature]?"

## Frequently Searched Repositories

DividendTracker dependencies and related projects:

| Repository | Purpose | When to Search |
|------------|---------|----------------|
| **prisma/prisma** | ORM & DB schema | Migration issues, relation queries, performance, type generation |
| **nextauthjs/next-auth** | Authentication | Session handling, OAuth providers, JWT callbacks, middleware |
| **recharts/recharts** | Data visualization | Chart customization, responsive containers, animation issues |
| **gadicc/node-yahoo-finance2** | Stock/dividend data | API rate limits, data parsing, ticker lookup errors |
| **vercel/next.js** | App framework | App Router, Server Components, API routes, caching, hydration |

## Search Syntax Examples

### Search Prisma Migration Issues

```
Repository: prisma/prisma
Query: "migration failed" OR "schema drift" label:bug is:closed
Sort: Most commented

# Look for:
- Baseline migration strategies
- Shadow database issues
- Type generation problems
- Relation query performance
```

### Search NextAuth Session Problems

```
Repository: nextauthjs/next-auth
Query: "session undefined" OR "JWT callback" label:bug
Sort: Recently updated

# Look for:
- Middleware configuration patterns
- Session token expiry handling
- Custom credentials provider
- Server component session access
```

### Search Recharts Responsive Issues

```
Repository: recharts/recharts
Query: "ResponsiveContainer" OR "chart not rendering" is:closed
Sort: Most commented

# Look for:
- SSR/hydration mismatches
- Dynamic data updates
- Custom tooltip patterns
- Mobile responsiveness
```

### Search yahoo-finance2 Data Issues

```
Repository: gadicc/node-yahoo-finance2
Query: "rate limit" OR "dividend history" OR "ticker not found"
State: Closed (to find fixes)

# Look for:
- API throttling strategies
- Data normalization patterns
- Error handling for delisted stocks
- Historical dividend data quirks
```

## Search Strategies

### 1. Start Broad, Then Narrow

```
Step 1: Search issue titles
  → "prisma migration"

Step 2: Add labels
  → "prisma migration" label:bug

Step 3: Check discussions
  → Switch to Discussions tab for detailed solutions

Step 4: Look at closed issues
  → is:closed (solutions often in closed issues)
```

### 2. Finding Solutions

**For bugs**:
1. Search closed issues first (likely fixed)
2. Check PR descriptions for implementation details
3. Look for "fixed in version X" comments
4. Check release notes for related fixes

**For features**:
1. Search discussions for design rationale
2. Check PRs for code examples
3. Look for "how to" issues with detailed responses

## Common DividendTracker Research Queries

### Prisma Performance

```
Query: "slow query" OR "N+1" OR "include vs select"
Repo: prisma/prisma
Labels: performance, optimization

Expected: Relation loading strategies, index hints, query batching
```

### NextAuth App Router

```
Query: "app router" OR "server component" "session"
Repo: nextauthjs/next-auth
Date: After 2023-06-01

Expected: getServerSession patterns, middleware config, route protection
```

### Recharts SSR Fix

```
Query: "window is not defined" OR "SSR" OR "hydration"
Repo: recharts/recharts
State: Closed

Expected: Dynamic import patterns, client-only wrappers
```

### yahoo-finance2 Dividend Data

```
Query: "dividendHistory" OR "historical dividends"
Repo: gadicc/node-yahoo-finance2

Expected: Data structure, date parsing, currency handling
```

## Advanced Search Operators

```
# Combine multiple terms
"prisma schema" AND "migration"

# Exclude terms
"next-auth" NOT "pages router"

# Search by date range
created:>=2024-01-01

# Search by reactions
reactions:>10

# Search in specific locations
in:title "session expired"
in:body "getServerSession"
in:comments "fixed in"
```
