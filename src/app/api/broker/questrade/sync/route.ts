import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { decryptSecret } from "@/lib/secrets";

async function refreshQuestradeToken(refreshToken: string) {
  const url = `https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function POST() {
  try {
    const user = await requireCurrentUser();
    const connection = await prisma.brokerConnection.findFirst({
      where: { userId: user.id, broker: "questrade" },
      orderBy: { createdAt: "asc" },
    });

    if (!connection?.encryptedRefreshToken) {
      return NextResponse.json({ error: "Questrade is not configured for this user" }, { status: 400 });
    }

    const refreshToken = decryptSecret(connection.encryptedRefreshToken);
    const tokenResult = await refreshQuestradeToken(refreshToken);

    if (!tokenResult.ok || !tokenResult.data?.api_server || !tokenResult.data?.access_token) {
      await prisma.brokerConnection.update({
        where: { id: connection.id },
        data: {
          status: "error",
          lastSyncStatus: `Token refresh failed (${tokenResult.status})`,
        },
      });
      return NextResponse.json({ error: "Failed to refresh Questrade token" }, { status: 400 });
    }

    const apiBase = String(tokenResult.data.api_server).replace(/\/$/, "");
    const accessToken = tokenResult.data.access_token as string;

    const accountsRes = await fetch(`${apiBase}/v1/accounts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const accountsData = await accountsRes.json();

    if (!accountsRes.ok || !Array.isArray(accountsData?.accounts)) {
      await prisma.brokerConnection.update({
        where: { id: connection.id },
        data: {
          status: "error",
          lastSyncStatus: `Accounts fetch failed (${accountsRes.status})`,
        },
      });
      return NextResponse.json({ error: "Failed to fetch Questrade accounts" }, { status: 400 });
    }

    const synced: string[] = [];
    for (const account of accountsData.accounts) {
      const accountNumber = String(account.number || account.accountNumber || "").trim() || null;
      const accountType = String(account.type || account.accountType || "Questrade").trim();
      const name = accountNumber ? `Questrade ${accountType} ${accountNumber}` : `Questrade ${accountType}`;

      const existing = accountNumber
        ? await prisma.account.findFirst({ where: { userId: user.id, accountNumber } })
        : null;

      if (existing) {
        await prisma.account.update({
          where: { id: existing.id },
          data: {
            name,
            broker: "questrade",
            accountType,
            baseCurrency: "CAD",
            isActive: true,
          },
        });
        synced.push(existing.id);
      } else {
        const created = await prisma.account.create({
          data: {
            userId: user.id,
            name,
            broker: "questrade",
            accountType,
            accountNumber,
            baseCurrency: "CAD",
            isActive: true,
          },
        });
        synced.push(created.id);
      }
    }

    await prisma.brokerConnection.update({
      where: { id: connection.id },
      data: {
        status: "connected",
        accountLabel: "Questrade",
        lastSyncAt: new Date(),
        lastSyncStatus: `Synced ${synced.length} account(s)`,
      },
    });

    return NextResponse.json({ success: true, syncedAccounts: synced.length });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to sync Questrade accounts" }, { status: 500 });
  }
}
