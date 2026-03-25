/**
 * dividendhistory.org — free dividend data source (primary)
 * Provides confirmed + estimated upcoming ex-dividend dates, payment dates, and amounts
 */

export interface NasdaqDividendData {
  exDividendDate: string | null; // YYYY-MM-DD (upcoming or most recent)
  paymentDate: string | null;    // YYYY-MM-DD
  amount: number | null;         // per-share dividend amount
  history: Array<{ date: string; amount: number }>; // ascending, for frequency detection
}

// 4-hour cache
const cache = new Map<string, { data: NasdaqDividendData; fetchedAt: number }>();
const TTL = 4 * 60 * 60 * 1000;

function extractTdValues(rowHtml: string): string[] {
  const cells: string[] = [];
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = tdRegex.exec(rowHtml)) !== null) {
    cells.push(match[1].replace(/<[^>]+>/g, "").trim());
  }
  return cells;
}

function parseAmount(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
}

export async function getNasdaqDividend(ticker: string): Promise<NasdaqDividendData | null> {
  // Skip Canadian tickers with exchange suffixes not on this site
  const cleanTicker = ticker.replace(/\.(TO|TSX|V|CN)$/i, "");
  const isCanadian = /\.(TO|TSX|V|CN)$/i.test(ticker);

  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.fetchedAt < TTL) return hit.data;

  try {
    const url = `https://dividendhistory.org/payout/${cleanTicker}/`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;

    const html = await resp.text();
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];

    type ParsedRow = { exDate: string; payDate: string | null; amount: number; isEstimated: boolean };
    const parsed: ParsedRow[] = [];

    for (const row of rows) {
      const cells = extractTdValues(row);
      if (cells.length < 3) continue;

      const [exDate, payDate, amountStr] = cells;
      // Validate YYYY-MM-DD format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(exDate)) continue;

      const amount = parseAmount(amountStr);
      if (amount === null || amount <= 0) continue;

      const isEstimated = cells[3]?.toLowerCase().includes("estimated") ?? false;
      parsed.push({ exDate, payDate: /^\d{4}-\d{2}-\d{2}$/.test(payDate) ? payDate : null, amount, isEstimated });
    }

    if (parsed.length === 0) return null;

    const today = new Date().toISOString().split("T")[0];

    // Sort ascending for history + finding nearest upcoming date
    const ascending = [...parsed].sort((a, b) => a.exDate.localeCompare(b.exDate));
    // Sort descending for finding most recent past date
    const descending = [...parsed].sort((a, b) => b.exDate.localeCompare(a.exDate));

    // Prefer NEAREST confirmed upcoming, then nearest estimated upcoming, then most recent past
    const best =
      ascending.find((r) => r.exDate >= today && !r.isEstimated) ??
      ascending.find((r) => r.exDate >= today) ??
      descending[0];

    const data: NasdaqDividendData = {
      exDividendDate: best.exDate,
      paymentDate: best.payDate,
      amount: best.amount,
      history: ascending
        .filter((r) => !r.isEstimated) // only confirmed history for frequency detection
        .map((r) => ({ date: r.exDate, amount: r.amount })),
    };

    // Suppress unused variable warning for isCanadian
    void isCanadian;

    cache.set(ticker, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return null;
  }
}
