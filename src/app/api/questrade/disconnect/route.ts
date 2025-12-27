import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    // Delete the Questrade token
    await prisma.questradeToken.deleteMany({
      where: { accountId },
    });

    // Clear Questrade-related fields from account
    await prisma.account.update({
      where: { id: accountId },
      data: {
        questradeAccountNumber: null,
        lastSyncedAt: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to disconnect Questrade:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Questrade" },
      { status: 500 }
    );
  }
}
