import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { decryptSecret } from "@/lib/secrets";
import { CurrencyCode, TransactionAction, TransactionSource } from "@prisma/client";

async function refreshQuestradeToken(refreshToken: string) {
  const url = `https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function mapAction(action: string, description?: string | null): TransactionAction {
  const normalized = action.toLowerCase();
  const desc = (description || "").toLowerCase();
  if (normalized.includes("buy")) return TransactionAction.BUY;
  if (normalized.includes("sell")) return TransactionAction.SELL;
  if (normalized.includes("div") || desc.includes("dividend")) return TransactionAction.DIVIDEND;
  if (normalized.includes("reinv") || desc.includes("reinvest") || desc.includes("drip")) return TransactionAction.REINVEST;
  if (normalized.includes("deposit") || desc.includes("deposit") || desc.includes("contribution")) return TransactionAction.DEPOSIT;
  if (normalized.includes("withdraw") || desc.includes("withdraw")) return TransactionAction.WITHDRAWAL;
  if (normalized.includes("interest") || desc.includes("interest")) return TransactionAction.INTEREST;
  if (normalized.includes("fee") || desc.includes("fee")) return TransactionAction.FEE;
  return TransactionAction.DEPOSIT;
}

function mapCurrency(currency?: string | null): CurrencyCode {
  return currency === "USD" ? CurrencyCode.USD : CurrencyCode.CAD;
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
        data: { status: "error", lastSyncStatus: `Token refresh failed (${tokenResult.status})` },
      });
      return NextResponse.json({ error: "Failed to refresh Questrade token" }, { status: 400 });
    }

    const apiBase = String(tokenResult.data.api_server).replace(/\/$/, "");
    const accessToken = tokenResult.data.access_token as string;

    const accounts = await prisma.account.findMany({
      where: { userId: user.id, broker: "questrade", isActive: true },
      orderBy: { createdAt: "asc" },
    });

    let inserted = 0;
    let updated = 0;

    for (const account of accounts) {
      if (!account.accountNumber) continue;
      const res = await fetch(`${apiBase}/v1/accounts/${account.accountNumber}/activities`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data?.activities)) continue;

      for (const activity of data.activities) {
        const externalId = String(activity.tradeId || activity.transactionId || activity.id || `${account.accountNumber}:${activity.transactionDate}:${activity.action}:${activity.symbol || ''}:${activity.netAmount || ''}`);
        const transactionDate = new Date(activity.transactionDate || activity.tradeDate || activity.date || Date.now());
        const settlementDate = new Date(activity.settlementDate || activity.transactionDate || activity.tradeDate || Date.now());
        const symbol = activity.symbol ? String(activity.symbol).trim().toUpperCase() : null;
        const description = String(activity.description || activity.action || "Questrade activity");
        const action = mapAction(String(activity.action || description), description);
        const existing = await prisma.transaction.findFirst({
          where: { source: TransactionSource.questrade_api, externalId },
          select: { id: true },
        });

        const payload = {
          accountId: account.id,
          source: TransactionSource.questrade_api,
          externalId,
          transactionDate,
          settlementDate,
          action,
          activityType: activity.type ? String(activity.type) : null,
          symbol,
          normalizedSymbol: symbol,
          description,
          quantity: activity.quantity != null ? Number(activity.quantity) : null,
          price: activity.price != null ? Number(activity.price) : null,
          grossAmount: activity.grossAmount != null ? Number(activity.grossAmount) : null,
          commission: activity.commission != null ? Number(activity.commission) : null,
          netAmount: activity.netAmount != null ? Number(activity.netAmount) : null,
          currency: mapCurrency(activity.currency),
          cadEquivalent: activity.netAmount != null && activity.currency === "CAD" ? Number(activity.netAmount) : null,
          notes: null,
        };

        if (existing) {
          await prisma.transaction.update({ where: { id: existing.id }, data: payload });
          updated += 1;
        } else {
          await prisma.transaction.create({ data: payload });
          inserted += 1;
        }
      }
    }

    const syncRun = await prisma.syncRun.create({
      data: {
        brokerConnectionId: connection.id,
        status: "success",
        startedAt: new Date(),
        finishedAt: new Date(),
        insertedCount: inserted,
        updatedCount: updated,
      },
    });

    await prisma.brokerConnection.update({
      where: { id: connection.id },
      data: {
        status: "connected",
        lastSyncAt: new Date(),
        lastSyncStatus: `Transactions sync complete (${inserted} inserted, ${updated} updated)`,
      },
    });

    return NextResponse.json({ success: true, inserted, updated, syncRunId: syncRun.id });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to sync Questrade transactions" }, { status: 500 });
  }
}
