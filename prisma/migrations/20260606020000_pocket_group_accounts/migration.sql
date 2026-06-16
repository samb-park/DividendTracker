-- Per-portfolio account-type scope (TFSA/RRSP/...). Empty array = all accounts.
-- Existing rows backfill to '{}' (= all accounts), preserving current behavior.
ALTER TABLE "PocketGroup" ADD COLUMN "accounts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
