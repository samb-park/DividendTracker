import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { DashboardClient } from "@/components/dashboard-client";
import { ErrorBoundary } from "@/components/error-boundary";

export const dynamic = "force-dynamic";

export default async function Home() {
  const portfolios = await prisma.portfolio.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      holdings: {
        include: { transactions: true },
      },
    },
  });

  const fxRate = parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35");
  // JSON round-trip serializes Prisma Decimal fields to strings for client components
  const serialized = JSON.parse(JSON.stringify(portfolios));

  return (
    <div>
      <ErrorBoundary label="DASHBOARD">
        <Suspense fallback={<div className="text-muted-foreground text-xs text-center py-12 tracking-wide">LOADING...</div>}>
          <DashboardClient initialPortfolios={serialized} fxRate={fxRate} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
