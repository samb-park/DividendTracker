import { SettingsClient } from "@/components/settings-client";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-amber-400 font-medium tracking-widest">SETTINGS</h1>
        <span className="text-muted-foreground text-xs">//</span>
        <span className="text-xs text-muted-foreground">BROKER &amp; APP CONFIG</span>
      </div>
      <SettingsClient />
    </div>
  );
}
