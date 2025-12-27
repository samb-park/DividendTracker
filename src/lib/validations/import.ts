import { z } from "zod";
import { TRANSACTION_TYPES, type TransactionType } from "@/types";

export interface ColumnMapping {
  ticker: string;
  type: string;
  quantity: string;
  price: string;
  fee?: string;
  tradeDate: string;
  note?: string;
}

export const brokerMappings: Record<string, ColumnMapping> = {
  WEALTHSIMPLE: {
    ticker: "Symbol",
    type: "Transaction Type",
    quantity: "Quantity",
    price: "Price",
    fee: "Commission",
    tradeDate: "Date",
    note: "Description",
  },
  QUESTRADE: {
    ticker: "Symbol",
    type: "Action",
    quantity: "Quantity",
    price: "Price",
    fee: "Commission",
    tradeDate: "Transaction Date",
    note: "Description",
  },
};

const typeMapping: Record<string, TransactionType> = {
  buy: "BUY",
  sell: "SELL",
  dividend: "DIVIDEND_CASH",
  "reinvested dividend": "DIVIDEND_DRIP",
  drip: "DIVIDEND_DRIP",
  "dividend reinvestment": "DIVIDEND_DRIP",
  "transfer in": "TRANSFER_IN",
  "transfer out": "TRANSFER_OUT",
  deposit: "TRANSFER_IN",
  withdrawal: "TRANSFER_OUT",
  "stock split": "SPLIT",
  split: "SPLIT",
};

export function mapTransactionType(raw: string): TransactionType | null {
  const normalized = raw.toLowerCase().trim();
  return typeMapping[normalized] || null;
}

export const importRowSchema = z.object({
  ticker: z.string().min(1),
  type: z.enum(TRANSACTION_TYPES),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  fee: z.number().nonnegative().optional().default(0),
  tradeDate: z.string(),
  note: z.string().optional(),
});

export const importCommitSchema = z.object({
  accountId: z.string().min(1),
  transactions: z.array(importRowSchema),
});

export type ImportRow = z.infer<typeof importRowSchema>;
export type ImportCommit = z.infer<typeof importCommitSchema>;
