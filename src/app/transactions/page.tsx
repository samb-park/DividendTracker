import { prisma } from "@/lib/db";
import { TransactionsClient } from "@/components/transactions-client";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const transactions = await prisma.transaction.findMany({
    orderBy: { date: "desc" },
    include: { holding: { include: { portfolio: true } } },
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-amber-400 font-medium tracking-widest">TRANSACTION LOG</h1>
        <span className="text-muted-foreground text-xs">//</span>
        <span className="text-xs text-muted-foreground">{transactions.length} RECORDS</span>
      </div>
      <TransactionsClient initialTransactions={JSON.parse(JSON.stringify(transactions))} />
    </div>
  );
}
