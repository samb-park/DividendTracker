# DividendTracker Rebuild Plan

## Working assumption

We are allowed to:
- rebuild large parts of the codebase
- reset the database
- ignore backward compatibility with Excel/import workflows

The goal is a clean, app-native portfolio tracker.

## What stays

These are worth keeping unless they get in the way:
- Next.js app shell
- PostgreSQL + Prisma setup
- reusable UI components
- some calculation logic for holdings/dividends/cash if still valid after schema cleanup
- Docker deployment path
- compatibility with the Cloudflare-connected domain access pattern

## What should be removed or deprioritized

- Excel import workflow
- import history
- spreadsheet-centric language and assumptions
- schema decisions made only to support spreadsheet import
- legacy migration scripts once rebuild is complete

## Rebuild phases

### Phase 1 — product and schema reset
Goal: define the new source-of-truth model before further coding.

Tasks:
- finalize PRODUCT.md
- finalize DATA_MODEL.md
- replace Prisma schema with rebuild-first schema
- reset DB with clean migration / db push

Deliverable:
- empty but coherent database model ready for app-native workflows

### Phase 2 — auth, account, and transaction core
Goal: make the app usable with no external data source.

Tasks:
- Google login/auth foundation
- account create/edit/delete
- transaction create/edit/delete
- transaction filters and pagination
- action-specific input UX
- account-level deposit summaries
- contribution room setting for TFSA / RRSP / FHSA
- validation and error states

Deliverable:
- user can start from a blank DB, log in with Google, and manage a portfolio manually

### Phase 3 — targets and planning
Goal: replace `plan.xlsm` planning behavior inside the app.

Tasks:
- settings for weekly contribution / FX fee / base assumptions
- target allocation CRUD
- target dividend setting (monthly / annual)
- current vs target allocation comparison
- investment gap / rebalance guidance
- dividend goal progress tracking

Deliverable:
- target planning no longer depends on any spreadsheet

### Phase 4 — mobile board, dashboard, and portfolio intelligence
Goal: make the app operationally useful day-to-day.

Tasks:
- mobile-first board/dashboard
- holdings summary
- transaction history views
- dividend history and projected dividend summary
- target dividend progress
- cash and net deposits summary
- account-level rollups
- performance metrics such as total return, CAGR, and MDD

Deliverable:
- app becomes the daily control panel on mobile and desktop

### Phase 5 — broker sync foundation
Goal: prepare for Questrade API without redesign.

Tasks:
- broker_connections model
- sync_runs model
- token handling strategy
- easy user-managed Questrade setup flow in settings
- Cloudflare-domain-aware auth/callback planning
- sync service boundaries

Deliverable:
- architecture ready for API integration and user self-setup

### Phase 6 — Questrade API integration
Goal: remove manual duplication where possible.

Tasks:
- OAuth/token flow
- account discovery
- transaction sync
- dedupe and upsert rules
- manual sync controls

Deliverable:
- Excel-free automatic sync path

## Immediate implementation priorities

If we start coding next, do this order:

1. add auth/user ownership foundation to schema
2. add contribution-room concepts to schema
3. rebuild account CRUD
4. rebuild transaction CRUD properly
5. rebuild targets/settings and Questrade setup screens
6. reconnect dashboard/mobile-board calculations to the new schema

## Architectural guidelines

### 1. Domain-first naming
Prefer business terms over import terms.

Good:
- transaction
- account
- target
- broker connection

Bad:
- import file
- source row hash as core identity
- excel row metadata everywhere

### 2. Separate input source from ledger record
The `transactions` table is the canonical ledger.
Whether data came from manual entry or API sync is metadata, not the main structure.

### 3. Support fresh-start UX
The app must make sense when DB is empty.
That means:
- create first account
- add first transaction
- set first target

No hidden assumption that imported data already exists.

### 4. Favor deletions over compatibility hacks
If an old pathway only exists for Excel support and adds complexity, remove it.

## Definition of done for rebuild

The rebuild is considered successful when:
- DB can be reset and re-created cleanly
- app opens on an empty DB without weird states
- account + transaction + target flows work without Excel
- dashboard reflects data created inside the app
- API sync can be added on top instead of forcing another redesign
