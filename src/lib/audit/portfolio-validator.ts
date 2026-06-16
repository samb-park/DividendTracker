export type AccountType = "TFSA" | "RRSP" | "NON_REG" | "FHSA" | "CASH" | string;

export interface Position {
  symbol: string;
  account: AccountType;
  quantity?: number;
  marketValue?: number;
  [key: string]: unknown;
}

export interface AuditViolation {
  rule: "TQQQ_TFSA_ONLY";
  severity: "CRITICAL";
  message: string;
  position: Position;
}

export interface AuditAlertPayload {
  type: "TQQQ_TFSA_ONLY";
  userId: string;
  severity: "critical";
  message: string;
  details: {
    violationCount: number;
    accounts: string;
  };
}

export function validateTQQQAccount(positions: Position[]): AuditViolation[] {
  return positions
    .filter((position) => position.symbol.toUpperCase() === "TQQQ")
    .filter((position) => position.account !== "TFSA")
    .map((position) => ({
      rule: "TQQQ_TFSA_ONLY" as const,
      severity: "CRITICAL" as const,
      message: `TQQQ found in ${position.account} account (must be TFSA only)`,
      position,
    }));
}

export function buildTqqqTfsaIsolationAlert(
  userId: string,
  positions: Position[],
): AuditAlertPayload | null {
  const violations = validateTQQQAccount(positions);
  if (violations.length === 0) return null;

  const accounts = Array.from(new Set(violations.map((violation) => String(violation.position.account)))).join(",");
  return {
    type: "TQQQ_TFSA_ONLY",
    userId,
    severity: "critical",
    message: `TQQQ TFSA only rule violation: ${violations.length} position(s) outside TFSA only account boundary.`,
    details: {
      violationCount: violations.length,
      accounts,
    },
  };
}
