import { prisma } from "@/lib/db";
import { DashboardClient } from "@/components/dashboard-client";

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
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-amber-400 font-medium tracking-widest">PORTFOLIO DASHBOARD</h1>
        <span className="text-muted-foreground text-xs">//</span>
        <span className="text-xs text-muted-foreground">REAL-TIME MARKET DATA</span>
      </div>
      <DashboardClient initialPortfolios={serialized} fxRate={fxRate} />
    </div>
  );
}
