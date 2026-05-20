import { redirect } from "next/navigation";

export default function LegacySettingsRedirect() {
  redirect("/v1/settings");
}
