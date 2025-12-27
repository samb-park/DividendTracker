import { NextRequest, NextResponse } from "next/server";
import { QuestradeClient } from "@/lib/api/questrade";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const accountId = searchParams.get("accountId");

  if (!accountId) {
    return NextResponse.json(
      { error: "accountId is required" },
      { status: 400 }
    );
  }

  try {
    const client = await QuestradeClient.fromAccountId(accountId);

    if (!client) {
      return NextResponse.json(
        { error: "Questrade not connected. Please authenticate first." },
        { status: 401 }
      );
    }

    const accounts = await client.getAccounts();
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Failed to fetch Questrade accounts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
