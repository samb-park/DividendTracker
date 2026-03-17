import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  exchangeRefreshToken,
  getAccounts,
  getPositions,
  getActivities,
  QtActivity,
} from "@/lib/questrade";

export const dynamic = "force-dynamic";

// Map Questrade account types to portfolio names
function portfolioName(accountType: string, accountNumber: string): string {
  const typeMap: Record<string, string> = {
    TFSA: "TFSA",
    RRSP: "RRSP",
    FHSA: "FHSA",
    Margin: "Margin",
    Individual: "Margin",
    Cash: "Cash",
    RESP: "RESP",
  };
  return `${typeMap[accountType] ?? accountType} (${accountNumber.slice(-4)})`;
}

// Map Questrade activity action to our TransactionAction
function mapAction(action: string): "BUY" | "SELL" | null {
  if (action === "Buy") return "BUY";
  if (action === "Sell") return "SELL";
  return null; // Dividends, deposits, fees — skip for now
}

export interface SyncResult {
  accountsSynced: number;
  holdingsSynced: number;
  transactionsAdded: number;
  errors: string[];
}

/** POST — run a full sync from Questrade */
export async function POST() {
  const tokenSetting = await prisma.setting.findUnique({ where: { key: "qt_refresh_token" } });
  const serverSetting = await prisma.setting.findUnique({ where: { key: "qt_api_server" } });

  if (!tokenSetting?.value) {
    return NextResponse.json({ error: "No Questrade token configured" }, { status: 400 });
  }

  const result: SyncResult = {
    accountsSynced: 0,
    holdingsSynced: 0,
    transactionsAdded: 0,
    errors: [],
  };

  try {
    // Refresh the token (old one is invalidated immediately)
    const tokenData = await exchangeRefreshToken(tokenSetting.value);
    const { access_token, refresh_token, api_server } = tokenData;

    // Persist new refresh token + api server
    await prisma.setting.upsert({
      where: { key: "qt_refresh_token" },
      update: { value: refresh_token },
      create: { key: "qt_refresh_token", value: refresh_token },
    });
    await prisma.setting.upsert({
      where: { key: "qt_api_server" },
      update: { value: api_server },
      create: { key: "qt_api_server", value: api_server },
    });

    const activeServer = api_server || serverSetting?.value || "";
    const accounts = await getAccounts(activeServer, access_token);

    // Sync date range: last 365 days
    const endTime = new Date();
    const startTime = new Date();
    startTime.setFullYear(startTime.getFullYear() - 1);

    for (const account of accounts) {
      if (account.status !== "Active") continue;

      const name = portfolioName(account.type, account.number);

      // Upsert portfolio
      const portfolio = await prisma.portfolio.upsert({
        where: { id: `qt-${account.number}` },
        update: { name },
        create: { id: `qt-${account.number}`, name },
      });

      result.accountsSynced++;

      // Sync positions (current holdings)
      try {
        const positions = await getPositions(activeServer, access_token, account.number);
        const syncedTickers = new Set<string>();

        for (const pos of positions) {
          if (!pos.symbol || pos.openQuantity <= 0) continue;

          const currency = pos.symbol.endsWith(".TO") ? "CAD" : "USD";
          await prisma.holding.upsert({
            where: {
              portfolioId_ticker: {
                portfolioId: portfolio.id,
                ticker: pos.symbol,
              },
            },
            update: { name: pos.symbol, quantity: pos.openQuantity, avgCost: pos.averageEntryPrice },
            create: {
              portfolioId: portfolio.id,
              ticker: pos.symbol,
              name: pos.symbol,
              currency,
              quantity: pos.openQuantity,
              avgCost: pos.averageEntryPrice,
            },
          });
          result.holdingsSynced++;
          syncedTickers.add(pos.symbol);
        }

        // Mark holdings no longer in current positions as closed (quantity=0).
        // This handles positions sold before the 365-day activity window (e.g. TLT).
        if (syncedTickers.size > 0) {
          await prisma.holding.updateMany({
            where: {
              portfolioId: portfolio.id,
              ticker: { notIn: [...syncedTickers] },
            },
            data: { quantity: 0 },
          });
        }
      } catch (e: unknown) {
        result.errors.push(`positions ${account.number}: ${e instanceof Error ? e.message : e}`);
      }

      // Sync activities in 30-day chunks (Questrade API limit)
      try {
        const activities: QtActivity[] = [];
        const chunkMs = 30 * 24 * 60 * 60 * 1000;
        let chunkStart = new Date(startTime);
        while (chunkStart < endTime) {
          const chunkEnd = new Date(Math.min(chunkStart.getTime() + chunkMs, endTime.getTime()));
          const chunk = await getActivities(activeServer, access_token, account.number, chunkStart, chunkEnd);
          activities.push(...chunk);
          chunkStart = chunkEnd;
        }

        for (const act of activities) {
          const action = mapAction(act.action);
          if (!action || !act.symbol || act.quantity === 0) continue;

          // Find or create holding
          const holding = await prisma.holding.upsert({
            where: {
              portfolioId_ticker: {
                portfolioId: portfolio.id,
                ticker: act.symbol,
              },
            },
            update: {},
            create: {
              portfolioId: portfolio.id,
              ticker: act.symbol,
              name: act.symbol,
              currency: act.currency === "CAD" ? "CAD" : "USD",
            },
          });

          // Dedupe: skip if a transaction with same date+qty+price+action exists
          const txDate = new Date(act.tradeDate);
          const existing = await prisma.transaction.findFirst({
            where: {
              holdingId: holding.id,
              action,
              date: txDate,
              quantity: Math.abs(act.quantity),
              price: Math.abs(act.price),
            },
          });

          if (!existing) {
            await prisma.transaction.create({
              data: {
                holdingId: holding.id,
                action,
                date: txDate,
                quantity: Math.abs(act.quantity),
                price: Math.abs(act.price),
                commission: Math.abs(act.commission ?? 0),
                notes: act.description || null,
              },
            });
            result.transactionsAdded++;
          }
        }
      } catch (e: unknown) {
        result.errors.push(`activities ${account.number}: ${e instanceof Error ? e.message : e}`);
      }
    }

    // Save last sync time
    const now = new Date().toISOString();
    await prisma.setting.upsert({
      where: { key: "qt_last_sync" },
      update: { value: now },
      create: { key: "qt_last_sync", value: now },
    });

    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, result }, { status: 500 });
  }
}
