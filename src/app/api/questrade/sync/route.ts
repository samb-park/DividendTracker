import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  exchangeRefreshToken,
  getAccounts,
  getPositions,
  getActivities,
  getBalances,
  QtActivity,
} from "@/lib/questrade";

export const dynamic = "force-dynamic";

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

function mapAction(action: string, type: string): "BUY" | "SELL" | "DIVIDEND" | null {
  if (action === "Buy") return "BUY";
  if (action === "Sell") return "SELL";
  if (
    type === "Dividends" ||
    action === "Dividends" ||
    action === "Dividend" ||
    action === "DIV" ||
    action === "XDIV"
  ) return "DIVIDEND";
  return null;
}

function mapCashAction(action: string, type: string, netAmount: number): "DEPOSIT" | "WITHDRAWAL" | null {
  if (type === "Deposits" || action === "DEP" || action === "Deposit") {
    return netAmount >= 0 ? "DEPOSIT" : "WITHDRAWAL";
  }
  if (type === "Withdrawals" || action === "WDR" || action === "Withdrawal") {
    return "WITHDRAWAL";
  }
  return null;
}

export interface SyncResult {
  accountsSynced: number;
  holdingsSynced: number;
  transactionsAdded: number;
  cashTransactionsAdded: number;
  errors: string[];
}

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
    cashTransactionsAdded: 0,
    errors: [],
  };

  try {
    const tokenData = await exchangeRefreshToken(tokenSetting.value);
    const { access_token, refresh_token, api_server } = tokenData;

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

    const endTime = new Date();
    const startTime = new Date();
    startTime.setFullYear(startTime.getFullYear() - 1);

    for (const account of accounts) {
      if (account.status !== "Active") continue;

      const name = portfolioName(account.type, account.number);
      const portfolio = await prisma.portfolio.upsert({
        where: { id: `qt-${account.number}` },
        update: { name },
        create: { id: `qt-${account.number}`, name },
      });

      result.accountsSynced++;

      try {
        const balances = await getBalances(activeServer, access_token, account.number);
        const cadBal = balances.find((b) => b.currency === "CAD");
        const usdBal = balances.find((b) => b.currency === "USD");
        await prisma.portfolio.update({
          where: { id: portfolio.id },
          data: { cashCAD: cadBal?.cash ?? 0, cashUSD: usdBal?.cash ?? 0 },
        });
      } catch (e: unknown) {
        result.errors.push(`balances ${account.number}: ${e instanceof Error ? e.message : e}`);
      }

      try {
        const positions = await getPositions(activeServer, access_token, account.number);
        const syncedTickers = new Set<string>();

        for (const pos of positions) {
          if (!pos.symbol || pos.openQuantity <= 0) continue;
          const currency = pos.symbol.endsWith(".TO") ? "CAD" : "USD";
          await prisma.holding.upsert({
            where: { portfolioId_ticker: { portfolioId: portfolio.id, ticker: pos.symbol } },
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

        if (syncedTickers.size > 0) {
          await prisma.holding.updateMany({
            where: { portfolioId: portfolio.id, ticker: { notIn: [...syncedTickers] } },
            data: { quantity: 0 },
          });
        }
      } catch (e: unknown) {
        result.errors.push(`positions ${account.number}: ${e instanceof Error ? e.message : e}`);
      }

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
          // --- Stock transactions (BUY / SELL / DIVIDEND) ---
          const action = mapAction(act.action, act.type);
          if (action && act.symbol) {
            if (action !== "DIVIDEND" && act.quantity === 0) continue;
            if (action === "DIVIDEND" && act.netAmount <= 0) continue;

            const holding = await prisma.holding.upsert({
              where: { portfolioId_ticker: { portfolioId: portfolio.id, ticker: act.symbol } },
              update: {},
              create: {
                portfolioId: portfolio.id,
                ticker: act.symbol,
                name: act.symbol,
                currency: act.currency === "CAD" ? "CAD" : "USD",
              },
            });

            const txDate = new Date(act.tradeDate);
            const isDividend = action === "DIVIDEND";
            const txQuantity = isDividend ? 1 : Math.abs(act.quantity);
            const txPrice = isDividend ? Math.abs(act.netAmount) : Math.abs(act.price);

            const existing = await prisma.transaction.findFirst({
              where: { holdingId: holding.id, action, date: txDate, quantity: txQuantity, price: txPrice },
            });
            if (!existing) {
              await prisma.transaction.create({
                data: {
                  holdingId: holding.id,
                  action,
                  date: txDate,
                  quantity: txQuantity,
                  price: txPrice,
                  commission: isDividend ? 0 : Math.abs(act.commission ?? 0),
                  notes: act.description || null,
                },
              });
              result.transactionsAdded++;
            }
            continue;
          }

          // --- Cash transactions (DEPOSIT / WITHDRAWAL) ---
          const cashAction = mapCashAction(act.action, act.type, act.netAmount);
          if (!cashAction) continue;
          const amount = Math.abs(act.netAmount);
          if (amount <= 0) continue;

          const cashDate = new Date(act.tradeDate);
          const currency = act.currency === "CAD" ? "CAD" : "USD";

          const existingCash = await prisma.cashTransaction.findFirst({
            where: { portfolioId: portfolio.id, action: cashAction, date: cashDate, amount, currency },
          });
          if (!existingCash) {
            await prisma.cashTransaction.create({
              data: {
                portfolioId: portfolio.id,
                action: cashAction,
                date: cashDate,
                amount,
                currency,
                notes: act.description || null,
              },
            });
            result.cashTransactionsAdded++;
          }
        }
      } catch (e: unknown) {
        result.errors.push(`activities ${account.number}: ${e instanceof Error ? e.message : e}`);
      }
    }

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
