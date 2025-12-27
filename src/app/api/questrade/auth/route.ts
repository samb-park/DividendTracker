import { NextRequest, NextResponse } from "next/server";
import { getQuestradeAuthUrl } from "@/lib/api/questrade";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const accountId = searchParams.get("accountId");

  if (!accountId) {
    return NextResponse.json(
      { error: "accountId is required" },
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

  try {
    const authUrl = getQuestradeAuthUrl(accountId);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Failed to generate auth URL:", error);
    return NextResponse.json(
      { error: "Failed to initiate Questrade authentication" },
      { status: 500 }
    );
  }
}
