import { prisma } from "@/lib/db";
import { DashboardClient } from "@/components/dashboard-client";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const portfolios = await prisma.portfolio.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      holdings: {
        include: { transactions: true },
      },
    },
  });

  const fxRate = parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35");
  const serialized = JSON.parse(JSON.stringify(portfolios));

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-amber-400 font-medium tracking-widest">PORTFOLIO</h1>
        <span className="text-muted-foreground text-xs">//</span>
        <span className="text-xs text-muted-foreground">HOLDINGS &amp; POSITIONS</span>
      </div>
      <DashboardClient initialPortfolios={serialized} fxRate={fxRate} />
    </div>
  );
}
