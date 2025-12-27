import { z } from "zod";
import { TRANSACTION_TYPES } from "@/types";

export const createTransactionSchema = z.object({
  accountId: z.string().min(1, "Account is required"),
  ticker: z
    .string()
    .min(1, "Ticker is required")
    .max(10)
    .transform((v) => v.toUpperCase()),
  type: z.enum(TRANSACTION_TYPES),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  price: z.coerce.number().nonnegative("Price cannot be negative"),
  fee: z.coerce.number().nonnegative().default(0),
  tradeDate: z.coerce.date(),
  note: z.string().max(500).optional(),
});

export const transactionFilterSchema = z.object({
  accountId: z.string().optional(),
  ticker: z.string().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type CreateTransactionInput = z.input<typeof createTransactionSchema>;
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;
