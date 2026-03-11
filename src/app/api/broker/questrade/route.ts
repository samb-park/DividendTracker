import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";

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
      connected: !!existing,
      status: existing?.status || "disconnected",
      lastSyncAt: existing?.lastSyncAt || null,
      lastSyncStatus: existing?.lastSyncStatus || null,
      accountLabel: existing?.accountLabel || null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load broker status" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await requireCurrentUser();
    const refreshToken = process.env.QUESTRADE_REFRESH_TOKEN;

    if (!refreshToken) {
      return NextResponse.json({ error: "QUESTRADE_REFRESH_TOKEN is not configured" }, { status: 400 });
    }

    const tokenResult = await getTokenResponse(refreshToken);
    const status = tokenResult.ok ? "connected" : "error";
    const accountLabel = tokenResult.ok ? "Questrade" : null;
    const expiresAt = tokenResult.ok && tokenResult.data?.access_token_expires_in
      ? new Date(Date.now() + Number(tokenResult.data.access_token_expires_in) * 1000)
      : null;

    const connection = await prisma.brokerConnection.upsert({
      where: {
        id: (await prisma.brokerConnection.findFirst({ where: { userId: user.id, broker: "questrade" }, select: { id: true } }))?.id || "__new__",
      },
      update: {
        status,
        accountLabel,
        encryptedRefreshToken: refreshToken,
        accessTokenExpiresAt: expiresAt,
        lastSyncStatus: tokenResult.ok ? "Token refresh succeeded" : `Token refresh failed (${tokenResult.status})`,
      },
      create: {
        userId: user.id,
        broker: "questrade",
        status,
        accountLabel,
        encryptedRefreshToken: refreshToken,
        accessTokenExpiresAt: expiresAt,
        lastSyncStatus: tokenResult.ok ? "Token refresh succeeded" : `Token refresh failed (${tokenResult.status})`,
      },
    }).catch(async () => {
      const existing = await prisma.brokerConnection.findFirst({ where: { userId: user.id, broker: "questrade" } });
      if (!existing) throw new Error("CONNECT_UPSERT_FAILED");
      return prisma.brokerConnection.update({
        where: { id: existing.id },
        data: {
          status,
          accountLabel,
          encryptedRefreshToken: refreshToken,
          accessTokenExpiresAt: expiresAt,
          lastSyncStatus: tokenResult.ok ? "Token refresh succeeded" : `Token refresh failed (${tokenResult.status})`,
        },
      });
    });

    return NextResponse.json({
      connected: tokenResult.ok,
      status: connection.status,
      lastSyncStatus: connection.lastSyncStatus,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
      apiBase: tokenResult.data?.api_server || null,
    }, { status: tokenResult.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to connect Questrade" }, { status: 500 });
  }
}
