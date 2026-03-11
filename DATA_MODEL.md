# DividendTracker Data Model (Rebuild Draft)

## Rebuild assumption

This model assumes:
- database can be reset
- old Excel/import compatibility is not required
- `plan.xlsm` is not a source of truth

## Entity overview

### 1. users
Needed when login/auth is introduced.

Suggested fields:
- `id`
- `email`
- `passwordHash` or external auth identifier
- `displayName`
- `createdAt`
- `updatedAt`

Notes:
- Single-user support is acceptable first, but schema should not block later multi-user separation.

### 2. accounts
Represents brokerage/investment accounts.

Suggested fields:
- `id`
- `userId`
- `name` — optional friendly display name
- `broker` — e.g. `manual`, `questrade`
- `accountType` — RRSP, TFSA, Margin, FHSA, etc.
- `accountNumber` — optional, unique if present
- `baseCurrency` — CAD or USD
- `isActive`
- `createdAt`
- `updatedAt`

Notes:
- account creation must work without imported transactions
- `name` should be preferred over nickname-only behavior
- account type drives contribution room behavior for registered accounts

### 3. transactions
Canonical investment ledger.

Suggested fields:
- `id`
- `accountId`
- `source` — `manual` | `questrade_api`
- `externalId` — nullable, used for broker dedupe
- `transactionDate`
- `settlementDate`
- `action`
- `activityType` — domain-specific subtype if needed
- `symbol`
- `normalizedSymbol`
- `description`
- `quantity`
- `price`
- `grossAmount`
- `commission`
- `netAmount`
- `currency`
- `fxRateToCad` — nullable
- `cadEquivalent` — nullable or computed snapshot
- `notes` — optional manual notes
- `createdAt`
- `updatedAt`

Recommended transaction actions:
- `BUY`
- `SELL`
- `DIVIDEND`
- `REINVEST`
- `DEPOSIT`
- `WITHDRAWAL`
- `FEE`
- `INTEREST`
- `TRANSFER_IN`
- `TRANSFER_OUT`

Notes:
- This is the most important table in the app.
- Avoid Excel-specific columns like row hashes as the primary design concept.
- For broker sync, use `(source, externalId)` uniqueness when present.

### 4. account_contribution_settings
Tracks account-level contribution room configuration.

Suggested fields:
- `id`
- `accountId`
- `year` — optional if yearly room tracking is used
- `contributionRoom`
- `notes`
- `createdAt`
- `updatedAt`

Notes:
- Supports TFSA / RRSP / FHSA room tracking
- MVP can start with current room only; later expand to yearly room records

### 5. transaction_edits (optional, later)
Useful if edit history becomes important.

Suggested fields:
- `id`
- `transactionId`
- `changedBy`
- `beforeJson`
- `afterJson`
- `createdAt`

Not required for MVP.

### 6. portfolio_targets
Represents desired allocation targets.

Suggested fields:
- `id`
- `symbol`
- `targetWeight`
- `currency`
- `isActive`
- `createdAt`
- `updatedAt`

Notes:
- If multiple target sets are needed later, add `targetSetId`.
- For now, a single active target set is acceptable.

### 7. portfolio_settings
Stores planning/settings values previously living outside the app.

Suggested fields:
- `id`
- `weeklyContributionAmount`
- `fxFeePercent`
- `baseCurrency`
- `createdAt`
- `updatedAt`

This replaces part of what `plan.xlsm` may have been doing.

### 8. broker_connections
Stores Questrade connection state.

Suggested fields:
- `id`
- `userId`
- `broker` — `questrade`
- `status` — connected, expired, error, disconnected
- `accountLabel`
- `encryptedRefreshToken`
- `accessTokenExpiresAt`
- `lastSyncAt`
- `lastSyncStatus`
- `createdAt`
- `updatedAt`

Notes:
- Secrets should not live in plaintext when avoidable.
- This enables API sync later without reworking the rest of the app.
- The user must be able to configure this from settings/login-connected flows.

### 9. sync_runs
Tracks broker sync attempts.

Suggested fields:
- `id`
- `brokerConnectionId`
- `status`
- `startedAt`
- `finishedAt`
- `insertedCount`
- `updatedCount`
- `errorMessage`

Useful for debugging sync behavior.

### 10. portfolio_snapshots (recommended)
Stores periodic portfolio equity snapshots.

Suggested fields:
- `id`
- `userId`
- `snapshotDate`
- `totalEquity`
- `totalMarketValue`
- `totalCash`
- `currency`
- `createdAt`

Notes:
- This is strongly recommended for performance charts and MDD calculation.
- Without snapshots, MDD becomes more complex and less reliable.

### 11. price_cache / fx_cache
Can remain as support tables for dashboard/holdings calculation.

## Relationships

- `users 1 -> many accounts`
- `users 1 -> many broker_connections`
- `users 1 -> many portfolio_snapshots`
- `accounts 1 -> many transactions`
- `accounts 1 -> many account_contribution_settings`
- `broker_connections 1 -> many sync_runs`
- `portfolio_settings 1 -> many portfolio_targets` (optional), or keep target rows standalone for MVP

## Derived views / services

These may remain computed rather than stored initially:
- holdings by symbol
- cash balances by account/currency
- dividend totals and dividend history
- projected dividends
- allocation gaps
- net deposits
- account-level contribution usage
- CAGR
- MDD (preferably snapshot-backed)

## MVP schema recommendation

For the actual rebuild, minimum required tables are:
- `users` (or a single-user-compatible auth owner model)
- `accounts`
- `transactions`
- `account_contribution_settings`
- `portfolio_settings`
- `portfolio_targets`
- `price_cache`
- `fx_cache`

Strongly recommended soon after MVP:
- `broker_connections`
- `sync_runs`
- `portfolio_snapshots`

## Explicitly remove from the mental model

Do **not** rebuild around:
- excel file metadata
- import history
- row hash identity from spreadsheets
- spreadsheet-only concepts that do not matter in app usage
