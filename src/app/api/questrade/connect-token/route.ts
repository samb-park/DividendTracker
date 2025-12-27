import { NextRequest, NextResponse } from "next/server";
import { exchangeRefreshTokenManually } from "@/lib/api/questrade";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, refreshToken } = body;

    if (!accountId || !refreshToken) {
      return NextResponse.json(
        { error: "accountId and refreshToken are required" },
        { status: 400 }
      );
    }

    // Verify account exists and is Questrade
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (account.broker !== "QUESTRADE") {
      return NextResponse.json(
        { error: "Account is not a Questrade account" },
        { status: 400 }
      );
    }

    await exchangeRefreshTokenManually(refreshToken, accountId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to connect with refresh token:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to connect" },
      { status: 500 }
    );
  }
}
