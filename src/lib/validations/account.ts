import { z } from "zod";
import { BROKERS, CURRENCIES } from "@/types";

export const createAccountSchema = z.object({
  broker: z.enum(BROKERS),
  name: z.string().min(1, "Name is required").max(100),
  currency: z.enum(CURRENCIES),
});

export const updateAccountSchema = createAccountSchema.partial();

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
