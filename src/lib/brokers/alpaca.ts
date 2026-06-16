import type { BrokerAdapter, BrokerPosition } from "./types";

/**
 * Alpaca read-only adapter. Live as soon as APCA_API_KEY_ID / APCA_API_SECRET_KEY
 * are set in server env. Defaults to the paper endpoint; override with
 * ALPACA_BASE_URL=https://api.alpaca.markets for live accounts.
 * Docs: https://docs.alpaca.markets/reference/getallopenpositions
 */

const REQUIRED_ENV = ["APCA_API_KEY_ID", "APCA_API_SECRET_KEY"];

function creds(): { id?: string; secret?: string; base: string } {
  return {
    id: process.env.APCA_API_KEY_ID?.trim(),
    secret: process.env.APCA_API_SECRET_KEY?.trim(),
    base: process.env.ALPACA_BASE_URL?.trim() || "https://paper-api.alpaca.markets",
  };
}

interface AlpacaPositionRaw {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  market_value: string;
}

export const alpacaAdapter: BrokerAdapter = {
  id: "alpaca",
  name: "Alpaca",
  requiredEnv: REQUIRED_ENV,
  implemented: true,
  note: "읽기 전용 포지션 조회. 기본 paper 엔드포인트(ALPACA_BASE_URL로 live 전환).",

  isConfigured() {
    const { id, secret } = creds();
    return !!(id && secret);
  },

  async listPositions(): Promise<BrokerPosition[]> {
    const { id, secret, base } = creds();
    if (!id || !secret) throw new Error("Alpaca not configured");

    const res = await fetch(`${base}/v2/positions`, {
      headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Alpaca API ${res.status}: ${body.slice(0, 200)}`);
    }
    const raw = (await res.json()) as AlpacaPositionRaw[];
    return raw.map((p) => ({
      symbol: p.symbol,
      quantity: Number.parseFloat(p.qty),
      avgPrice: p.avg_entry_price != null ? Number.parseFloat(p.avg_entry_price) : null,
      marketValue: p.market_value != null ? Number.parseFloat(p.market_value) : null,
      currency: "USD",
    }));
  },
};
