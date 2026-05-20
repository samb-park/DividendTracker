-- AddObservabilityLayer (Phase 1 — Slice 1.1)
--
-- Purpose: Add four new tables backing the AI-assisted portfolio operating
-- system's audit / observability layer. Strictly additive — no ALTER, DROP,
-- UPDATE, or DELETE statements. All existing schema objects are preserved.
--
-- Authority model: AiCallLog and RulebookTriggerEvent reference users and
-- rulebook versions by string only (no foreign keys) so that audit trails
-- survive user deletion and rulebook-version pruning.

-- =============================================================================
-- AiCallLog
-- =============================================================================
CREATE TABLE "AiCallLog" (
    "id"                 TEXT NOT NULL,
    "userId"             TEXT NOT NULL,
    "route"              TEXT NOT NULL,
    "provider"           TEXT NOT NULL,
    "model"              TEXT NOT NULL,
    "rulebookVersion"    TEXT NOT NULL,
    "systemPromptHash"   TEXT NOT NULL,
    "userQueryHash"      TEXT,
    "contextSizeChars"   INTEGER,
    "cached"             BOOLEAN NOT NULL DEFAULT false,
    "status"             TEXT NOT NULL,
    "httpStatus"         INTEGER NOT NULL,
    "durationMs"         INTEGER NOT NULL,
    "upstreamDurationMs" INTEGER,
    "promptTokens"       INTEGER,
    "completionTokens"   INTEGER,
    "totalTokens"        INTEGER,
    "rawResponse"        TEXT,
    "sanitizedResponse"  TEXT,
    "validatedAt"        TIMESTAMP(3),
    "validationStatus"   TEXT,
    "violationCodes"     TEXT[],
    "errorMessage"       TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCallLog_userId_createdAt_idx"
    ON "AiCallLog" ("userId", "createdAt");
CREATE INDEX "AiCallLog_route_createdAt_idx"
    ON "AiCallLog" ("route", "createdAt");
CREATE INDEX "AiCallLog_rulebookVersion_createdAt_idx"
    ON "AiCallLog" ("rulebookVersion", "createdAt");
CREATE INDEX "AiCallLog_status_createdAt_idx"
    ON "AiCallLog" ("status", "createdAt");

-- =============================================================================
-- AssetWeightSnapshot
-- =============================================================================
CREATE TABLE "AssetWeightSnapshot" (
    "id"                 TEXT NOT NULL,
    "userId"             TEXT NOT NULL,
    "date"               DATE NOT NULL,
    "totalCAD"           DECIMAL(18,2) NOT NULL,
    "schdCAD"            DECIMAL(18,2) NOT NULL,
    "qldCAD"             DECIMAL(18,2) NOT NULL,
    "sgovCAD"            DECIMAL(18,2) NOT NULL,
    "iaumCAD"            DECIMAL(18,2) NOT NULL,
    "tqqqCAD"            DECIMAL(18,2) NOT NULL,
    "otherCAD"           DECIMAL(18,2) NOT NULL,
    "cashCAD"            DECIMAL(18,2) NOT NULL,
    "qldCoreWeightPct"   DECIMAL(6,3)  NOT NULL,
    "schdCoreWeightPct"  DECIMAL(6,3)  NOT NULL,
    "growthBucketPct"    DECIMAL(6,3)  NOT NULL,
    "sgovTotalWeightPct" DECIMAL(6,3)  NOT NULL,
    "iaumTotalWeightPct" DECIMAL(6,3)  NOT NULL,
    "tqqqTotalWeightPct" DECIMAL(6,3)  NOT NULL,
    "triggerFlags"       JSONB NOT NULL,
    "fxRateCAD"          DECIMAL(10,6) NOT NULL,
    "priceSource"        TEXT NOT NULL,
    "unverifiedItems"    TEXT[],
    "rulebookVersion"    TEXT NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetWeightSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetWeightSnapshot_userId_date_key"
    ON "AssetWeightSnapshot" ("userId", "date");
CREATE INDEX "AssetWeightSnapshot_userId_date_idx"
    ON "AssetWeightSnapshot" ("userId", "date" DESC);

-- =============================================================================
-- RulebookTriggerEvent
-- =============================================================================
CREATE TABLE "RulebookTriggerEvent" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "triggerKind"       TEXT NOT NULL,
    "severity"          TEXT NOT NULL,
    "detectedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"        TIMESTAMP(3),
    "rulebookVersion"   TEXT NOT NULL,
    "weightsSnapshotId" TEXT,
    "weightsAtDetect"   JSONB NOT NULL,
    "computedPlan"      JSONB,
    "notifiedAt"        TIMESTAMP(3),
    "notifyChannel"     TEXT,
    "resolutionAction"  TEXT,
    "resolutionNotes"   TEXT,

    CONSTRAINT "RulebookTriggerEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RulebookTriggerEvent_userId_detectedAt_idx"
    ON "RulebookTriggerEvent" ("userId", "detectedAt" DESC);
CREATE INDEX "RulebookTriggerEvent_userId_triggerKind_resolvedAt_idx"
    ON "RulebookTriggerEvent" ("userId", "triggerKind", "resolvedAt");
CREATE INDEX "RulebookTriggerEvent_userId_severity_resolvedAt_idx"
    ON "RulebookTriggerEvent" ("userId", "severity", "resolvedAt");

-- =============================================================================
-- RulebookVersion
-- =============================================================================
CREATE TABLE "RulebookVersion" (
    "version"       TEXT NOT NULL,
    "promptHash"    TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "changelog"     TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RulebookVersion_pkey" PRIMARY KEY ("version")
);
