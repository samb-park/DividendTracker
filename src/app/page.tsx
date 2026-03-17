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
      <DashboardClient initialPortfolios={serialized} fxRate={fxRate} />
    </div>
  );
}
