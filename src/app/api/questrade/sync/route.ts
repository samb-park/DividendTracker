import { NextRequest, NextResponse } from "next/server";
import { syncQuestradeAccount } from "@/lib/api/questrade";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, syncTransactions = true } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const result = await syncQuestradeAccount(accountId, syncTransactions);

    return NextResponse.json({
      success: true,
      holdingsCount: result.holdingsCount,
      transactionsImported: result.transactionsImported,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to sync Questrade data:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync" },
      { status: 500 }
    );
  }
}
