-- Phase 1 additive event-sourcing schema for Performance reconstruction.
-- Additive only: no drops, no existing data rewrite.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CashLedgerEventType" AS ENUM (
    'DEPOSIT',
    'WITHDRAWAL',
    'BUY',
    'SELL',
    'DIVIDEND',
    'DRIP',
    'FX_CONVERT',
    'FEE',
    'ADJUSTMENT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add nullable dividend metadata directly to Transaction for Phase 1.
ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "exDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "amountPerShare" DECIMAL(18,6),
  ADD COLUMN IF NOT EXISTS "sharesAtRecord" DECIMAL(18,6),
  ADD COLUMN IF NOT EXISTS "withholdingTax" DECIMAL(18,4);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExternalDeposit" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" "Currency" NOT NULL,
  "source" TEXT,
  "notes" TEXT,
  "cashTransactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FxConversion" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "fromCurrency" "Currency" NOT NULL,
  "fromAmount" DECIMAL(18,2) NOT NULL,
  "toCurrency" "Currency" NOT NULL,
  "toAmount" DECIMAL(18,2) NOT NULL,
  "fxRateCAD" DECIMAL(10,6),
  "source" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FxConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FxRateDaily" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "pair" TEXT NOT NULL,
  "rate" DECIMAL(10,6) NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FxRateDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CashLedger" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "currency" "Currency" NOT NULL,
  "amount" DECIMAL(18,4) NOT NULL,
  "eventType" "CashLedgerEventType" NOT NULL,
  "ticker" TEXT,
  "notes" TEXT,
  "source" TEXT,
  "relatedTransactionId" TEXT,
  "relatedCashTransactionId" TEXT,
  "externalDepositId" TEXT,
  "fxConversionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashLedger_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalDeposit_cashTransactionId_key"
  ON "ExternalDeposit"("cashTransactionId");
CREATE INDEX IF NOT EXISTS "ExternalDeposit_portfolioId_date_idx"
  ON "ExternalDeposit"("portfolioId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalDeposit_portfolioId_date_amount_currency_source_key"
  ON "ExternalDeposit"("portfolioId", "date", "amount", "currency", "source");

CREATE INDEX IF NOT EXISTS "FxConversion_portfolioId_date_idx"
  ON "FxConversion"("portfolioId", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "FxRateDaily_date_pair_key"
  ON "FxRateDaily"("date", "pair");

CREATE INDEX IF NOT EXISTS "CashLedger_portfolioId_date_idx"
  ON "CashLedger"("portfolioId", "date");
CREATE INDEX IF NOT EXISTS "CashLedger_portfolioId_currency_date_idx"
  ON "CashLedger"("portfolioId", "currency", "date");
CREATE INDEX IF NOT EXISTS "CashLedger_relatedTransactionId_idx"
  ON "CashLedger"("relatedTransactionId");
CREATE INDEX IF NOT EXISTS "CashLedger_relatedCashTransactionId_idx"
  ON "CashLedger"("relatedCashTransactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "CashLedger_eventType_relatedTransactionId_currency_key"
  ON "CashLedger"("eventType", "relatedTransactionId", "currency");
CREATE UNIQUE INDEX IF NOT EXISTS "CashLedger_eventType_relatedCashTransactionId_currency_key"
  ON "CashLedger"("eventType", "relatedCashTransactionId", "currency");

-- Foreign keys. PostgreSQL has no IF NOT EXISTS for constraints, so guard by name.
DO $$ BEGIN
  ALTER TABLE "ExternalDeposit" ADD CONSTRAINT "ExternalDeposit_portfolioId_fkey"
    FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ExternalDeposit" ADD CONSTRAINT "ExternalDeposit_cashTransactionId_fkey"
    FOREIGN KEY ("cashTransactionId") REFERENCES "CashTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FxConversion" ADD CONSTRAINT "FxConversion_portfolioId_fkey"
    FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CashLedger" ADD CONSTRAINT "CashLedger_portfolioId_fkey"
    FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CashLedger" ADD CONSTRAINT "CashLedger_relatedTransactionId_fkey"
    FOREIGN KEY ("relatedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CashLedger" ADD CONSTRAINT "CashLedger_relatedCashTransactionId_fkey"
    FOREIGN KEY ("relatedCashTransactionId") REFERENCES "CashTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CashLedger" ADD CONSTRAINT "CashLedger_externalDepositId_fkey"
    FOREIGN KEY ("externalDepositId") REFERENCES "ExternalDeposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CashLedger" ADD CONSTRAINT "CashLedger_fxConversionId_fkey"
    FOREIGN KEY ("fxConversionId") REFERENCES "FxConversion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
