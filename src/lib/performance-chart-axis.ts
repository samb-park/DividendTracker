export interface PerformanceDeltaAxisDomain {
  min: number;
  max: number;
}

export function computePerformanceDeltaAxisDomain(values: Array<number | null | undefined>): PerformanceDeltaAxisDomain {
  const finiteValues = values.filter((value): value is number => (
    typeof value === "number" && Number.isFinite(value)
  ));
  const max = finiteValues.length > 0 ? Math.max(...finiteValues) : 0;

  return {
    min: 0,
    max: max > 0 ? Math.ceil(max * 1.05) : 1,
  };
}
