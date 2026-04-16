const GLIDE_PATH = [
  { fromAge: 65, SCHD: 90, QLD: 0, SGOV: 10 },
  { fromAge: 60, SCHD: 85, QLD: 0, SGOV: 15 },
  { fromAge: 55, SCHD: 82, QLD: 10, SGOV: 8 },
  { fromAge: 50, SCHD: 75, QLD: 20, SGOV: 5 },
  { fromAge: 0, SCHD: 70, QLD: 30, SGOV: 0 },
] as const;

export function getGlidePath(age: number): { SCHD: number; QLD: number; SGOV: number } {
  for (const step of GLIDE_PATH) {
    if (age >= step.fromAge) {
      return { SCHD: step.SCHD, QLD: step.QLD, SGOV: step.SGOV };
    }
  }
  const last = GLIDE_PATH[GLIDE_PATH.length - 1];
  return { SCHD: last.SCHD, QLD: last.QLD, SGOV: last.SGOV };
}

export function getNextGlideStep(
  age: number,
): { fromAge: number; SCHD: number; QLD: number; SGOV: number } | null {
  let currentFromAge = -1;
  for (const step of GLIDE_PATH) {
    if (age >= step.fromAge) {
      currentFromAge = step.fromAge;
      break;
    }
  }

  let next: (typeof GLIDE_PATH)[number] | null = null;
  for (const step of GLIDE_PATH) {
    if (step.fromAge > currentFromAge) {
      if (next === null || step.fromAge < next.fromAge) {
        next = step;
      }
    }
  }

  if (!next) return null;
  return { fromAge: next.fromAge, SCHD: next.SCHD, QLD: next.QLD, SGOV: next.SGOV };
}

export function shouldAutoUpdateTargets(
  currentTargets: Record<string, number>,
  age: number,
): boolean {
  const target = getGlidePath(age);
  const current = {
    SCHD: currentTargets.SCHD ?? 0,
    QLD: currentTargets.QLD ?? 0,
    SGOV: currentTargets.SGOV ?? 0,
  };
  return (
    current.SCHD !== target.SCHD ||
    current.QLD !== target.QLD ||
    current.SGOV !== target.SGOV
  );
}

export function buildGlidepathTargets(age: number): Record<string, number> {
  const target = getGlidePath(age);
  return { SCHD: target.SCHD, QLD: target.QLD, SGOV: target.SGOV };
}
