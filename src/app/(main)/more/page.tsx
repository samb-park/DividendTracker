import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getFxRate } from "@/lib/price";
import { MoreClient, type Txn } from "@/components/more-client";
import { ErrorBoundary } from "@/components/error-boundary";

export const dynamic = "force-dynamic";

export default async function MorePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");
  const userId = session.user.id;

  const [txnsRaw, fx] = await Promise.all([
    prisma.transaction.findMany({
      where: { holding: { portfolio: { userId } } },
      orderBy: { date: "desc" },
      include: { holding: { include: { portfolio: true } } },
    }),
    getFxRate().catch(() => ({ rate: parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35"), fallback: true })),
  ]);

  // Serialize Prisma Decimal + Date fields for the client component
  const txns: Txn[] = JSON.parse(JSON.stringify(
    txnsRaw.map(t => ({
      id: t.id,
      action: t.action,
      date: t.date.toISOString(),
      quantity: t.quantity.toString(),
      price: t.price.toString(),
      commission: t.commission.toString(),
      notes: t.notes,
      holding: {
        ticker: t.holding.ticker,
        currency: t.holding.currency,
        portfolio: { name: t.holding.portfolio.name },
      },
    }))
  ));

  return (
    <ErrorBoundary label="MORE">
      <MoreClient initialTxns={txns} initialFxRate={fx.rate} />
    </ErrorBoundary>
  );
}
