/**
 * Questrade API client
 *
 * Auth flow:
 * 1. User pastes a refresh token (generated on Questrade > My Account > App Hub)
 * 2. We exchange it for an access_token + new refresh_token + api_server URL
 * 3. The NEW refresh token must be saved — Questrade invalidates the old one immediately
 */

export interface QtTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string; // ← save this; old one is now dead
  api_server: string;    // e.g. "https://api01.iq.questrade.com/"
}

export interface QtAccount {
  number: string;        // account number (used in API calls)
  type: string;          // "TFSA", "RRSP", "Margin", etc.
  status: string;        // "Active"
  isPrimary: boolean;
  isBilling: boolean;
  clientAccountType: string;
}

export interface QtPosition {
  symbol: string;
  symbolId: number;
  openQuantity: number;
  currentMarketValue: number;
  currentPrice: number;
  averageEntryPrice: number;
  closedPnl: number;
  openPnl: number;
  totalCost: number;
  isRealTime: boolean;
  isUnderReorg: boolean;
}

export interface QtActivity {
  tradeDate: string;
  transactionDate: string;
  settlementDate: string;
  action: string;        // "Buy", "Sell", "Dividends", "Deposits", etc.
  symbol: string;
  symbolId: number;
  description: string;
  currency: string;
  quantity: number;
  price: number;
  grossAmount: number;
  commission: number;
  netAmount: number;
  type: string;          // "Trades", "Dividends", etc.
}

export interface QtBalance {
  currency: string;
  cash: number;
  marketValue: number;
  totalEquity: number;
}

const QT_TIMEOUT_MS = 20000;

export async function getBalances(
  apiServer: string,
  accessToken: string,
  accountNumber: string
): Promise<QtBalance[]> {
  const res = await fetch(`${apiServer}v1/accounts/${accountNumber}/balances`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(QT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`getBalances failed: ${res.status}`);
  const data = await res.json();
  return data.perCurrencyBalances ?? [];
}

export async function exchangeRefreshToken(refreshToken: string): Promise<QtTokenResponse> {
  const url = `https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;
  const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(QT_TIMEOUT_MS) });
  if (!res.ok) {
    let message = `Questrade auth failed (${res.status})`;
    try {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json.error_description) message = json.error_description;
        else if (json.message) message = json.message;
        else if (json.error) message = `${json.error}${json.error_description ? ": " + json.error_description : ""}`;
        else if (text) message += ` — ${text.slice(0, 200)}`;
      } catch {
        if (text) message += ` — ${text.slice(0, 200)}`;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}

export async function getAccounts(apiServer: string, accessToken: string): Promise<QtAccount[]> {
  const res = await fetch(`${apiServer}v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(QT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`getAccounts failed: ${res.status}`);
  const data = await res.json();
  return data.accounts ?? [];
}

export async function getPositions(
  apiServer: string,
  accessToken: string,
  accountNumber: string
): Promise<QtPosition[]> {
  const res = await fetch(`${apiServer}v1/accounts/${accountNumber}/positions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(QT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`getPositions failed: ${res.status}`);
  const data = await res.json();
  return data.positions ?? [];
}

export async function getActivities(
  apiServer: string,
  accessToken: string,
  accountNumber: string,
  startTime: Date,
  endTime: Date
): Promise<QtActivity[]> {
  const start = startTime.toISOString();
  const end = endTime.toISOString();
  const res = await fetch(
    `${apiServer}v1/accounts/${accountNumber}/activities?startTime=${start}&endTime=${end}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(QT_TIMEOUT_MS) }
  );
  if (!res.ok) throw new Error(`getActivities failed: ${res.status}`);
  const data = await res.json();
  return data.activities ?? [];
}
