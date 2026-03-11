# DividendTracker Data Model (Rebuild Draft)

## Rebuild assumption

This model assumes:
- database can be reset
- old Excel/import compatibility is not required
- `plan.xlsm` is not a source of truth

## Entity overview

### 1. accounts
Represents brokerage/investment accounts.

Suggested fields:
- `id`
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

### 2. transactions
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

### 3. transaction_edits (optional, later)
Useful if edit history becomes important.

Suggested fields:
- `id`
- `transactionId`
- `changedBy`
- `beforeJson`
- `afterJson`
- `createdAt`

Not required for MVP.

### 4. portfolio_targets
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

### 5. portfolio_settings
Stores planning/settings values previously living outside the app.

Suggested fields:
- `id`
- `weeklyContributionAmount`
- `fxFeePercent`
- `baseCurrency`
- `createdAt`
- `updatedAt`

This replaces part of what `plan.xlsm` may have been doing.

### 6. broker_connections (post-MVP)
Stores Questrade connection state.

Suggested fields:
- `id`
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

### 7. sync_runs (post-MVP)
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

### 8. price_cache / fx_cache
Can remain as support tables for dashboard/holdings calculation.

## Relationships

- `accounts 1 -> many transactions`
- `broker_connections 1 -> many sync_runs`
- `portfolio_settings 1 -> many portfolio_targets` (optional), or keep target rows standalone for MVP

## Derived views / services

These may remain computed rather than stored initially:
- holdings by symbol
- cash balances by account/currency
- dividend totals
- allocation gaps
- net deposits

## MVP schema recommendation

For the actual rebuild, minimum required tables are:
- `accounts`
- `transactions`
- `portfolio_settings`
- `portfolio_targets`
- `price_cache`
- `fx_cache`

## Explicitly remove from the mental model

Do **not** rebuild around:
- excel file metadata
- import history
- row hash identity from spreadsheets
- spreadsheet-only concepts that do not matter in app usage
