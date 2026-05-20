import { auth } from "@/auth";
import { fetchV2Allocation } from "@/lib/v2-data";
import { V2SummaryClient } from "@/components/v2/v2-summary-client";

export const dynamic = "force-dynamic";

export default async function V2SummaryPage() {
  const session = await auth();

  const data = await fetchV2Allocation(session.user.id);
  return <V2SummaryClient data={data} />;
}
