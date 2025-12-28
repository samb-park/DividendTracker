"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

const AUTO_SYNC_KEY = "questrade_auto_sync_checked";

export function AutoSyncProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) {
      return;
    }

    // Check if we already ran auto-sync in this session
    const alreadyChecked = sessionStorage.getItem(AUTO_SYNC_KEY);
    if (alreadyChecked) {
      return;
    }

    // Mark as checked to prevent duplicate calls
    sessionStorage.setItem(AUTO_SYNC_KEY, Date.now().toString());

    // Run auto-sync in background
    fetch("/api/questrade/auto-sync", {
      method: "POST",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.syncedCount > 0) {
          console.log(`Auto-synced ${data.syncedCount} Questrade account(s)`);
        }
      })
      .catch((error) => {
        console.error("Auto-sync failed:", error);
      });
  }, [session, status]);

  return <>{children}</>;
}
