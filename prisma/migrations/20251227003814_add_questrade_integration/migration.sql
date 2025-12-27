-- AlterTable
ALTER TABLE "Account" ADD COLUMN "lastSyncedAt" DATETIME;
ALTER TABLE "Account" ADD COLUMN "questradeAccountNumber" TEXT;

-- CreateTable
CREATE TABLE "QuestradeToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "apiServer" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuestradeToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestradeToken_accountId_key" ON "QuestradeToken"("accountId");
