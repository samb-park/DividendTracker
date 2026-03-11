# DividendTracker Product Definition

## Product goal

Build a portfolio tracker that works **without Excel** and **without `plan.xlsm`**.

The app should become the source of truth for:
- accounts
- transactions
- portfolio targets
- cash movement
- dividend tracking
- performance metrics
- contribution room tracking
- authentication / user settings
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

6. **Deployment-compatible with existing Cloudflare access pattern**
   - The rebuilt app must remain reachable through the Cloudflare-connected domain, similar to the previous setup.
   - Auth, cookies, callback URLs, and proxy behavior should be designed with the Cloudflare-served domain in mind.

## Primary user jobs

- Create and manage brokerage/investment accounts
- Add, edit, and delete transactions manually
- View transaction history, holdings, cash, dividend history, projected dividends, and target dividends
- Track account-level deposits and withdrawals
- Track TFSA / RRSP / FHSA contribution room and remaining capacity
- Set and manage target allocations
- Set and track dividend income goals
- See allocation gaps against targets
- View performance metrics such as total return, CAGR, and MDD
- Log in securely with Google and manage personal settings
- Store broker connections per user with security-sensitive handling
- Eventually connect Questrade and sync automatically

## MVP scope

### In
- Account CRUD (inside Settings)
- Transaction CRUD (surfaced through portfolio symbol detail and supporting flows)
- Portfolio view with combined/account scope
- Symbol detail view
- Dividend history
- Projected dividend summaries
- Target dividend tracking
- Portfolio target management (inside Settings)
- Allocation comparison (current vs target)
- Net deposits / cash movement summaries
- Account-level deposit summaries
- Contribution room tracking for TFSA / RRSP / FHSA
- Dashboard with graphs and income summary
- Calendar/event view
- Google login/authentication as the top implementation priority
- Clean rebuild of database schema

### Out for MVP
- Excel import
- Excel history tracking
- Spreadsheet compatibility features
- Complex audit log/versioning
- Full multi-broker sync orchestration
- Advanced tax reporting
- Advanced institutional-grade analytics beyond core metrics

## Main screens

1. **Dashboard**
   - total portfolio value
   - asset trend graph
   - passive income graph
   - received income
   - monthly income
   - yearly income
   - projected dividends
   - target dividend progress
   - allocation gap summary
   - account room summary (TFSA / RRSP / FHSA)
   - performance metrics (total return / CAGR / MDD)
   - quick actions

2. **Portfolio**
   - combined portfolio view
   - account switcher / filter
   - holdings list for the selected scope
   - symbol detail view
   - current vs target allocation for each symbol
   - gap-to-target and next contribution guidance
   - transaction history in the selected symbol detail

3. **Calendar**
   - dividend ex-dates
   - dividend payment dates
   - earnings dates
   - portfolio-related upcoming events

4. **Settings**
   - Accounts
   - allocation targets
   - dividend goals
   - Google login
   - user preferences
   - per-user theme preference (light / dark / system)
   - broker connections
   - security/about

## Success criteria

The rebuild is successful when:
- the app works with a fresh empty database
- no Excel file is needed to initialize or maintain it
- a user can fully operate it by creating accounts and adding transactions manually
- targets and portfolio views work from app data alone
- users can track transaction history, dividend history, projected dividends, target dividends, and core performance metrics
- users can set contribution room and see remaining room for TFSA / RRSP / FHSA
- the mobile board is useful as a daily control surface
- users can log in with Google and manage their own broker/API setup
- the rebuilt app remains reachable through the existing Cloudflare-connected domain pattern
- future Questrade API sync can plug in without redesigning the core schema
