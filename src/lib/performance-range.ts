interface DateSource {
  date: Date | string;
}

function dateKey(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export function buildPerformanceValuationDates(args: {
  snapshots: DateSource[];
  transactions: DateSource[];
  cashTransactions: DateSource[];
  since?: Date;
}): string[] {
  const sinceKey = args.since ? dateKey(args.since) : undefined;
  const snapshotDates = args.snapshots.map((snapshot) => dateKey(snapshot.date));
  const eventDates = [
    ...args.transactions.map((transaction) => dateKey(transaction.date)),
    ...args.cashTransactions.map((cashTransaction) => dateKey(cashTransaction.date)),
  ].filter((date) => !sinceKey || date >= sinceKey);

  return Array.from(new Set([...snapshotDates, ...eventDates])).sort();
}
