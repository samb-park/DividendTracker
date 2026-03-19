import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PortfolioClient } from "@/components/portfolio-client";
import { ErrorBoundary } from "@/components/error-boundary";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");
  const userId = session.user.id;

  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { holdings: { include: { transactions: true } } },
  });

  const fxRate = parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35");
  const serialized = JSON.parse(JSON.stringify(portfolios));

  return (
    <div>
      <ErrorBoundary label="PORTFOLIO">
        <Suspense fallback={<div className="text-muted-foreground text-xs text-center py-12 tracking-wide">LOADING...</div>}>
          <PortfolioClient initialPortfolios={serialized} fxRate={fxRate} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
