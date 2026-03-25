import { prisma } from "@/lib/db";
import {
  exchangeRefreshToken,
  getAccounts,
  getPositions,
  getActivities,
  getBalances,
  QtActivity,
} from "@/lib/questrade";
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto";

export interface SyncResult {
  accountsSynced: number;
  holdingsSynced: number;
  transactionsAdded: number;
  cashTransactionsAdded: number;
  errors: string[];
}

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

function mapAccountType(qtType: string): "TFSA" | "RRSP" | "FHSA" | "NON_REG" {
  if (qtType === "TFSA") return "TFSA";
  if (qtType === "RRSP") return "RRSP";
  if (qtType === "FHSA") return "FHSA";
  return "NON_REG";
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

/** Core Questrade sync logic — callable from both the UI route and the cron job */
export async function runQuestradeSync(userId?: string): Promise<SyncResult> {
  const tokenKey = userId ? `${userId}:qt_refresh_token` : "qt_refresh_token";
  const serverKey = userId ? `${userId}:qt_api_server` : "qt_api_server";
  const lastSyncKey = userId ? `${userId}:qt_last_sync` : "qt_last_sync";

  const tokenSetting = await prisma.setting.findUnique({ where: { key: tokenKey } });
  const serverSetting = await prisma.setting.findUnique({ where: { key: serverKey } });

  if (!tokenSetting?.value) {
    throw new Error("No Questrade token configured");
  }

  // Decrypt the stored token (support legacy plaintext tokens transparently)
  const rawToken = isEncrypted(tokenSetting.value)
    ? decrypt(tokenSetting.value)
    : tokenSetting.value;

  // Re-encrypt legacy plaintext tokens immediately
  if (!isEncrypted(tokenSetting.value)) {
    await prisma.setting.update({
      where: { key: tokenKey },
      data: { value: encrypt(rawToken) },
    });
  }

  const result: SyncResult = {
    accountsSynced: 0,
    holdingsSynced: 0,
    transactionsAdded: 0,
    cashTransactionsAdded: 0,
    errors: [],
  };

  const tokenData = await exchangeRefreshToken(rawToken);
  const { access_token, refresh_token, api_server } = tokenData;

  // Validate api_server domain to prevent SSRF
  const allowedDomains = ["questrade.com", "questrade-beta.com"];
  let apiServerUrl: URL;
  try {
    apiServerUrl = new URL(api_server);
  } catch {
    throw new Error("Invalid api_server URL returned from Questrade");
  }
  const hostname = apiServerUrl.hostname.toLowerCase();
  if (!allowedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
    throw new Error(`Untrusted api_server domain: ${hostname}`);
  }

  await prisma.setting.upsert({
    where: { key: tokenKey },
    update: { value: encrypt(refresh_token) },
    create: { key: tokenKey, value: encrypt(refresh_token) },
  });
  await prisma.setting.upsert({
    where: { key: serverKey },
    update: { value: api_server },
    create: { key: serverKey, value: api_server },
  });

  const activeServer = api_server || serverSetting?.value || "";
  const accounts = await getAccounts(activeServer, access_token);

  const endTime = new Date();
  // Default: fetch 1 year back; if last sync exists, start from 1 day before it to avoid gaps
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  let startTime = oneYearAgo;
  const lastSyncSetting = await prisma.setting.findUnique({ where: { key: lastSyncKey } });
  if (lastSyncSetting?.value) {
    const lastSync = new Date(lastSyncSetting.value);
    lastSync.setDate(lastSync.getDate() - 1); // 1-day overlap to avoid boundary gaps
    if (lastSync > oneYearAgo) startTime = lastSync;
  }

  for (const account of accounts) {
    if (account.status !== "Active") continue;

    const name = portfolioName(account.type, account.number);
    const portfolio = await prisma.portfolio.upsert({
      where: { id: `qt-${account.number}` },
      update: { name, accountType: mapAccountType(account.type), ...(userId ? { userId } : {}) },
      create: { id: `qt-${account.number}`, name, accountType: mapAccountType(account.type), ...(userId ? { userId } : {}) },
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
            update: { source: "questrade" },
            create: {
              portfolioId: portfolio.id,
              ticker: act.symbol,
              name: act.symbol,
              currency: act.currency === "CAD" ? "CAD" : "USD",
              source: "questrade",
            },
          });

          const txDate = new Date(act.tradeDate);
          const isDividend = action === "DIVIDEND";
          const txQuantity = isDividend ? 1 : Math.abs(act.quantity);
          const txPrice = isDividend ? Math.abs(act.netAmount) : Math.abs(act.price);

          const txResult = await prisma.transaction.createMany({
            data: [{
              holdingId: holding.id,
              action,
              date: txDate,
              quantity: txQuantity,
              price: txPrice,
              commission: isDividend ? 0 : Math.abs(act.commission ?? 0),
              source: "questrade",
              notes: act.description || null,
            }],
            skipDuplicates: true,
          });
          result.transactionsAdded += txResult.count;
          continue;
        }

        // --- Cash transactions (DEPOSIT / WITHDRAWAL) ---
        const cashAction = mapCashAction(act.action, act.type, act.netAmount);
        if (!cashAction) continue;
        const amount = Math.abs(act.netAmount);
        if (amount <= 0) continue;

        const cashDate = new Date(act.tradeDate);
        const currency = act.currency === "CAD" ? "CAD" : "USD";

        const cashResult = await prisma.cashTransaction.createMany({
          data: [{
            portfolioId: portfolio.id,
            action: cashAction,
            date: cashDate,
            amount,
            currency,
            notes: act.description || null,
          }],
          skipDuplicates: true,
        });
        result.cashTransactionsAdded += cashResult.count;
      }
    } catch (e: unknown) {
      result.errors.push(`activities ${account.number}: ${e instanceof Error ? e.message : e}`);
    }
  }

  const now = new Date().toISOString();
  await prisma.setting.upsert({
    where: { key: lastSyncKey },
    update: { value: now },
    create: { key: lastSyncKey, value: now },
  });

  return result;
}
