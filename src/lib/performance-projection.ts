export type ProjectionScenarioId = "base" | "pessimistic" | "worst";
export type BaseRateId = "2" | "4" | "6" | "8" | "10" | "12";
export type ProjectionSelection = BaseRateId | "all";

export interface BaseRateOption {
  id: BaseRateId;
  label: string;
  cagrPct: number;
  dataKey: "baseRate2" | "baseRate4" | "baseRate6" | "baseRate8" | "baseRate10" | "baseRate12";
  color: string;
  dash: number[];
  width: number;
}

export const BASE_RATE_OPTIONS: BaseRateOption[] = [
  { id: "2", label: "2%", cagrPct: 2, dataKey: "baseRate2", color: "#FF4444", dash: [5, 5], width: 2 },
  { id: "4", label: "4%", cagrPct: 4, dataKey: "baseRate4", color: "#FFD700", dash: [8, 4], width: 2 },
  { id: "6", label: "6%", cagrPct: 6, dataKey: "baseRate6", color: "#FF9500", dash: [10, 3], width: 2.5 },
  { id: "8", label: "8%", cagrPct: 8, dataKey: "baseRate8", color: "#00D9C0", dash: [12, 4], width: 2 },
  { id: "10", label: "10%", cagrPct: 10, dataKey: "baseRate10", color: "#B388FF", dash: [14, 3], width: 2 },
  { id: "12", label: "12%", cagrPct: 12, dataKey: "baseRate12", color: "#F472B6", dash: [16, 4], width: 2 },
];

export function getProjectionSelectionLabel(selection: ProjectionSelection): string {
  if (selection === "all") return "ALL";
  return BASE_RATE_OPTIONS.find((option) => option.id === selection)?.label ?? "6%";
}

export function getActiveBaseRateOptions(selection: ProjectionSelection): BaseRateOption[] {
  return selection === "all"
    ? BASE_RATE_OPTIONS
    : BASE_RATE_OPTIONS.filter((option) => option.id === selection);
}

export interface PerformanceProjectionSnapshot {
  date: string;
  totalCAD: number;
}

export interface ProjectionScenarioCagr {
  id: string;
  label?: string;
  cagrPct: number;
}

export interface PerformanceContributionEventCAD {
  date: string;
  amountCAD: number;
}

export interface PerformanceProjectionAssumptions {
  scenarioCagrsPct?: ProjectionScenarioCagr[];
  annualContribCAD?: number;
  /** Rulebook total recurring contribution stream in CAD/week. v4.4.2 default = Core 385 + SGOV 50 + QQQI 25 = 460. */
  weeklyContribCAD?: number;
  /** Actual ExternalDeposit/contribution cash flows in CAD. When present, BASE is computed from these cash flows only. */
  contributionEventsCAD?: PerformanceContributionEventCAD[];
}

export const PROJECTION_SCENARIO_FALLBACKS: Record<ProjectionScenarioId, number> = {
  base: 6,
  pessimistic: 4,
  worst: 2,
};

export const PROJECTION_SCENARIO_LABELS: Record<ProjectionScenarioId, string> = {
  base: "BASE",
  pessimistic: "PESS",
  worst: "WORST",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;
const RULEBOOK_WEEKLY_CONTRIB_CAD = 460;

function parseSnapshotDate(value: string): Date | null {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function yearsBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / (DAYS_PER_YEAR * MS_PER_DAY));
}

export function getProjectionScenarioCagrPct(
  assumptions: PerformanceProjectionAssumptions | null | undefined,
  scenarioId: ProjectionScenarioId,
): number {
  return assumptions?.scenarioCagrsPct?.find((scenario) => scenario.id === scenarioId)?.cagrPct
    ?? PROJECTION_SCENARIO_FALLBACKS[scenarioId];
}

export function getProjectionWeeklyContribCAD(
  assumptions: PerformanceProjectionAssumptions | null | undefined,
): number {
  const weekly = assumptions?.weeklyContribCAD;
  if (typeof weekly === "number" && Number.isFinite(weekly) && weekly > 0) return weekly;

  const annual = assumptions?.annualContribCAD;
  if (typeof annual === "number" && Number.isFinite(annual) && annual > 0) return annual / 52;

  return RULEBOOK_WEEKLY_CONTRIB_CAD;
}

function normalizedContributionEventsCAD(
  assumptions: PerformanceProjectionAssumptions | null | undefined,
): PerformanceContributionEventCAD[] {
  const events = assumptions?.contributionEventsCAD ?? [];
  return events
    .map((event) => ({
      date: event.date,
      amountCAD: Number(event.amountCAD),
      parsedDate: parseSnapshotDate(event.date),
    }))
    .filter((event): event is PerformanceContributionEventCAD & { parsedDate: Date } => (
      !!event.parsedDate && Number.isFinite(event.amountCAD) && event.amountCAD !== 0
    ))
    .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime())
    .map(({ date, amountCAD }) => ({ date, amountCAD }));
}

function compoundedActualContributionsCAD(args: {
  contributionEventsCAD: PerformanceContributionEventCAD[];
  snapshotDate: Date;
  annualCagr: number;
}): number {
  let total = 0;
  for (const event of args.contributionEventsCAD) {
    const contributionDate = parseSnapshotDate(event.date);
    if (!contributionDate || contributionDate > args.snapshotDate) continue;
    total += event.amountCAD * Math.pow(1 + args.annualCagr, yearsBetween(contributionDate, args.snapshotDate));
  }
  return total;
}

function compoundedScheduledContributionsCAD(args: {
  anchorDate: Date;
  snapshotDate: Date;
  weeklyContribCAD: number;
  annualCagr: number;
}): number {
  if (args.weeklyContribCAD <= 0 || args.snapshotDate < args.anchorDate) return 0;

  let total = 0;
  for (let contributionDate = args.anchorDate;
    contributionDate <= args.snapshotDate;
    contributionDate = new Date(contributionDate.getTime() + 7 * MS_PER_DAY)
  ) {
    const years = yearsBetween(contributionDate, args.snapshotDate);
    total += args.weeklyContribCAD * Math.pow(1 + args.annualCagr, years);
  }
  return total;
}

export function buildProjectedPortfolioSeriesForRate(
  snapshots: PerformanceProjectionSnapshot[],
  assumptions: PerformanceProjectionAssumptions | null | undefined,
  cagrPct: number,
): Array<number | null> {
  if (snapshots.length < 2) return snapshots.map(() => null);

  const anchorDate = parseSnapshotDate(snapshots[0].date);
  if (!anchorDate) return snapshots.map(() => null);

  const cagr = cagrPct / 100;
  const contributionEventsCAD = normalizedContributionEventsCAD(assumptions);
  const weeklyContribCAD = getProjectionWeeklyContribCAD(assumptions);
  const anchorValueCAD = Number(snapshots[0].totalCAD);
  if (!Number.isFinite(anchorValueCAD)) return snapshots.map(() => null);

  return snapshots.map((snapshot) => {
    const snapshotDate = parseSnapshotDate(snapshot.date);
    if (!snapshotDate) return null;
    const anchorGrowthCAD = anchorValueCAD * Math.pow(1 + cagr, yearsBetween(anchorDate, snapshotDate));

    if (contributionEventsCAD.length > 0) {
      return compoundedActualContributionsCAD({
        contributionEventsCAD,
        snapshotDate,
        annualCagr: cagr,
      });
    }

    return anchorGrowthCAD + compoundedScheduledContributionsCAD({
      anchorDate: new Date(anchorDate.getTime() + 7 * MS_PER_DAY),
      snapshotDate,
      weeklyContribCAD,
      annualCagr: cagr,
    });
  });
}

export function buildBaselineReturnSeriesForRate(
  snapshots: PerformanceProjectionSnapshot[],
  baselinePortfolioValueCAD: number,
  cagrPct: number,
): Array<number | null> {
  if (snapshots.length === 0) return [];

  const anchorDate = parseSnapshotDate(snapshots[0].date);
  const baseline = Number(baselinePortfolioValueCAD);
  const cagr = Number(cagrPct) / 100;
  if (!anchorDate || !Number.isFinite(baseline) || baseline < 0 || !Number.isFinite(cagr)) {
    return snapshots.map(() => null);
  }

  return snapshots.map((snapshot) => {
    const snapshotDate = parseSnapshotDate(snapshot.date);
    if (!snapshotDate) return null;
    return baseline * Math.pow(1 + cagr, yearsBetween(anchorDate, snapshotDate));
  });
}

export function buildProjectedPortfolioSeries(
  snapshots: PerformanceProjectionSnapshot[],
  assumptions: PerformanceProjectionAssumptions | null | undefined,
  scenarioId: ProjectionScenarioId,
): Array<number | null> {
  return buildProjectedPortfolioSeriesForRate(
    snapshots,
    assumptions,
    getProjectionScenarioCagrPct(assumptions, scenarioId),
  );
}
