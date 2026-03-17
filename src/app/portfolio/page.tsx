import { prisma } from "@/lib/db";
import { PortfolioClient } from "@/components/portfolio-client";

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
      <PortfolioClient initialPortfolios={serialized} fxRate={fxRate} />
    </div>
  );
}
