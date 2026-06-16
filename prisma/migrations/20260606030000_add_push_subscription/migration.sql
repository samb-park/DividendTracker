-- PushSubscription: Web Push endpoints per device for /pocket dividend alerts.
-- userId is a soft ref (no FK). endpoint unique → upsert target; multi-device.
CREATE TABLE "PushSubscription" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "endpoint"   TEXT NOT NULL,
  "p256dh"     TEXT NOT NULL,
  "auth"       TEXT NOT NULL,
  "userAgent"  TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
