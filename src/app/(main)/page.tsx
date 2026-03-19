import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DashboardClient } from "@/components/dashboard-client";
import { ErrorBoundary } from "@/components/error-boundary";
import { DashboardSkeleton } from "@/components/skeleton";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");
  const userId = session.user.id;

  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { holdings: { include: { transactions: true } } },
  });

  const fxRate = parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35");
  // JSON round-trip serializes Prisma Decimal fields to strings for client components
  const serialized = JSON.parse(JSON.stringify(portfolios));

  return (
    <div>
      <ErrorBoundary label="DASHBOARD">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardClient initialPortfolios={serialized} fxRate={fxRate} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
