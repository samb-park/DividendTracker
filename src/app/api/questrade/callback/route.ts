import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/api/questrade";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // This is the accountId
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error) {
    console.error("Questrade OAuth error:", error);
    return NextResponse.redirect(
      `${appUrl}/accounts?error=questrade_auth_failed`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/accounts?error=missing_parameters`
    );
  }

  try {
    await exchangeCodeForToken(code, state);
    return NextResponse.redirect(
      `${appUrl}/accounts/${state}?success=questrade_connected`
    );
  } catch (err) {
    console.error("Failed to exchange code for token:", err);
    return NextResponse.redirect(
      `${appUrl}/accounts/${state}?error=token_exchange_failed`
    );
  }
}
