/**
 * AssetWeightSnapshot audit helper.
 *
 * Records the daily per-asset weight snapshot used for rulebook retrospectives.
 * Idempotent on (userId, date) — repeat calls update existing snapshots in
 * place rather than creating duplicate rows.
 *
 * Phase 1: helper only. The cron writer that produces these snapshots will
 * be added in Phase 4.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

/** Decimal-compatible inputs. Prisma accepts any of these for @db.Decimal fields. */
type DecimalLike = number | string;

export interface RecordWeightSnapshotInput {
  userId: string;
  /** Calendar date. Time component is normalised to UTC midnight before write. */
  date: Date;
  // — per-asset CAD valuation
  totalCAD: DecimalLike;
  schdCAD: DecimalLike;
  qldCAD: DecimalLike;
  sgovCAD: DecimalLike;
  iaumCAD: DecimalLike;
  tqqqCAD: DecimalLike;
  otherCAD: DecimalLike;
  cashCAD: DecimalLike;
  // — rulebook weights (computeRulebookWeights snapshot, percentages)
  qldCoreWeightPct: DecimalLike;
  schdCoreWeightPct: DecimalLike;
  growthBucketPct: DecimalLike;
  sgovTotalWeightPct: DecimalLike;
  iaumTotalWeightPct: DecimalLike;
  tqqqTotalWeightPct: DecimalLike;
  // — full trigger-flag map (JSONB)
  triggerFlags: Prisma.InputJsonValue;
  // — data provenance
  fxRateCAD: DecimalLike;
  priceSource: string;
  unverifiedItems?: string[];
  rulebookVersion: string;
}

export interface RecordWeightSnapshotResult {
  ok: boolean;
  id: string | null;
  created: boolean;
}

function isAuditEnabled(): boolean {
  return process.env.AI_AUDIT_ENABLED !== "false";
}

function serializeError(err: unknown): {
  message: string;
  name?: string;
  code?: string;
} {
  if (err instanceof Error) {
    const out: { message: string; name?: string; code?: string } = {
      message: err.message,
      name: err.name,
    };
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") out.code = code;
    return out;
  }
  return { message: String(err) };
}

/**
 * Normalise to UTC midnight so the unique (userId, date) key matches whether
 * the caller passed a timestamp or a date-only value.
 */
function normaliseDate(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

export async function recordWeightSnapshot(
  input: RecordWeightSnapshotInput,
): Promise<RecordWeightSnapshotResult> {
  if (!isAuditEnabled()) {
    log.debug({
      event: "audit.weightSnapshot.disabled",
      userId: input.userId,
    });
    return { ok: true, id: null, created: false };
  }

  const started = Date.now();
  const date = normaliseDate(input.date);
  const isoDate = date.toISOString().slice(0, 10);

  try {
    // Track whether this is a fresh insert vs an update of an existing row.
    // The upsert below is the source of truth — the lookup here only informs
    // the structured-log outcome field.
    const existing = await prisma.assetWeightSnapshot.findUnique({
      where: { userId_date: { userId: input.userId, date } },
      select: { id: true },
    });

    const data = {
      userId: input.userId,
      date,
      totalCAD: input.totalCAD,
      schdCAD: input.schdCAD,
      qldCAD: input.qldCAD,
      sgovCAD: input.sgovCAD,
      iaumCAD: input.iaumCAD,
      tqqqCAD: input.tqqqCAD,
      otherCAD: input.otherCAD,
      cashCAD: input.cashCAD,
      qldCoreWeightPct: input.qldCoreWeightPct,
      schdCoreWeightPct: input.schdCoreWeightPct,
      growthBucketPct: input.growthBucketPct,
      sgovTotalWeightPct: input.sgovTotalWeightPct,
      iaumTotalWeightPct: input.iaumTotalWeightPct,
      tqqqTotalWeightPct: input.tqqqTotalWeightPct,
      triggerFlags: input.triggerFlags,
      fxRateCAD: input.fxRateCAD,
      priceSource: input.priceSource,
      unverifiedItems: input.unverifiedItems ?? [],
      rulebookVersion: input.rulebookVersion,
    };

    const row = await prisma.assetWeightSnapshot.upsert({
      where: { userId_date: { userId: input.userId, date } },
      create: data,
      update: data,
      select: { id: true },
    });

    const created = existing === null;
    log.info({
      event: created
        ? "audit.weightSnapshot.created"
        : "audit.weightSnapshot.updated",
      userId: input.userId,
      date: isoDate,
      snapshotId: row.id,
      durationMs: Date.now() - started,
    });
    return { ok: true, id: row.id, created };
  } catch (err) {
    log.error({
      event: "audit.weightSnapshot.failed",
      userId: input.userId,
      date: isoDate,
      durationMs: Date.now() - started,
      err: serializeError(err),
    });
    return { ok: false, id: null, created: false };
  }
}
