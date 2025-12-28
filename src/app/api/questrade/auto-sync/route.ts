import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncQuestradeAccount } from "@/lib/api/questrade";

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find all accounts with Questrade tokens that need syncing
    const accountsWithTokens = await prisma.account.findMany({
      where: {
        userId: session.user.id,
        questradeToken: {
          isNot: null,
        },
      },
      include: {
        questradeToken: true,
      },
    });

    const now = new Date();
    const syncResults: { accountId: string; synced: boolean; error?: string }[] = [];

    for (const account of accountsWithTokens) {
      const lastSync = account.lastSyncedAt;
      const needsSync = !lastSync || now.getTime() - lastSync.getTime() > ONE_HOUR_MS;

      if (needsSync) {
        try {
          await syncQuestradeAccount(account.id, false); // Don't sync transactions for auto-sync
          syncResults.push({ accountId: account.id, synced: true });
        } catch (error) {
          console.error(`Auto-sync failed for account ${account.id}:`, error);
          syncResults.push({
            accountId: account.id,
            synced: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      } else {
        syncResults.push({ accountId: account.id, synced: false });
      }
    }

    const syncedCount = syncResults.filter((r) => r.synced).length;

    return NextResponse.json({
      success: true,
      syncedCount,
      results: syncResults,
    });
  } catch (error) {
    console.error("Auto-sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auto-sync failed" },
      { status: 500 }
    );
  }
}
