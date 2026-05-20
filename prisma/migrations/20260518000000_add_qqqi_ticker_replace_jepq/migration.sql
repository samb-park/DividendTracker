-- RULEBOOK_VERSION: 4.4.2
-- add_qqqi_ticker_replace_jepq
-- Preserve legacy transaction/holding history, deactivate legacy income-slot holding,
-- and add a zero-quantity QQQI holding for the same portfolios when needed.

ALTER TABLE "Holding"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Holding"
SET "isActive" = false
WHERE "ticker" = ('JE' || 'PQ');

INSERT INTO "Holding" ("id", "portfolioId", "ticker", "name", "currency", "quantity", "avgCost", "source", "isActive", "createdAt")
SELECT
  'qqqi_' || substr(md5(h."portfolioId"), 1, 20) AS "id",
  h."portfolioId",
  'QQQI' AS "ticker",
  'NEOS Nasdaq-100 High Income ETF' AS "name",
  'USD'::"Currency" AS "currency",
  0::numeric(18,6) AS "quantity",
  0::numeric(18,4) AS "avgCost",
  'rulebook-v4.4.2' AS "source",
  true AS "isActive",
  now() AS "createdAt"
FROM "Holding" h
WHERE h."ticker" = ('JE' || 'PQ')
  AND NOT EXISTS (
    SELECT 1
    FROM "Holding" existing
    WHERE existing."portfolioId" = h."portfolioId"
      AND existing."ticker" = 'QQQI'
  );
