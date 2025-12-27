import { prisma } from "@/lib/db";
import type {
  QuestradeAccount,
  QuestradePosition,
  QuestradeBalance,
  QuestradeActivity,
} from "@/types";

const QUESTRADE_AUTH_URL = "https://login.questrade.com/oauth2";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  api_server: string;
  expires_in: number;
  token_type: string;
}

export class QuestradeClient {
  private accessToken: string;
  private apiServer: string;
  private accountId: string;
  private expiresAt: Date;

  constructor(
    accessToken: string,
    apiServer: string,
    accountId: string,
    expiresAt: Date
  ) {
    this.accessToken = accessToken;
    this.apiServer = apiServer;
    this.accountId = accountId;
    this.expiresAt = expiresAt;
  }

  static async fromAccountId(accountId: string): Promise<QuestradeClient | null> {
    const token = await prisma.questradeToken.findUnique({
      where: { accountId },
    });

    if (!token) {
      return null;
    }

    const client = new QuestradeClient(
      token.accessToken,
      token.apiServer,
      accountId,
      token.expiresAt
    );

    // Check if token needs refresh
    if (new Date() >= token.expiresAt) {
      await client.refreshToken(token.refreshToken);
    }

    return client;
  }

  private async refreshToken(refreshToken: string): Promise<void> {
    const response = await fetch(
      `${QUESTRADE_AUTH_URL}/token?grant_type=refresh_token&refresh_token=${refreshToken}`,
      { method: "POST" }
    );

    if (!response.ok) {
      // Token is invalid, delete it
      await prisma.questradeToken.delete({
        where: { accountId: this.accountId },
      });
      throw new Error("Failed to refresh Questrade token. Please reconnect.");
    }

    const data: TokenResponse = await response.json();

    // Update stored token
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await prisma.questradeToken.update({
      where: { accountId: this.accountId },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        apiServer: data.api_server,
        expiresAt,
      },
    });

    this.accessToken = data.access_token;
    this.apiServer = data.api_server;
    this.expiresAt = expiresAt;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    // Refresh token if expired
    if (new Date() >= this.expiresAt) {
      const token = await prisma.questradeToken.findUnique({
        where: { accountId: this.accountId },
      });
      if (token) {
        await this.refreshToken(token.refreshToken);
      }
    }

    const url = `${this.apiServer}v1${endpoint}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Questrade API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getAccounts(): Promise<QuestradeAccount[]> {
    const data = await this.fetch<{ accounts: QuestradeAccount[] }>("/accounts");
    return data.accounts;
  }

  async getPositions(questradeAccountNumber: string): Promise<QuestradePosition[]> {
    const data = await this.fetch<{ positions: QuestradePosition[] }>(
      `/accounts/${questradeAccountNumber}/positions`
    );
    return data.positions;
  }

  async getBalances(questradeAccountNumber: string): Promise<QuestradeBalance[]> {
    const data = await this.fetch<{
      perCurrencyBalances: QuestradeBalance[];
      combinedBalances: QuestradeBalance[];
    }>(`/accounts/${questradeAccountNumber}/balances`);
    return data.perCurrencyBalances;
  }

  async getActivities(
    questradeAccountNumber: string,
    startDate: Date,
    endDate: Date
  ): Promise<QuestradeActivity[]> {
    const start = startDate.toISOString().split("T")[0];
    const end = endDate.toISOString().split("T")[0];
    const data = await this.fetch<{ activities: QuestradeActivity[] }>(
      `/accounts/${questradeAccountNumber}/activities?startTime=${start}T00:00:00-05:00&endTime=${end}T23:59:59-05:00`
    );
    return data.activities;
  }
}

export async function exchangeRefreshTokenManually(
  refreshToken: string,
  accountId: string
): Promise<void> {
  const response = await fetch(
    `${QUESTRADE_AUTH_URL}/token?grant_type=refresh_token&refresh_token=${refreshToken}`,
    { method: "POST" }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange refresh token: ${error}`);
  }

  const data: TokenResponse = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Upsert token
  await prisma.questradeToken.upsert({
    where: { accountId },
    create: {
      accountId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      apiServer: data.api_server,
      expiresAt,
    },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      apiServer: data.api_server,
      expiresAt,
    },
  });
}

export function getQuestradeAuthUrl(accountId: string): string {
  const clientId = process.env.QUESTRADE_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/questrade/callback`;

  if (!clientId) {
    throw new Error("QUESTRADE_CLIENT_ID is not configured");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state: accountId, // Pass accountId in state to link after callback
  });

  return `${QUESTRADE_AUTH_URL}/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  accountId: string
): Promise<void> {
  const clientId = process.env.QUESTRADE_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/questrade/callback`;

  const response = await fetch(
    `${QUESTRADE_AUTH_URL}/token?grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(redirectUri!)}&client_id=${clientId}`,
    { method: "POST" }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for token: ${error}`);
  }

  const data: TokenResponse = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Upsert token
  await prisma.questradeToken.upsert({
    where: { accountId },
    create: {
      accountId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      apiServer: data.api_server,
      expiresAt,
    },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      apiServer: data.api_server,
      expiresAt,
    },
  });
}

export function mapQuestradeActivityToTransactionType(
  action: string
): string | null {
  const actionLower = action.toLowerCase();

  if (actionLower.includes("buy")) return "BUY";
  if (actionLower.includes("sell")) return "SELL";
  if (actionLower.includes("dividend")) return "DIVIDEND_CASH";
  if (actionLower.includes("reinvest")) return "DIVIDEND_DRIP";
  if (actionLower.includes("transfer") && actionLower.includes("in"))
    return "TRANSFER_IN";
  if (actionLower.includes("transfer") && actionLower.includes("out"))
    return "TRANSFER_OUT";

  // Skip other activity types (fees, interest, etc.)
  return null;
}

// Sync holdings and transactions for an account
export async function syncQuestradeAccount(
  accountId: string,
  syncTransactions = true
): Promise<{ holdingsCount: number; transactionsImported: number }> {
  const { Decimal } = await import("decimal.js");

  const client = await QuestradeClient.fromAccountId(accountId);
  if (!client) {
    throw new Error("Questrade not connected");
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error("Account not found");
  }

  let qtAccountNumber = account.questradeAccountNumber;

  // If no Questrade account number, get the primary one
  if (!qtAccountNumber) {
    const accounts = await client.getAccounts();
    if (accounts.length === 0) {
      throw new Error("No Questrade accounts found");
    }
    const primaryAccount = accounts.find((a) => a.isPrimary) || accounts[0];
    qtAccountNumber = primaryAccount.number;

    await prisma.account.update({
      where: { id: accountId },
      data: { questradeAccountNumber: qtAccountNumber },
    });
  }

  // Sync positions (holdings)
  const positions = await client.getPositions(qtAccountNumber);

  for (const position of positions) {
    if (position.openQuantity <= 0) continue;

    await prisma.holding.upsert({
      where: {
        accountId_ticker: {
          accountId,
          ticker: position.symbol,
        },
      },
      create: {
        accountId,
        ticker: position.symbol,
        quantity: new Decimal(position.openQuantity),
        avgCost: new Decimal(position.averageEntryPrice),
        currency: account.currency,
      },
      update: {
        quantity: new Decimal(position.openQuantity),
        avgCost: new Decimal(position.averageEntryPrice),
        lastUpdatedAt: new Date(),
      },
    });
  }

  // Remove holdings for positions that no longer exist
  const currentTickers = positions
    .filter((p) => p.openQuantity > 0)
    .map((p) => p.symbol);

  await prisma.holding.deleteMany({
    where: {
      accountId,
      ticker: { notIn: currentTickers },
    },
  });

  let transactionCount = 0;

  // Sync transactions if requested
  if (syncTransactions) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const allActivities = [];
    let chunkEnd = new Date(endDate);

    while (chunkEnd > startDate) {
      const chunkStart = new Date(chunkEnd);
      chunkStart.setDate(chunkStart.getDate() - 30);
      if (chunkStart < startDate) {
        chunkStart.setTime(startDate.getTime());
      }

      try {
        const activities = await client.getActivities(
          qtAccountNumber,
          chunkStart,
          chunkEnd
        );
        allActivities.push(...activities);
      } catch (err) {
        console.error(
          `Failed to fetch activities for ${chunkStart.toISOString()} - ${chunkEnd.toISOString()}:`,
          err
        );
      }

      chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() - 1);
    }

    for (const activity of allActivities) {
      const transactionType = mapQuestradeActivityToTransactionType(
        activity.action
      );

      if (!transactionType) continue;
      if (!activity.symbol) continue;

      const tradeDate = new Date(activity.tradeDate);

      // Check if transaction already exists
      const existing = await prisma.transaction.findFirst({
        where: {
          accountId,
          ticker: activity.symbol,
          type: transactionType,
          tradeDate,
          quantity: new Decimal(Math.abs(activity.quantity)),
        },
      });

      if (existing) continue;

      await prisma.transaction.create({
        data: {
          accountId,
          ticker: activity.symbol,
          type: transactionType,
          quantity: new Decimal(Math.abs(activity.quantity)),
          price: new Decimal(Math.abs(activity.price)),
          fee: new Decimal(Math.abs(activity.commission)),
          tradeDate,
          note: `Questrade: ${activity.description}`,
        },
      });

      transactionCount++;
    }
  }

  // Update last synced timestamp
  await prisma.account.update({
    where: { id: accountId },
    data: { lastSyncedAt: new Date() },
  });

  return {
    holdingsCount: positions.filter((p) => p.openQuantity > 0).length,
    transactionsImported: transactionCount,
  };
}
