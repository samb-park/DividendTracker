-- Pocket portfolios: user-defined ticker groups for the /pocket dividend surface.
-- CreateTable
CREATE TABLE "PocketGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "tickers" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PocketGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PocketGroup_userId_idx" ON "PocketGroup"("userId");
