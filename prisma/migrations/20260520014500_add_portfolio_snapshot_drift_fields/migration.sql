-- Add optional one-release engine-vs-legacy drift fields to PortfolioSnapshot.
-- Additive only; do not apply until the approved P7/pre-approved migration window.
ALTER TABLE "PortfolioSnapshot"
  ADD COLUMN IF NOT EXISTS "driftPct" DECIMAL(10, 6),
  ADD COLUMN IF NOT EXISTS "engineValueCAD" DECIMAL(18, 2),
  ADD COLUMN IF NOT EXISTS "legacyValueCAD" DECIMAL(18, 2),
  ADD COLUMN IF NOT EXISTS "driftAlertSent" BOOLEAN;
