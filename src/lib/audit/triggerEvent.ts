/**
 * RulebookTriggerEvent audit helper.
 *
 * Tracks rulebook trigger lifecycle:
 *  - upsertTriggerEvent : when the daily detector sees a trigger active,
 *    refresh its context fields if an unresolved row already exists for
 *    (userId, triggerKind); otherwise create a new event row.
 *  - resolveTriggerEvent: when a previously-active trigger turns off, set
 *    resolvedAt on the most recent unresolved row. No-op if none.
 *
 * Phase 1: helper only. The cron writer is added in Phase 4.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

export type TriggerKind =
  | "hard_exit"
  | "soft_exit"
  | "crisis_t1"
  | "crisis_t2"
  | "case_a"
  | "case_b"
  | "sgov_below_target"
  | "sgov_below_floor"
  | "iaum_at_cap"
  | "cycle_armable"
  | "meltdown_phase"
  | (string & {});

export type TriggerSeverity =
  | "info"
  | "warn"
  | "action_required"
  | (string & {});

export interface UpsertTriggerEventInput {
  userId: string;
  triggerKind: TriggerKind;
  severity: TriggerSeverity;
  rulebookVersion: string;
  /** computeRulebookWeights() output snapshotted at detection. */
  weightsAtDetect: Prisma.InputJsonValue;
  /** computeXxxPlan() output if applicable; otherwise omit. */
  computedPlan?: Prisma.InputJsonValue | null;
  /** Soft reference to AssetWeightSnapshot.id; no FK. */
  weightsSnapshotId?: string | null;
}

export interface UpsertTriggerEventResult {
  ok: boolean;
  id: string | null;
  outcome: "created" | "updated" | "noop";
}

export interface ResolveTriggerEventInput {
  userId: string;
  triggerKind: TriggerKind;
  /** Defaults to now. */
  resolvedAt?: Date;
  /** Optional resolution metadata (set later in Phase 3 workflows). */
  resolutionAction?: string | null;
  resolutionNotes?: string | null;
}

export interface ResolveTriggerEventResult {
  ok: boolean;
  id: string | null;
  resolved: boolean;
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

export async function upsertTriggerEvent(
  input: UpsertTriggerEventInput,
): Promise<UpsertTriggerEventResult> {
  if (!isAuditEnabled()) {
    log.debug({
      event: "audit.trigger.disabled",
      userId: input.userId,
      triggerKind: input.triggerKind,
    });
    return { ok: true, id: null, outcome: "noop" };
  }

  const started = Date.now();
  try {
    // Look for an active event of the same kind. There SHOULD be at most one,
    // but `findFirst` with desc-detectedAt is defensive.
    const active = await prisma.rulebookTriggerEvent.findFirst({
      where: {
        userId: input.userId,
        triggerKind: input.triggerKind,
        resolvedAt: null,
      },
      select: { id: true },
      orderBy: { detectedAt: "desc" },
    });

    if (active) {
      const updateData: Prisma.RulebookTriggerEventUpdateInput = {
        severity: input.severity,
        rulebookVersion: input.rulebookVersion,
        weightsAtDetect: input.weightsAtDetect,
        weightsSnapshotId: input.weightsSnapshotId ?? null,
      };
      if (input.computedPlan != null) {
        updateData.computedPlan = input.computedPlan;
      }
      await prisma.rulebookTriggerEvent.update({
        where: { id: active.id },
        data: updateData,
      });
      log.info({
        event: "audit.trigger.updated",
        userId: input.userId,
        triggerKind: input.triggerKind,
        severity: input.severity,
        triggerId: active.id,
        durationMs: Date.now() - started,
      });
      return { ok: true, id: active.id, outcome: "updated" };
    }

    const createData: Prisma.RulebookTriggerEventCreateInput = {
      userId: input.userId,
      triggerKind: input.triggerKind,
      severity: input.severity,
      rulebookVersion: input.rulebookVersion,
      weightsAtDetect: input.weightsAtDetect,
      weightsSnapshotId: input.weightsSnapshotId ?? null,
    };
    if (input.computedPlan != null) {
      createData.computedPlan = input.computedPlan;
    }

    const row = await prisma.rulebookTriggerEvent.create({
      data: createData,
      select: { id: true },
    });
    log.info({
      event: "audit.trigger.created",
      userId: input.userId,
      triggerKind: input.triggerKind,
      severity: input.severity,
      triggerId: row.id,
      durationMs: Date.now() - started,
    });
    return { ok: true, id: row.id, outcome: "created" };
  } catch (err) {
    log.error({
      event: "audit.trigger.failed",
      userId: input.userId,
      triggerKind: input.triggerKind,
      durationMs: Date.now() - started,
      err: serializeError(err),
    });
    return { ok: false, id: null, outcome: "noop" };
  }
}

export async function resolveTriggerEvent(
  input: ResolveTriggerEventInput,
): Promise<ResolveTriggerEventResult> {
  if (!isAuditEnabled()) {
    log.debug({
      event: "audit.trigger.resolve.disabled",
      userId: input.userId,
      triggerKind: input.triggerKind,
    });
    return { ok: true, id: null, resolved: false };
  }

  const started = Date.now();
  try {
    const active = await prisma.rulebookTriggerEvent.findFirst({
      where: {
        userId: input.userId,
        triggerKind: input.triggerKind,
        resolvedAt: null,
      },
      select: { id: true },
      orderBy: { detectedAt: "desc" },
    });

    if (!active) {
      log.info({
        event: "audit.trigger.resolve.noop",
        userId: input.userId,
        triggerKind: input.triggerKind,
        durationMs: Date.now() - started,
      });
      return { ok: true, id: null, resolved: false };
    }

    await prisma.rulebookTriggerEvent.update({
      where: { id: active.id },
      data: {
        resolvedAt: input.resolvedAt ?? new Date(),
        resolutionAction: input.resolutionAction ?? null,
        resolutionNotes: input.resolutionNotes ?? null,
      },
    });
    log.info({
      event: "audit.trigger.resolved",
      userId: input.userId,
      triggerKind: input.triggerKind,
      triggerId: active.id,
      durationMs: Date.now() - started,
    });
    return { ok: true, id: active.id, resolved: true };
  } catch (err) {
    log.error({
      event: "audit.trigger.resolve.failed",
      userId: input.userId,
      triggerKind: input.triggerKind,
      durationMs: Date.now() - started,
      err: serializeError(err),
    });
    return { ok: false, id: null, resolved: false };
  }
}
