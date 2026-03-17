import { prisma } from "@/lib/db";
import { SettingsClient } from "@/components/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const portfolios = await prisma.portfolio.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const serialized = JSON.parse(JSON.stringify(portfolios));

  return (
    <div>
      <SettingsClient portfolios={serialized} />
    </div>
  );
}
