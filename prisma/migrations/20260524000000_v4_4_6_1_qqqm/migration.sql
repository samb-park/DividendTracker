-- Rulebook v4.4.6.1: add QQQM observation columns to AssetWeightSnapshot.
-- Additive (nullable, no backfill). Existing v4.4.2-era rows remain untouched.
-- See: src/lib/rulebook.ts (RULEBOOK_TARGETS.QQQM_*), src/lib/audit/assetWeightSnapshot.ts.
ALTER TABLE "AssetWeightSnapshot"
  ADD COLUMN "qqqmCAD" DECIMAL(18,2),
  ADD COLUMN "qqqmTotalWeightPct" DECIMAL(6,3),
  ADD COLUMN "qqqmCumulativeCostUsd" DECIMAL(18,2),
  ADD COLUMN "qqqmCumulativeShares" DECIMAL(18,6);
