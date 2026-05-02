export const fmtCAD = (n: number, opts?: { compact?: boolean }) => {
  if (!isFinite(n)) return "—";
  const v = n;
  if (opts?.compact && Math.abs(v) >= 10000) {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);
  }
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(v);
};

export const fmtUSD = (n: number) => {
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(n);
};

export const fmtPct = (n: number, decimals = 2) => {
  if (!isFinite(n)) return "—";
  return `${n.toFixed(decimals)}%`;
};

export const fmtSignedPct = (n: number, decimals = 2) => {
  if (!isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
};

export const fmtShares = (n: number) => {
  if (!isFinite(n)) return "—";
  // Show fractional shares only when present
  const rounded = Math.round(n * 1e6) / 1e6;
  return Number.isInteger(rounded)
    ? rounded.toString()
    : rounded.toFixed(Math.min(6, (rounded.toString().split(".")[1]?.length ?? 0)));
};
