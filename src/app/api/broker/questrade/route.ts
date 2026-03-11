import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

async function getTokenResponse(refreshToken: string) {
  const url = `https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const existing = await prisma.brokerConnection.findFirst({
      where: { userId: user.id, broker: "questrade" },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      connected: existing?.status === "connected",
      status: existing?.status || "disconnected",
      lastSyncAt: existing?.lastSyncAt || null,
      lastSyncStatus: existing?.lastSyncStatus || null,
      accountLabel: existing?.accountLabel || null,
      hasStoredToken: !!existing?.encryptedRefreshToken,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load broker status" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json().catch(() => ({}));
    const providedRefreshToken = typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";

    let connection = await prisma.brokerConnection.findFirst({
      where: { userId: user.id, broker: "questrade" },
      orderBy: { createdAt: "asc" },
    });

    let refreshToken = providedRefreshToken;
    if (!refreshToken && connection?.encryptedRefreshToken) {
      refreshToken = decryptSecret(connection.encryptedRefreshToken);
    }

    if (!refreshToken) {
      return NextResponse.json({ error: "A Questrade refresh token is required" }, { status: 400 });
    }

    const tokenResult = await getTokenResponse(refreshToken);
    const status = tokenResult.ok ? "connected" : "error";
    const accountLabel = tokenResult.ok ? "Questrade" : null;
    const expiresAt = tokenResult.ok && tokenResult.data?.access_token_expires_in
      ? new Date(Date.now() + Number(tokenResult.data.access_token_expires_in) * 1000)
      : null;

    const encryptedRefreshToken = encryptSecret(refreshToken);

    if (connection) {
      connection = await prisma.brokerConnection.update({
        where: { id: connection.id },
        data: {
          status,
          accountLabel,
          encryptedRefreshToken,
          accessTokenExpiresAt: expiresAt,
          lastSyncStatus: tokenResult.ok ? "Token refresh succeeded" : `Token refresh failed (${tokenResult.status})`,
          lastSyncAt: tokenResult.ok ? new Date() : connection.lastSyncAt,
        },
      });
    } else {
      connection = await prisma.brokerConnection.create({
        data: {
          userId: user.id,
          broker: "questrade",
          status,
          accountLabel,
          encryptedRefreshToken,
          accessTokenExpiresAt: expiresAt,
          lastSyncStatus: tokenResult.ok ? "Token refresh succeeded" : `Token refresh failed (${tokenResult.status})`,
          lastSyncAt: tokenResult.ok ? new Date() : null,
        },
      });
    }

    return NextResponse.json({
      connected: tokenResult.ok,
      status: connection.status,
      lastSyncStatus: connection.lastSyncStatus,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
      apiBase: tokenResult.data?.api_server || null,
      hasStoredToken: true,
    }, { status: tokenResult.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to connect Questrade" }, { status: 500 });
  }
}
