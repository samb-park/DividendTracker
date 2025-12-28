"use client";

import { SessionProvider } from "next-auth/react";
import { AutoSyncProvider } from "@/components/auto-sync-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AutoSyncProvider>{children}</AutoSyncProvider>
    </SessionProvider>
  );
}
