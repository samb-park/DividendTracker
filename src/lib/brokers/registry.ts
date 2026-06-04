import type { BrokerAdapter, BrokerStatus } from "./types";
import { alpacaAdapter } from "./alpaca";

/**
 * Stub adapters for brokers that need infra beyond simple env keys (a local
 * gateway for IBKR; OAuth token flow for KIS). They are documented and report
 * honest status, but never fabricate holdings — listPositions throws until
 * implemented in a later slice.
 */
function stub(
  id: string,
  name: string,
  requiredEnv: string[],
  note: string
): BrokerAdapter {
  return {
    id,
    name,
    requiredEnv,
    implemented: false,
    note,
    isConfigured: () => false,
    listPositions: async () => {
      throw new Error(`${name} adapter not implemented`);
    },
  };
}

const ibkrAdapter = stub(
  "ibkr",
  "Interactive Brokers",
  ["IBKR_GATEWAY_URL"],
  "Client Portal Gateway(로컬 인증 세션) 필요 — 후속 슬라이스."
);

const kisAdapter = stub(
  "kis",
  "한국투자증권",
  ["KIS_APP_KEY", "KIS_APP_SECRET", "KIS_ACCOUNT"],
  "OAuth 토큰 발급 + 계좌번호 필요 — 후속 슬라이스."
);

export const brokers: BrokerAdapter[] = [alpacaAdapter, ibkrAdapter, kisAdapter];

export function getBroker(id: string): BrokerAdapter | undefined {
  return brokers.find((b) => b.id === id);
}

export function brokerStatuses(): BrokerStatus[] {
  return brokers.map((b) => ({
    id: b.id,
    name: b.name,
    implemented: b.implemented,
    configured: b.isConfigured(),
    requiredEnv: b.requiredEnv,
    note: b.note,
  }));
}
