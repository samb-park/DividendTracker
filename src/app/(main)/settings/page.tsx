import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { SettingsClient } from "@/components/settings-client";
import { ErrorBoundary } from "@/components/error-boundary";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  const portfolios = await prisma.portfolio.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, accountType: true, cashCAD: true, cashUSD: true },
  });

  const serialized = JSON.parse(JSON.stringify(portfolios));

  return (
    <div>
      <ErrorBoundary label="SETTINGS">
        <SettingsClient portfolios={serialized} isAdmin={isAdmin} />
      </ErrorBoundary>
    </div>
  );
}
