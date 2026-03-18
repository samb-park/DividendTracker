import { prisma } from "@/lib/db";
import { SettingsClient } from "@/components/settings-client";
import { ErrorBoundary } from "@/components/error-boundary";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const portfolios = await prisma.portfolio.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, cashCAD: true, cashUSD: true },
  });

  const serialized = JSON.parse(JSON.stringify(portfolios));

  return (
    <div>
      <ErrorBoundary label="SETTINGS">
        <SettingsClient portfolios={serialized} />
      </ErrorBoundary>
    </div>
  );
}
