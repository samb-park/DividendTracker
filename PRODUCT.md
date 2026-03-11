# DividendTracker Product Definition

## Product goal

Build a portfolio tracker that works **without Excel** and **without `plan.xlsm`**.

The app should become the source of truth for:
- accounts
- transactions
- portfolio targets
- cash movement
- dividend tracking
- future broker sync state

Excel files are not part of the intended workflow.

## Core principles

1. **App-first, not spreadsheet-first**
   - Data is created, edited, and stored in the app.
   - Export is optional; import is not a core workflow.

2. **Rebuild over patching**
   - Existing code may be reused selectively, but compatibility with old Excel-driven flows is not a priority.

3. **Postgres is the source of truth**
   - The database is the canonical record.
   - Local calculations and UI derive from DB state.

4. **Manual-first, API-ready**
   - The app must be fully usable with manual data entry.
   - Broker API sync is a later enhancement, not a prerequisite.

5. **Opinionated for real investing workflows**
   - The app should help answer: what do I own, what changed, what income did I receive, and what should I buy next?

## Primary user jobs

- Create and manage brokerage/investment accounts
- Add, edit, and delete transactions manually
- View holdings, cash, and dividend summaries
- Set and manage target allocations
- See allocation gaps against targets
- Eventually connect Questrade and sync automatically

## MVP scope

### In
- Account CRUD
- Transaction CRUD
- Holdings view
- Dividend summaries
- Portfolio target management
- Allocation comparison (current vs target)
- Net deposits / cash movement summaries
- Clean rebuild of database schema

### Out for MVP
- Excel import
- Excel history tracking
- Spreadsheet compatibility features
- Complex audit log/versioning
- Multi-broker sync orchestration
- Tax reporting

## Main screens

1. **Dashboard**
   - portfolio value
   - cash by currency
   - dividend summary
   - allocation gap summary
   - quick actions

2. **Accounts**
   - list accounts
   - create/edit/delete account
   - per-account summary

3. **Transactions**
   - create/edit/delete transaction
   - filter by account, date, action, symbol
   - quick add flows for common transaction types

4. **Holdings**
   - current positions
   - cost basis snapshot
   - market value
   - allocation

5. **Targets**
   - symbol targets
   - weekly contribution plan
   - compare current vs desired allocation

6. **Broker Connections** (post-MVP)
   - Questrade auth
   - connection status
   - sync controls

## Success criteria

The rebuild is successful when:
- the app works with a fresh empty database
- no Excel file is needed to initialize or maintain it
- a user can fully operate it by creating accounts and adding transactions manually
- targets and portfolio views work from app data alone
- future Questrade API sync can plug in without redesigning the core schema
