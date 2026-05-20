export type YAxisDomain = [number, number];

interface DomainOptions {
  paddingRatio?: number;
  minRangeRatio?: number;
  minRangeCAD?: number;
  roundToCAD?: number;
}

const DEFAULT_OPTIONS: Required<DomainOptions> = {
  paddingRatio: 0.15,
  minRangeRatio: 0.05,
  minRangeCAD: 1_000,
  roundToCAD: 1_000,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function computePerformanceYAxisDomain<T extends Record<string, unknown>>(
  rows: T[],
  visibleSeries: readonly string[],
  options: DomainOptions = {},
): YAxisDomain {
  const { paddingRatio, minRangeRatio, minRangeCAD, roundToCAD } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const values = rows.flatMap((row) =>
    visibleSeries
      .map((key) => row[key])
      .filter(isFiniteNumber),
  );

  if (values.length === 0) return [0, roundToCAD];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawRange = max - min;
  const minRange = Math.max(Math.abs(max) * minRangeRatio, minRangeCAD);
  const displayRange = Math.max(rawRange, minRange);
  const center = (min + max) / 2;
  const expandedMin = center - displayRange / 2;
  const expandedMax = center + displayRange / 2;
  const padding = displayRange * paddingRatio;

  const yMin = Math.max(0, Math.floor((expandedMin - padding) / roundToCAD) * roundToCAD);
  const yMax = Math.ceil((expandedMax + padding) / roundToCAD) * roundToCAD;

  return yMax > yMin ? [yMin, yMax] : [yMin, yMin + roundToCAD];
}
