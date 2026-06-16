const STATIC_TARGET = { SCHD: 60, QLD: 40, SGOV: 0 } as const;

export function getGlidePath(age: number): { SCHD: number; QLD: number; SGOV: number } {
  void age;
  return { ...STATIC_TARGET };
}

export function getNextGlideStep(
  age: number,
): { fromAge: number; SCHD: number; QLD: number; SGOV: number } | null {
  void age;
  return null;
}

export function shouldAutoUpdateTargets(
  currentTargets: Record<string, number>,
  age: number,
): boolean {
  void age;
  return (
    (currentTargets.SCHD ?? 0) !== STATIC_TARGET.SCHD ||
    (currentTargets.QLD ?? 0) !== STATIC_TARGET.QLD ||
    (currentTargets.SGOV ?? 0) !== STATIC_TARGET.SGOV
  );
}

export function buildGlidepathTargets(age: number): Record<string, number> {
  void age;
  return { ...STATIC_TARGET };
}
