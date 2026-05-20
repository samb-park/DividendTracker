import { auth } from "@/auth";
import { fetchV2Settings } from "@/lib/v2-data";
import { V2SettingsClient } from "@/components/v2/v2-settings-client";

export const dynamic = "force-dynamic";

export default async function V2SettingsPage() {
  const session = await auth();
  const data = await fetchV2Settings(session.user.id);
  return <V2SettingsClient initial={data} />;
}
