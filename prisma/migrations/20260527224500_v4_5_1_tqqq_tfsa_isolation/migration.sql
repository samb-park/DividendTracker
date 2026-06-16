-- Rulebook v4.5.1: persist transaction execution reason for TQQQ/SGOV/Core flows.
ALTER TABLE "Transaction" ADD COLUMN "reason" TEXT;
