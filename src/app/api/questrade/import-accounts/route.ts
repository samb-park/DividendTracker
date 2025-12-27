import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth-helper";
import { QuestradeClient, syncQuestradeAccount } from "@/lib/api/questrade";

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { sourceAccountId, selectedAccounts } = body;

    if (!sourceAccountId) {
      return NextResponse.json(
        { error: "sourceAccountId is required" },
        { status: 400 }
      );
    }

    if (
      !selectedAccounts ||
      !Array.isArray(selectedAccounts) ||
      selectedAccounts.length === 0
    ) {
      return NextResponse.json(
        { error: "selectedAccounts array is required" },
        { status: 400 }
      );
    }

    // Get Questrade client from source account
    const client = await QuestradeClient.fromAccountId(sourceAccountId);

    if (!client) {
      return NextResponse.json(
        { error: "Questrade not connected on source account" },
        { status: 401 }
      );
    }

    // Get source account to copy token (verify ownership)
    const sourceAccount = await prisma.account.findFirst({
      where: { id: sourceAccountId, userId },
      include: { questradeToken: true },
    });

    if (!sourceAccount || !sourceAccount.questradeToken) {
      return NextResponse.json(
        { error: "Source account token not found" },
        { status: 404 }
      );
    }

    // Get all Questrade accounts to validate
    const qtAccounts = await client.getAccounts();
    const qtAccountMap = new Map(qtAccounts.map((a) => [a.number, a]));

    const createdAccounts: Array<{
      id: string;
      name: string;
      questradeAccountNumber: string;
      holdingsCount?: number;
      transactionsImported?: number;
    }> = [];

    for (const selected of selectedAccounts) {
      const { number, type, currency } = selected;

      // Validate account exists in Questrade
      const qtAccount = qtAccountMap.get(number);
      if (!qtAccount) {
        continue;
      }

      // Check if account with this Questrade number already exists for this user
      const existing = await prisma.account.findFirst({
        where: { questradeAccountNumber: number, userId },
      });

      if (existing) {
        // Update existing account's token if needed
        continue;
      }

      // Create new account
      const newAccount = await prisma.account.create({
        data: {
          userId,
          broker: "QUESTRADE",
          name: `Questrade ${type}`,
          currency: currency || "CAD",
          questradeAccountNumber: number,
        },
      });

      // Copy token to new account
      await prisma.questradeToken.create({
        data: {
          accountId: newAccount.id,
          accessToken: sourceAccount.questradeToken.accessToken,
          refreshToken: sourceAccount.questradeToken.refreshToken,
          apiServer: sourceAccount.questradeToken.apiServer,
          expiresAt: sourceAccount.questradeToken.expiresAt,
        },
      });

      // Auto-sync the new account
      let syncResult = { holdingsCount: 0, transactionsImported: 0 };
      try {
        syncResult = await syncQuestradeAccount(newAccount.id, true);
      } catch (syncError) {
        console.error(
          `Failed to sync account ${newAccount.id}:`,
          syncError
        );
        // Continue even if sync fails - account is still created
      }

      createdAccounts.push({
        id: newAccount.id,
        name: newAccount.name,
        questradeAccountNumber: number,
        holdingsCount: syncResult.holdingsCount,
        transactionsImported: syncResult.transactionsImported,
      });
    }

    return NextResponse.json({
      success: true,
      created: createdAccounts,
      count: createdAccounts.length,
    });
  } catch (error) {
    console.error("Failed to import Questrade accounts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import" },
      { status: 500 }
    );
  }
}
