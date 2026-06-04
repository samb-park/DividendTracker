/**
 * Broker integration layer (read-only, server-side only).
 *
 * Adapters read credentials from server env vars ONLY — keys never reach the
 * client. Each adapter reports its config/implementation status honestly so the
 * UI shows "연동 필요 / 미구현" rather than fabricated holdings.
 */

export interface BrokerPosition {
  symbol: string;
  quantity: number;
  avgPrice: number | null;
  marketValue: number | null;
  currency: string;
}

export interface BrokerStatus {
  id: string;
  name: string;
  /** adapter logic exists (vs. a documented-but-unimplemented stub) */
  implemented: boolean;
  /** required env vars are all present */
  configured: boolean;
  requiredEnv: string[];
  note?: string;
}

export interface BrokerAdapter {
  id: string;
  name: string;
  requiredEnv: string[];
  implemented: boolean;
  note?: string;
  isConfigured(): boolean;
  /** Throws if not configured/implemented; never returns fabricated data. */
  listPositions(): Promise<BrokerPosition[]>;
}
