-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "broker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "price" DECIMAL NOT NULL,
    "fee" DECIMAL NOT NULL DEFAULT 0,
    "tradeDate" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "avgCost" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Holding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DividendSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "lastDividendPerShare" DECIMAL NOT NULL,
    "lastDividendDate" DATETIME NOT NULL,
    "frequency" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "dividendYield" DECIMAL,
    "previousClose" DECIMAL,
    "name" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImportLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errors" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Account_broker_idx" ON "Account"("broker");

-- CreateIndex
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");

-- CreateIndex
CREATE INDEX "Transaction_ticker_idx" ON "Transaction"("ticker");

-- CreateIndex
CREATE INDEX "Transaction_tradeDate_idx" ON "Transaction"("tradeDate");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_accountId_ticker_idx" ON "Transaction"("accountId", "ticker");

-- CreateIndex
CREATE INDEX "Holding_ticker_idx" ON "Holding"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_accountId_ticker_key" ON "Holding"("accountId", "ticker");

-- CreateIndex
CREATE UNIQUE INDEX "DividendSchedule_ticker_key" ON "DividendSchedule"("ticker");

-- CreateIndex
CREATE INDEX "DividendSchedule_frequency_idx" ON "DividendSchedule"("frequency");

-- CreateIndex
CREATE UNIQUE INDEX "PriceCache_ticker_key" ON "PriceCache"("ticker");

-- CreateIndex
CREATE INDEX "PriceCache_updatedAt_idx" ON "PriceCache"("updatedAt");

-- CreateIndex
CREATE INDEX "ImportLog_accountId_idx" ON "ImportLog"("accountId");

-- CreateIndex
CREATE INDEX "ImportLog_createdAt_idx" ON "ImportLog"("createdAt");
