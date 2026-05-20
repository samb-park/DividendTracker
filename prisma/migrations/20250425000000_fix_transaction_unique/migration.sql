-- DropIndex
DROP INDEX "Transaction_holdingId_action_date_quantity_price_key";

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_holdingId_externalId_idx" ON "Transaction"("holdingId", "externalId");
